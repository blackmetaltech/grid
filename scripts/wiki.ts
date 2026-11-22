// Player wiki generator: site/wiki/*.html from the game's own text (work orders, radio lines, coach steps and their "why",
// the Career districts, projects and endings). GRID has no Codex screen yet, so the wiki is built from what a player reads
// in the build. Run `pnpm wiki` to write it; src/wiki.test.ts fails in CI when the committed pages are stale.
import { t } from '../src/i18n';
import { LEVEL_SPECS } from '../src/level';
import { LEVELS } from '../src/levels';
import { CHARTER_IDS } from '../src/career/data';

/** Chapter number → title (the job board's headings) and a real screenshot from docs/readme. */
export const CHAPTERS: { n: number; title: string; intro: string; shot?: [string, string] }[] = [
  { n: 0, title: 'Prologue', intro: 'The night the lights went out on Saltmarsh Island, and the first work order.', shot: ['workorder.jpg', 'A work order: the place, the radio, the goal and the three lamps'] },
  { n: 1, title: 'Chapter 1 · The Island', intro: 'A DC bench: Ohm\'s law, cable resistance and the price of distance, from a battery hut to a hamlet.', shot: ['bench.jpg', 'L01 First Light: a battery hut and ten homes on the beach'] },
  { n: 2, title: 'Chapter 2 · Alternating Current, the Mainland', intro: 'A surveyed line over a river and a ridge: sag and clearance, pole spans, transformers at each end, salt on the insulators and a sea cable home.', shot: ['river.jpg', 'L05 The River Line: survey a route, then string it'] },
  { n: 3, title: 'Chapter 3 · Phasors and Power Factor', intro: 'A mill full of motors: reactive power, capacitor banks and the harmonics they can ring with.', shot: ['harmonics.jpg', 'L08 Resonance at the Fifth: the harmonic spectrum beside the map'] },
  { n: 4, title: 'Chapter 4 · Three-Phase and Machines', intro: 'Unbalance, star and delta, the generator\'s phasor triangle and the P-δ curve.', shot: ['phasors.jpg', 'L13 Exam Bridge: generator phasors drawn from your answer'] },
  { n: 5, title: 'Chapter 5 · Load Flow and Voltage', intro: 'Per unit, the long line, loop flow and the nose of the P-V curve.', shot: ['nose.jpg', 'L17 Nose of the Curve: the margin before collapse'] },
  { n: 6, title: 'Chapter 6 · Frequency and Renewables', intro: 'Fifty hertz, governors and droop, the duck curve at dusk and inertia.', shot: ['duck.jpg', 'L20 Sun Goes Down: the shift report after the ramp'] },
  { n: 7, title: 'Chapter 7 · Protection and Markets', intro: 'Fault level, inverse-time relays and their coordination, clearing time and the merit order.', shot: ['relays.jpg', 'L24 Coordination: four relay curves and their grading margins'] },
  { n: 8, title: 'Chapter 8 · Distribution', intro: 'A junior engineer\'s feeder work: voltage drop down 16 km, SAIFI and SAIDI, recloser-fuse coordination, N-1 at a primary and rooftop solar.', shot: ['tcc.jpg', 'L33 Fuse Saving: recloser and fuse curves on a time-current chart'] },
  { n: 9, title: 'Finale · Keep the Lights On', intro: 'The whole province for three days: a heatwave, a storm that trips a line, a unit and a transformer, and a holiday of full sun and no factories.', shot: ['report.jpg', 'The finale won: three lamps on the shift report'] },
];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A rendered string, or '' when it still carries a run-time {placeholder} (those need the player's own numbers). */
const tx = (key: string, p?: Record<string, unknown>): string => { const s = t(key, p as Record<string, number>); return s === key || /\{[a-zA-Z]+\}/.test(s) ? '' : s; };
const words = (slug: string): string => slug.replace(/-/g, ' ');

function page(title: string, desc: string, body: string, crumbs: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · GRID wiki</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="../base.css">
<link rel="stylesheet" href="wiki.css">
</head>
<body class="wiki">
<header class="nav"><a class="logo" href="../">GRID</a><nav><a href="./">Wiki</a><a href="career.html">Career</a><a href="../#download" class="btn mini">Download</a></nav></header>
<main class="wrap">
<p class="crumbs">${crumbs}</p>
${body}
</main>
<footer class="foot wrap"><p>Generated from the game's own text by <code>scripts/wiki.ts</code>. Places, people and companies are fictional; the physics is not. <a href="https://github.com/ixaxaar/grid">Source</a></p></footer>
</body>
</html>
`;
}

function levelHtml(id: string): string {
  const spec = LEVEL_SPECS.find((l) => l.id === id)!;
  const lv = LEVELS.find((l) => l.id === id)!;
  const place = spec.story ? tx(spec.story.placeKey) : '';
  const radio = (spec.story?.lineKeys ?? []).map((k) => tx(k)).filter(Boolean).map((line) => {
    const m = /^([A-Z][A-Z .']+):\s*(.*)$/.exec(line);
    return m ? `<li><b>${esc(m[1]!)}</b> ${esc(m[2]!)}</li>` : `<li>${esc(line)}</li>`;
  });
  const steps = spec.coach.map((c) => [tx(c.textKey), tx(c.whyKey)] as const).filter(([a]) => a).map(([a, w]) => `<li>${esc(a)}${w ? `<span class="why">${esc(w)}</span>` : ''}</li>`);
  const brief = /\{[a-zA-Z]+\}/.test(lv.brief) ? '' : lv.brief;
  return `<article class="level card" id="${id}">
<h3><span class="wo">${id === 'P0' ? 'Prologue' : `WO-${id.slice(1)}`}</span> ${esc(lv.title)}</h3>
${place ? `<p class="place">${esc(place)}</p>` : ''}
${brief ? `<p class="brief">${esc(brief)}</p>` : ''}
${radio.length ? `<h4>On the radio</h4><ul class="radio">${radio.join('')}</ul>` : ''}
${steps.length ? `<h4>Steps</h4><ol class="steps">${steps.join('')}</ol>` : ''}
${spec.concepts.length ? `<p class="tags">${spec.concepts.map((c) => `<span>${esc(words(c))}</span>`).join('')}</p>` : ''}
</article>`;
}

function chapterPage(n: number): string {
  const ch = CHAPTERS.find((c) => c.n === n)!;
  const ids = LEVEL_SPECS.filter((l) => l.chapter === n).map((l) => l.id);
  const prev = CHAPTERS.find((c) => c.n === n - 1), next = CHAPTERS.find((c) => c.n === n + 1);
  const body = `<h1>${esc(ch.title)}</h1>
<p class="lede">${esc(ch.intro)}</p>
${ch.shot ? `<figure class="shot"><img src="../assets/shots/${ch.shot[0]}" alt="${esc(ch.shot[1])}" width="1600" height="900" loading="lazy"><figcaption>${esc(ch.shot[1])}</figcaption></figure>` : ''}
<nav class="toc">${ids.map((id) => `<a href="#${id}">${esc(LEVELS.find((l) => l.id === id)!.title)}</a>`).join('')}</nav>
${ids.map(levelHtml).join('\n')}
<nav class="pager">${prev ? `<a href="chapter-${prev.n}.html">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="chapter-${next.n}.html">${esc(next.title)} →</a>` : '<a href="career.html">Career: The Utility →</a>'}</nav>`;
  return page(ch.title, `${ch.title}: ${ch.intro}`, body, `<a href="./">Wiki</a> / ${esc(ch.title)}`);
}

const KINDS = ['reconductor', 'newFeeder', 'newTransformer', 'tieSwitch', 'remoteSwitch', 'recloser', 'vegetation', 'harden', 'replaceAssets', 'regulator', 'battery', 'demandResponse'];
const ENDINGS = ['chiefEngineer', 'steady', 'bailedOut', 'licenceRevoked'];
const DISTRICT_SHOT: Record<string, [string, string]> = {
  standard: ['home-counties-map.jpg', 'Home Counties: fields, named villages, the hospital on its feeder'],
  city: ['harbour-city-map.jpg', 'Harbour City: city blocks, the harbour and underground cable'],
  moor: ['high-moor-map.jpg', 'High Moor in winter: long lines, snow on the roofs'],
};

function careerPage(): string {
  const districts = CHARTER_IDS.map((id) => {
    const shot = DISTRICT_SHOT[id];
    return `<article class="card district"><h3>${esc(tx(`career.charter.${id}.name`))}</h3><p>${esc(tx(`career.charter.${id}.text`))}</p>${shot ? `<figure class="shot"><img src="../assets/shots/${shot[0]}" alt="${esc(shot[1])}" width="980" height="500" loading="lazy"><figcaption>${esc(shot[1])}</figcaption></figure>` : ''}</article>`;
  }).join('\n');
  const projects = KINDS.map((k) => `<tr><th>${esc(tx(`career.kind.${k}`))}</th><td>${esc(tx(`career.blurb.${k}`))}</td></tr>`).join('');
  const endings = ENDINGS.map((k) => `<tr><th>${esc(tx(`career.endingName.${k}`))}</th><td>${esc(tx(`career.ending.${k}`))}</td></tr>`).join('');
  const body = `<h1>Career: The Utility</h1>
<p class="lede">Ten years, one quarter at a time, as the district engineer for two primary substations and nine feeders: about 40,000 customers in Home Counties, 51,000 in Harbour City, 16,000 on High Moor.</p>
<figure class="shot"><img src="../assets/shots/career-letter.jpg" alt="A letter on the desk: the hospital asks for a promise" width="1400" height="787" loading="lazy"><figcaption>A letter on the desk: each answer shows what it costs before you press it</figcaption></figure>
<h2>The two numbers</h2>
<dl class="terms">
<dt>SAIDI</dt><dd>Minutes off per customer in a year: all the customer-minutes without power, divided by the customers.</dd>
<dt>SAIFI</dt><dd>Power cuts per customer in a year: every customer interruption longer than five minutes (IEEE 1366), divided by the customers.</dd>
<dt>Targets</dt><dd>The regulator pays or fines on the rolling three-year average against target. Every five years the targets reset to what your network should achieve. The licence goes only for a network that cannot meet its targets even in fair weather, three years running.</dd>
</dl>
<h2>Districts</h2>
<p>A career starts in one district. Each pushes a different pressure, and its targets come from its own expected performance, so every one can be won, though not with the same plan. Each ISO week also has one district and seed, the same for everyone.</p>
<div class="grid2">${districts}</div>
<h2>Projects</h2>
<p>Each quarter you pick from a board. Every card shows what it does to expected SAIDI, loading and firm margin before you buy it.</p>
<table class="ledger">${projects}</table>
<h2>How it ends</h2>
<table class="ledger">${endings}</table>`;
  return page('Career: The Utility', 'GRID Career mode: ten years as a district engineer. Districts, projects, SAIDI and SAIFI, and how it ends.', body, '<a href="./">Wiki</a> / Career');
}

function indexPage(): string {
  const chapters = CHAPTERS.map((c) => {
    const ids = LEVEL_SPECS.filter((l) => l.chapter === c.n).map((l) => l.id);
    return `<li><a href="chapter-${c.n}.html"><b>${esc(c.title)}</b></a><span>${ids.map((id) => esc(LEVELS.find((l) => l.id === id)!.title)).join(' · ')}</span></li>`;
  }).join('');
  const body = `<h1>GRID wiki</h1>
<p class="lede">Every work order in the campaign, with its radio lines, its steps and why each one matters, and a guide to the Career.</p>
<h2>How a job works</h2>
<ol class="how">
<li><b>Read the work order.</b> The place, three people on the radio, the goal in plain words, the pass conditions with their numbers and the three lamps you can earn.</li>
<li><b>Build.</b> The tray holds the level's parts, each with its price; the budget tag keeps the running total.</li>
<li><b>Run the day.</b> The lever runs the 24-hour clock. Voltages, loadings and frequency move on the dials and the map.</li>
<li><b>Read the shift report.</b> It explains what happened in your own numbers and what to try next.</li>
</ol>
<h2>The campaign</h2>
<ul class="chapters">${chapters}</ul>
<h2>Career</h2>
<p><a href="career.html">Career: The Utility</a>: districts, projects, the two reliability numbers and the endings.</p>`;
  return page('GRID wiki', 'Player guide to GRID: every work order, its steps and why, and the Career mode.', body, 'Wiki');
}

/** Every wiki page, path relative to site/. */
export function buildWiki(): Record<string, string> {
  const out: Record<string, string> = { 'wiki/index.html': indexPage(), 'wiki/career.html': careerPage() };
  for (const c of CHAPTERS) out[`wiki/chapter-${c.n}.html`] = chapterPage(c.n);
  return out;
}
