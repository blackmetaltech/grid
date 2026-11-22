// The player wiki (site/wiki) is generated from the game's own text by scripts/wiki.ts. This fails when the committed pages
// are stale; `pnpm wiki` (WIKI_WRITE=1) rewrites them.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildWiki } from '../scripts/wiki';

const SITE = join(__dirname, '..', 'site');

describe('wiki', () => {
  const pages = buildWiki(readFileSync(join(SITE, 'index.html'), 'utf8'));
  it('covers every chapter and the Career, with no unrendered keys or placeholders', () => {
    expect(Object.keys(pages).length).toBe(13);
    expect(pages['index.html']).toContain('class="letter card"');
    for (const [p, html] of Object.entries(pages)) {
      expect(html, p).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(html, p).not.toMatch(/>(level|coach|career)\.[A-Za-z0-9.]+</);
    }
  });
  it('every image it references exists', () => {
    for (const html of Object.values(pages)) for (const m of html.matchAll(/src="(?:\.\.\/)?(assets\/[^"]+)"/g)) expect(existsSync(join(SITE, m[1]!)), m[1]).toBe(true);
  });
  it('the committed pages are fresh', () => {
    for (const [p, html] of Object.entries(pages)) {
      const f = join(SITE, p);
      if (process.env.WIKI_WRITE) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); continue; }
      expect(existsSync(f) ? readFileSync(f, 'utf8') === html : false, `${p} is stale: run pnpm wiki`).toBe(true);
    }
  });
});
