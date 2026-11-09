import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintFiles } from '../scripts/lint-strings.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function withFixtures(files: Record<string, string>, body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'grid-lint-'));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('strings-lint', () => {
  it('flags literal prose in TypeScript and GDScript', () => {
    withFixtures(
      {
        'src/bad.ts': "export function f() {\n  fail('The valve is broken');\n}\n",
        'godot/bad.gd': 'func _ready():\n\tlabel.text = "Run the day"\n',
      },
      (root) => {
        const findings = lintFiles(['src', 'godot'], { root });
        expect(findings.length).toBeGreaterThanOrEqual(2);
        expect(findings.map((f) => f.file).sort()).toEqual(['godot/bad.gd', 'src/bad.ts']);
      },
    );
  });

  it('accepts keyed strings and the allow comment', () => {
    withFixtures(
      {
        'src/good.ts': "export function f() {\n  fail(t('valve.broken'));\n  fail('The valve is broken'); // lint-ok\n}\n",
        'godot/good.gd': 'func _ready():\n\tlabel.text = tr("RUN_DAY")\n\tlabel.text = "Run the day"  # lint-ok\n',
      },
      (root) => {
        expect(lintFiles(['src', 'godot'], { root })).toEqual([]);
      },
    );
  });

  it('ignores agent-facing describe text and developer errors', () => {
    withFixtures(
      {
        'src/agent.ts':
          'export const x = {\n  describe: (s: { tick: number }) => `Tick ${s.tick}: the valve is open`,\n};\n' +
          "export function g() {\n  throw new Error('Region has no string');\n}\n",
      },
      (root) => {
        expect(lintFiles(['src'], { root })).toEqual([]);
      },
    );
  });

  it('keeps the repository free of literal strings', () => {
    const lines = lintFiles(['src', 'godot'], { root: repoRoot }).map((f) => `${f.file}:${f.line}: ${f.snippet}`);
    expect(lines.join('\n'), 'literal-string findings').toBe('');
  });
});
