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
  if (/\.json$/.test(base) && existsSync(base)) return '';   // static JSON data (bundled; pure)
  throw new Error(`Cannot resolve '${spec}' from ${from}`);
}

/** Every module reachable from `entry`, plus the bare/node imports found on the way. */
function graph(entry: string) {
  const seen = new Set<string>(); const external: { file: string; spec: string }[] = []; const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!; if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments may say "from" in prose
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const r = resolveImport(f, m[1]!); if (r === '') continue; if (r) todo.push(r); else external.push({ file: f, spec: m[1]! });
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

describe('scores.ts (the weekly-career leaderboard verifier) is server-safe and its samples verify', async () => {
  const g = graph(resolve(SRC, 'scores.ts'));
  it('no node:, bare packages, clock or entropy in its graph', () => {
    expect(g.external).toEqual([]);
    const bad = /\b(process\.|Buffer\b|__dirname|Math\.random|Date\.now|new Date\(|btoa\(|atob\()/;
    const hits = g.files.flatMap((f) => maskNonCode(readFileSync(f, 'utf8')).split('\n').filter((l) => bad.test(l)).map((l) => `${f}: ${l.trim()}`));
    expect(hits.filter((h) => !h.includes('persistence.ts'))).toEqual([]);
  });
  it('every golden sample gives its expected result; boards cover the window; foreign rulesets are refused', async () => {
    const { verifier, WEEKLY_BOARD_WEEKS, weeklyLevelId } = await import('./scores');
    const ctx = { regionRuleset: 'global', budget: () => {} };
    expect(Object.keys(verifier.levels.global)).toHaveLength(WEEKLY_BOARD_WEEKS.length);
    for (const w of WEEKLY_BOARD_WEEKS) expect(verifier.samples.some((s) => s.levelId === weeklyLevelId(w.year, w.week) && s.expect.ok)).toBe(true);
    for (const s of verifier.samples) {
      const r = verifier.verify(s.levelId, s.solutionCode, ctx);
      expect(r.ok, s.levelId).toBe(s.expect.ok);
      if (r.ok && s.expect.ok) expect(r.metrics).toEqual(s.expect.metrics);
    }
    expect(verifier.verify(verifier.samples[0]!.levelId, verifier.samples[0]!.solutionCode, { regionRuleset: 'in', budget: () => {} }).ok).toBe(false);
    expect(verifier.gameVersions).toContain((await import('../package.json')).version);
  }, 300000);
});
