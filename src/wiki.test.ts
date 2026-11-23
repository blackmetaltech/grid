// The player wiki (site/wiki) is generated from the game's own text and data by scripts/wiki.ts. This fails when the committed pages
// are stale or when the wiki says something the build no longer does; `pnpm wiki` (WIKI_WRITE=1) rewrites them.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LEVEL_SPECS } from './level';
import { CHARTER_IDS } from './career/data';
import { CHAPTERS, PLATFORMS, boardHeadings, buildWiki, newLookIds, releaseOf, releasePlatforms } from '../scripts/wiki';

const ROOT = join(__dirname, '..');
const SITE = join(ROOT, 'site');
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('wiki', () => {
  const pages = buildWiki(readFileSync(join(SITE, 'index.html'), 'utf8'));
  const wikiPages = Object.entries(pages).filter(([p]) => p.startsWith('wiki/'));
  it('covers the home, how a job goes, controls, every chapter and the Career, with no unrendered keys or placeholders', () => {
    expect(Object.keys(pages).length).toBe(1 + 4 + CHAPTERS.length);
    expect(Object.keys(pages)).toEqual(expect.arrayContaining(['wiki/index.html', 'wiki/how.html', 'wiki/controls.html', 'wiki/career.html']));
    expect(pages['index.html']).toContain('class="letter card"');
    for (const [p, html] of Object.entries(pages)) {
      expect(html, p).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(html, p).not.toMatch(/>(level|coach|career)\.[A-Za-z0-9.]+</);
      expect(html, p).not.toContain('undefined');
      expect(html, p).not.toContain('NaN');
    }
  });
  it('every image it references exists, has its size and alt text, and loads lazily', () => {
    for (const [p, html] of Object.entries(pages)) {
      const base = p.startsWith('wiki/') ? join(SITE, 'wiki') : SITE;
      for (const m of html.matchAll(/<img ([^>]*)>/g)) {
        const attrs = m[1]!;
        const sm = /\ssrc="([^"]+)"|^src="([^"]+)"/.exec(attrs);
        if (!sm) continue;
        const src = (sm[1] ?? sm[2])!;
        expect(existsSync(join(base, src)), `${p}: ${src}`).toBe(true);
        expect(attrs, `${p}: ${src}`).toMatch(/width="\d+" height="\d+"/);
        expect(attrs, `${p}: ${src}`).toMatch(/alt="[^"]{8,}"/);
        if (p !== 'index.html') expect(attrs, `${p}: ${src}`).toContain('loading="lazy"');   // the site home's first image sits above the fold
      }
    }
  });
  it('the committed pages are fresh', () => {
    for (const [p, html] of Object.entries(pages)) {
      const f = join(SITE, p);
      if (process.env.WIKI_WRITE) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); continue; }
      expect(existsSync(f) ? readFileSync(f, 'utf8') === html : false, `${p} is stale: run pnpm wiki`).toBe(true);
    }
  });
});

describe('wiki home: what is in the game now', () => {
  const home = text(buildWiki()['wiki/index.html']!);
  const jobs = LEVEL_SPECS.filter((l) => l.id !== 'P0');
  it('names the newest release in the CHANGELOG', () => {
    const rel = releaseOf(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'));
    expect(home).toContain(`${rel.version}, "${rel.name}"`);
  });
  it('counts the jobs and districts the build has', () => {
    expect(home).toContain(`A prologue and ${jobs.length} jobs in 8 chapters and a finale`);
    expect(home).toContain(`${['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][CHARTER_IDS.length]} districts`);
  });
  it('lists the new-look and classic jobs from world_view.gd (the jobs board chip), so a job that moves cannot be missed', () => {
    const ids = newLookIds();
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) expect(LEVEL_SPECS.some((l) => l.id === id), `${id} is a job`).toBe(true);
    const pages = buildWiki();
    for (const c of CHAPTERS) {
      const html = pages[`wiki/chapter-${c.n}.html`]!;
      for (const l of LEVEL_SPECS.filter((x) => x.chapter === c.n)) {
        const card = new RegExp(`<article class="level card" id="${l.id}">\\s*<h3>.*?</h3>`, 's').exec(html)![0];
        expect(card, l.id).toContain(ids.includes(l.id) ? 'look new">New look' : 'look classic">Classic look');
      }
    }
  });
  it('lists the platforms the release workflow builds for', () => {
    const built = releasePlatforms();
    if (built) expect(built, 'release.yml builds for another list: update PLATFORMS in scripts/wiki.ts and the line on the home page').toEqual(PLATFORMS);
    expect(home).toContain(`${PLATFORMS.join(' and ')}.`);
  });
  it('says what is planned and not built, and what nobody has checked', () => {
    expect(home).toContain('The campaign is complete. What is not built yet');
    expect(home).toContain('What nobody has checked yet');
  });
});

describe('wiki chapters and jobs', () => {
  const pages = buildWiki();
  it('every chapter says what it teaches, shows a screenshot labelled with its look, and has a pager', () => {
    for (const c of CHAPTERS) {
      const html = pages[`wiki/chapter-${c.n}.html`]!;
      expect(html, `chapter ${c.n}`).toContain('<b>What it teaches.</b>');
      expect(html, `chapter ${c.n}`).toMatch(/<figure class="shot">[\s\S]*?<figcaption>(<b class="look (new|classic)">(New|Classic) look\.<\/b> )/);
      expect(html, `chapter ${c.n}`).toContain('class="pager"');
    }
  });
  it('every job has a goal and a failure section, and no job of the campaign is missing', () => {
    for (const c of CHAPTERS) {
      const html = pages[`wiki/chapter-${c.n}.html`]!;
      for (const l of LEVEL_SPECS.filter((x) => x.chapter === c.n)) {
        const card = new RegExp(`<article class="level card" id="${l.id}">[\\s\\S]*?</article>`).exec(html)?.[0];
        expect(card, `${l.id} has a card`).toBeDefined();
        expect(card, l.id).toContain('<h4>Goal</h4>');
        expect(card, l.id).toContain('<h4>If it fails</h4>');
        expect(card, l.id).toContain('<p class="brief">');
      }
    }
    expect(LEVEL_SPECS.filter((l) => !CHAPTERS.some((c) => c.n === l.chapter)).map((l) => l.id)).toEqual([]);
  });
  it('a job the board files under another heading says so', () => {
    const heading = boardHeadings();
    const html = pages['wiki/chapter-0.html']!;
    expect(heading['P0']).toBeDefined();
    expect(html).toContain('On the job board this job is listed under');
  });
  it('the controls page quotes the pad legend the game shows', () => {
    const ui = readFileSync(join(ROOT, 'godot/ui/grid_strings.gd'), 'utf8');
    const legend = /"PAD_LEGEND_GRID":\s*"([^"]+)"/.exec(ui)![1]!;
    expect(text(pages['wiki/controls.html']!)).toContain(legend.replace(/\s+/g, ' '));
  });
  it('the wiki style keeps text at 16 px or more', () => {
    const css = readFileSync(join(SITE, 'wiki', 'wiki.css'), 'utf8');
    const small = [...css.matchAll(/font(?:-size)?:[^;}]*?\b(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 16).map((m) => m[0]);
    expect(small).toEqual([]);
  });
});
