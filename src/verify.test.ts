// verify.ts must stay importable by the cobanana-scores server (Cloudflare Workers or Node): pure modules only, no node: imports.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskNonCode } from '@core/kit/determinism';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const CORE_TS = resolve(SRC, '../core/ts');

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@core/') ? resolve(CORE_TS, spec.slice(6)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base + '.ts', resolve(base, 'index.ts'), base]) if (existsSync(c) && /\.ts$/.test(c)) return c;
  throw new Error(`Cannot resolve '${spec}' from ${from}`);
}

/** Every module reachable from `entry`, plus the bare/node imports found on the way. */
function graph(entry: string) {
  const seen = new Set<string>(); const external: { file: string; spec: string }[] = []; const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!; if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const r = resolveImport(f, m[1]!); if (r) todo.push(r); else external.push({ file: f, spec: m[1]! });
    }
    if (/\brequire\s*\(/.test(src)) external.push({ file: f, spec: 'require()' });
  }
  return { files: [...seen], external };
}

describe('verify.ts is server-safe', () => {
  const g = graph(resolve(SRC, 'verify.ts'));
  it('imports no node: modules, bare packages or require() (transitively)', () => {
    expect(g.external).toEqual([]);
  });
  it('reaches only pure core modules (no storage adapters, bridge, golden, determinism scanner, tests)', () => {
    const rel = g.files.map((f) => f.replace(SRC, 'src/').replace(CORE_TS, 'core/ts'));
    for (const banned of ['node-storage', 'bridge.ts', 'golden', 'determinism', '.test.', 'test-toys', 'test-packs']) expect(rel.filter((f) => f.includes(banned)), banned).toEqual([]);
    expect(rel).toContain('core/ts/kit/verify.ts'); expect(rel).toContain('core/ts/kit/solution.ts'); expect(rel).toContain('src/game.ts');
  });
  it('no source in the graph touches Node globals or the clock/entropy', () => {
    const bad = /\b(process\.|Buffer\b|__dirname|Math\.random|Date\.now|new Date\(|btoa\(|atob\()/;
    const hits: string[] = [];
    for (const f of g.files) {
      const src = maskNonCode(readFileSync(f, 'utf8')).split('\n');   // comments and string text ignored
      src.forEach((l, i) => { if (bad.test(l)) hits.push(`${f.replace(SRC, 'src/').replace(CORE_TS, 'core/ts')}:${i + 1}: ${l.trim()}`); });
    }
    // persistence.ts reads the clock to stamp saves (never used by the verifier: autosave off, no save action replayed)
    expect(hits.filter((h) => !h.includes('persistence.ts'))).toEqual([]);
  });
});
