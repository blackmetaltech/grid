// Owner rule (bible/09): never sell with "real X" (real physics, real choices, real equations, real conductors...). Say what the player does.
// This scans the player-facing text: engine locales, Godot strings, the site, the wiki, the README and the newest CHANGELOG entry.
// Technical terms that are simply true stay allowed: real power, real part, real and reactive, real time.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const ALLOWED = /^(power|part|parts|and|or|time|-time|component|axis|number line)\b/i;
const files = (dir: string, keep: (f: string) => boolean): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n);
    return statSync(join(ROOT, p)).isDirectory() ? files(p, keep) : keep(n) ? [p] : [];
  });

function hits(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\breal[\s-]+([a-z-]+(?: [a-z]+)?)/gi)) if (!ALLOWED.test(m[1])) out.push(m[0]);
  return out;
}

describe('player-facing text never sells with "real X"', () => {
  const targets = [
    ...files('src/locales', (f) => f.endsWith('.ts')),
    'godot/locales/strings.csv',
    ...files('godot/ui', (f) => /strings\.gd$/.test(f)),
    'site/index.html',
    ...files('site/wiki', (f) => f.endsWith('.html')),
    'README.md',
  ];
  for (const f of targets) {
    it(f, () => {
      let text = readFileSync(join(ROOT, f), 'utf8');
      if (f.endsWith('.ts')) text = text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');   // comments are not player text
      expect(hits(text)).toEqual([]);
    });
  }
  it('the newest CHANGELOG entry', () => {
    const cl = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    const first = cl.slice(cl.indexOf('## ['), cl.indexOf('## [', cl.indexOf('## [') + 4));
    expect(hits(first)).toEqual([]);
  });
});
