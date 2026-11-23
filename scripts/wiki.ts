// Player wiki generator: site/wiki/*.html from the game's own text and data: work orders, radio lines, coach steps and their "why",
// the pass conditions and lamps as the work order shows them, the engine's own failure sentence for a first-try build, the Career
// districts, projects and endings, and the facts on the wiki home (version, chapter and job counts, which jobs draw in the new look).
// GRID has no Codex screen yet, so the wiki is built from what a player reads in the build. Run `pnpm wiki` to write it;
// src/wiki.test.ts fails in CI when the committed pages are stale or say something the build no longer does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../src/i18n';
import { LEVEL_SPECS, specOf } from '../src/level';
import { resolveThresholds, type GridLevelSpec } from '../src/level/spec';
import { runDesign } from '../src/level/run';
import { simParamsOf } from '../src/catalogue';
import { LEVELS } from '../src/levels';
import { CHARTER_IDS, INCENTIVE, MONEY, OVERLOAD, OWNERS } from '../src/career/data';
import { buildDistrict } from '../src/career/district';
import { careerMoney } from '../src/career-game';
import { formatMoney } from '../core/ts/regions';
import { REGIONS } from '../src/regions';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// ---- facts read from the build -------------------------------------------------------------------------------------------------
/** The release the CHANGELOG describes first, e.g. { version: '1.18.0', name: 'Bay and Mainland' }. */
export function releaseOf(changelog: string): { version: string; name: string } {
  const m = /^## \[(\d+\.\d+\.\d+)\] - "([^"]+)"/m.exec(changelog);
  if (!m) throw new Error('CHANGELOG.md: the newest section has no [x.y.z] - "Name" heading');
  return { version: m[1]!, name: m[2]! };
}
/** The jobs drawn in the new 3D look: godot/world/world_view.gd LOOK2_LEVELS and godot/world3d/bench3d.gd LEVELS (every other job carries the Classic
 * chip on the job board, godot/ui/jobs.gd is_classic). */
export function newLookIds(src = read('godot/world/world_view.gd'), bench = read('godot/world3d/bench3d.gd')): string[] {
  const m = /const LOOK2_LEVELS := \[([^\]]*)\]/.exec(src);
  if (!m) throw new Error('world_view.gd: LOOK2_LEVELS not found');
  const b = /const LEVELS := \[([^\]]*)\]/.exec(bench);
  if (!b) throw new Error('bench3d.gd: LEVELS not found');
  return [...`${m[1]!},${b[1]!}`.matchAll(/"([A-Z]\d+)"/g)].map((x) => x[1]!);
}
/** Godot string tables (GDScript dictionaries of "KEY": "text"), unescaped. */
function godotStrings(): Map<string, string> {
  const files = ['godot/ui/grid_strings.gd', ...['career', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'chf'].map((c) => `godot/ui/${c}/${c}_strings.gd`)];
  const out = new Map<string, string>();
  for (const f of files) for (const m of read(f).matchAll(/"([A-Za-z0-9_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) out.set(m[1]!, m[2]!.replace(/\\u00a0/g, ' ').replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/%%/g, '%'));
  return out;
}
const GD = godotStrings();
const gd = (k: string): string => { const v = GD.get(k); if (v === undefined) throw new Error(`Godot string ${k} not found`); return v; };
/** Which chapter heading the in-game job board files each job under (godot/ui/jobs.gd CHAPTERS; a job not listed there sits under "Other jobs"). */
export function boardHeadings(src = read('godot/ui/jobs.gd')): Record<string, string> {
  const block = /const CHAPTERS := \{([\s\S]*?)\}/.exec(src);
  if (!block) throw new Error('jobs.gd: CHAPTERS not found');
  const map: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/"([A-Z]\d+)":\s*"(\w)"/g)) map[m[1]!] = m[2]!;
  return map;
}
/** Platforms the release workflow builds for (its `for p in Linux Windows; do` line). */
export function releasePlatforms(src = read('.github/workflows/release.yml')): string[] | null {
  const m = /for p in ([A-Za-z ]+); do/.exec(src);
  return m ? m[1]!.trim().split(/\s+/) : null;
}
/** What the wiki home says about builds. src/wiki.test.ts fails when release.yml builds for another list. */
export const PLATFORMS = ['Linux', 'Windows', 'macOS'];

/** Jobs of a chapter, in play order. */
const idsOf = (n: number): string[] => LEVEL_SPECS.filter((l) => l.chapter === n).map((l) => l.id);
const jobNo = (id: string): string => (id === 'P0' ? 'Prologue' : `WO-${id.slice(1)}`);
const titleOf = (id: string): string => LEVELS.find((l) => l.id === id)!.title;
/** "WO-01 to WO-03", "WO-04, WO-06" ... */
function ranges(ids: string[]): string {
  const nums = ids.map((i) => Number(i.slice(1))).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < nums.length; ) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j]! + 1) j++; parts.push(j - i >= 2 ? `WO-${String(nums[i]).padStart(2, '0')} to WO-${String(nums[j]).padStart(2, '0')}` : nums.slice(i, j + 1).map((n) => `WO-${String(n).padStart(2, '0')}`).join(', ')); i = j + 1; }
  return parts.join(', ');
}

type Look = 'new' | 'classic' | 'none';
interface Shot { file: string; alt: string; look: Look; /** the file is in site/assets/shots (shared with the home page); otherwise in site/wiki/img */ shared?: boolean }
const shot = (file: string, look: Look, alt: string, shared = false): Shot => ({ file, alt, look, shared });

/** Chapter number → title (the job board's headings), what it teaches, and its screenshots. Screenshots are captures of the released builds from docs/readme and docs/look2. */
export const CHAPTERS: { n: number; title: string; teach: string; shots: Shot[] }[] = [
  { n: 0, title: 'Prologue', teach: 'One breaker closes and a cascading failure puts the lights out. You watch how one trip loads the next line until it trips too.',
    shots: [shot('workorder.jpg', 'classic', 'The paper work order every classic-look job opens with (here The River Line, from an older build). The prologue has no capture of its own on this wiki yet.', true)] },
  { n: 1, title: 'Chapter 1 · The Island', teach: 'Ohm\'s law and cable resistance. You power a hamlet from a battery hut and learn what distance costs in volts, then in watts.',
    shots: [shot('l01.jpg', 'new', 'WO-01 First Light at night: the hut, the first cable and the hamlet\'s windows lit by the voltage they get'), shot('title.jpg', 'new', 'The title: the island bay at dusk, the lighthouse lit and the hamlet waiting for power')] },
  { n: 2, title: 'Chapter 2 · Alternating Current, the Mainland', teach: 'AC lines on the Mainland: sag and clearance, pole spans, transformers at each end, salt on the insulators and a sea cable home.',
    shots: [shot('l05.jpg', 'new', 'WO-05 The River Line in 3D: survey a route over the river and ridge, then string it. Farms, a bridge and the yard at each end')] },
  { n: 3, title: 'Chapter 3 · Phasors and Power Factor', teach: 'A mill full of motors: reactive power, power factor, capacitor banks and the harmonics they can ring with.',
    shots: [shot('mill.jpg', 'new', 'The mill town in the evening: sheds, chimneys and a rail siding, with the harmonic card beside the map')] },
  { n: 4, title: 'Chapter 4 · Three-Phase and Machines', teach: 'Unbalance, star and delta, the generator\'s phasor triangle and the power-angle curve.',
    shots: [shot('phasors.jpg', 'classic', 'WO-13 Exam Bridge: generator phasors drawn from your answer', true)] },
  { n: 5, title: 'Chapter 5 · Load Flow and Voltage', teach: 'Per unit, the long line, loop flow and the nose of the P-V curve.',
    shots: [shot('nose.jpg', 'classic', 'WO-17 Nose of the Curve: the margin before voltage collapses', true)] },
  { n: 6, title: 'Chapter 6 · Frequency and Renewables', teach: 'Fifty hertz, governors and droop, inertia, and the duck curve at dusk when the sun goes down.',
    shots: [shot('duck.jpg', 'classic', 'WO-20 Sun Goes Down: the shift report after the ramp', true)] },
  { n: 7, title: 'Chapter 7 · Protection and Markets', teach: 'Fault level, inverse-time relays and how they grade, clearing time, and the merit order of a market.',
    shots: [shot('relays.jpg', 'classic', 'WO-24 Coordination: four relay curves and their grading margins', true)] },
  { n: 8, title: 'Chapter 8 · Distribution', teach: 'A junior engineer\'s feeder work: voltage drop down 16 km, SAIFI and SAIDI, recloser and fuse coordination, N-1 at a primary and rooftop solar.',
    shots: [shot('tcc.jpg', 'classic', 'WO-33 Fuse Saving: recloser and fuse curves on a time-current chart', true)] },
  { n: 9, title: 'Finale · Keep the Lights On', teach: 'Three days of the whole province: a heatwave, a storm that trips a line, a unit and a transformer, then a holiday of full sun and no factories. You spend one budget and decide during the run.',
    shots: [shot('finale.jpg', 'new', 'WO-28 opens on the harbour and Saltmarsh Island, where the trouble comes'), shot('street-3d.jpg', 'new', 'A town at street level at dusk in the finale', true)] },
];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A rendered string, or '' when it still carries a run-time {placeholder} (those need the player's own numbers). */
const tx = (key: string, p?: Record<string, unknown>): string => { const s = t(key, p as Record<string, number>); return s === key || /\{[a-zA-Z]+\}/.test(s) ? '' : s; };
/** Money as the game shows it in the default region pack (global, US$). */
const money = (m: number): string => formatMoney(careerMoney({ region: 'global' }, m), REGIONS.get('global'), { decimals: 0 });
const words = (slug: string): string => slug.replace(/-/g, ' ');
const num = (x: number): string => String(Number(x.toFixed(3)));
/** A level's own money (budget, lamp costs) in the default pack. */
const levelMoney = (v: number): string => formatMoney(v, REGIONS.get('global'), { decimals: 0 });

// ---- images ----------------------------------------------------------------------------------------------------------------------
/** Width and height of a JPEG, read from its header, so every <img> carries its size. */
function jpegSize(path: string): [number, number] {
  const b = readFileSync(path);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`no size in ${path}`);
}
const LOOK_WORD: Record<Look, string> = { new: 'New look.', classic: 'Classic look.', none: '' };
function figure(s: Shot, prefix = ''): string {
  const rel = s.shared ? `assets/shots/${s.file}` : `wiki/img/${s.file}`;
  const [w, h] = jpegSize(join(ROOT, 'site', rel));
  const src = s.shared ? `../assets/shots/${s.file}` : `img/${s.file}`;
  return `<figure class="shot"><img src="${prefix}${src}" alt="${esc(s.alt)}" width="${w}" height="${h}" loading="lazy" decoding="async"><figcaption>${s.look === 'none' ? '' : `<b class="look ${s.look}">${LOOK_WORD[s.look]}</b> `}${esc(s.alt)}</figcaption></figure>`;
}
const lookChip = (look: 'new' | 'classic'): string => `<span class="look ${look}">${look === 'new' ? 'New look' : 'Classic look'}</span>`;

// ---- pages, in reading order --------------------------------------------------------------------------------------------------
interface PageRef { file: string; title: string }
const ORDER = (): PageRef[] => [
  { file: 'how.html', title: 'How a job goes' }, { file: 'controls.html', title: 'Controls' },
  ...CHAPTERS.map((c) => ({ file: `chapter-${c.n}.html`, title: c.title })), { file: 'career.html', title: 'Career: The Utility' },
];
function pager(file: string): string {
  const o = ORDER(); const i = o.findIndex((p) => p.file === file);
  const prev = i > 0 ? o[i - 1]! : null, next = i < o.length - 1 ? o[i + 1]! : null;
  return `<nav class="pager" aria-label="Pages">${prev ? `<a class="prev" href="${prev.file}"><small>Previous</small>${esc(prev.title)}</a>` : '<a class="prev" href="./"><small>Back to</small>Wiki home</a>'}${next ? `<a class="next" href="${next.file}"><small>Next</small>${esc(next.title)}</a>` : '<a class="next" href="./"><small>Back to</small>Wiki home</a>'}</nav>`;
}

function page(title: string, desc: string, body: string, crumbs: string, file: string): string {
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
<header class="nav"><a class="logo" href="../">GRID</a><nav aria-label="Primary"><a href="./">Wiki</a><a href="how.html">How a job goes</a><a href="controls.html">Controls</a><a href="career.html">Career</a><a href="../#download" class="btn mini">Download</a></nav></header>
<main class="wrap">
<p class="crumbs">${crumbs}</p>
${body}
${file === 'index.html' ? '' : pager(file)}
</main>
<footer class="foot wrap"><p>Generated from the game's own text and data by <code>scripts/wiki.ts</code>. Places, people and companies are fictional; the physics is not. <a href="https://github.com/blackmetaltech/grid">Source</a></p></footer>
</body>
</html>
`;
}

// ---- jobs ---------------------------------------------------------------------------------------------------------------------------
const FAIL_SKIP = new Set(['L13']);   // an exam whose first-try failure sentence prints the answers
const tidy = (s: string): string => s.replace(/\d+\.\d{5,}/g, (x) => String(Number(Number(x).toPrecision(4))));
/** Up to two sentences. */
const short = (s: string): string => { const parts = tidy(s).match(/.*?[.!?](?=\s+[A-Z]|\s*$)/gs) ?? [tidy(s)]; return parts.slice(0, 2).join('').trim(); };
/** "Spend ≤ $X" lamps, as work_order.gd builds them, for the jobs where the lamps are about spend. */
function lampsHtml(spec: GridLevelSpec, th: Record<string, number>): string {
  const fz = spec.frozen?.['global'];
  if (!spec.stars || !fz || spec.id === 'L22' || spec.id === 'L27') return '';
  const scored = spec.histogram === 'score';
  const extra = (list: { key: string; min?: string; max?: string }[]): string[] => {
    const out: string[] = [];
    for (const c of list) {
      const k = c.min ?? c.max; if (!k || !GD.has(`TH_${k}`) || th[k] === undefined) continue;
      let v = th[k]!; if (k === 'loadingMax' || k === 'batteryMarginMin' || k === 'n1Max') v *= 100;
      const f = gd(`TH_${k}`); const s = f.includes('%s') ? f.replace('%s', num(v)) : f;
      const low = s.charAt(0).toLowerCase() + s.slice(1); if (!out.includes(low)) out.push(low);
    }
    return out;
  };
  if (scored || fz.starA <= 0) return `<p class="lamps"><b>Lamps:</b> pass the job; the card says what the second and third ask for.</p>`;
  const e2 = extra(spec.star2 ?? []), e3 = extra(spec.star3);
  if (fz.starA === fz.starB) return `<p class="lamps"><b>Lamps:</b> pass the job; spend at most ${esc(levelMoney(fz.starA))}${e2.length ? ` and ${esc(e2.join(', '))}` : ''}; the third needs the same spend${e3.length ? ` and ${esc(e3.join(', '))}` : ' again'}.</p>`;
  return `<p class="lamps"><b>Lamps:</b> pass the job; spend at most ${esc(levelMoney(fz.starA))}${e2.length ? ` and ${esc(e2.join(', '))}` : ''}; spend at most ${esc(levelMoney(fz.starB))}${e3.length ? ` and ${esc(e3.join(', '))}` : ''}.</p>`;
}

function levelHtml(id: string, look: 'new' | 'classic', heading: Record<string, string>, here: string): string {
  const spec = specOf(id)!;
  const lv = LEVELS.find((l) => l.id === id)!;
  const params = simParamsOf(REGIONS.get('global').data);
  const th = resolveThresholds(spec, params, 'learner');
  const place = spec.story ? tx(spec.story.placeKey) : '';
  const radio = (spec.story?.lineKeys ?? []).map((k) => tx(k)).filter(Boolean).map((line) => {
    const m = /^([A-Z][A-Z .']+):\s*(.*)$/.exec(line);
    return m ? `<li><b>${esc(m[1]!)}</b> ${esc(m[2]!)}</li>` : `<li>${esc(line)}</li>`;
  });
  const steps = spec.coach.map((c) => [tx(c.textKey), tx(c.whyKey)] as const).filter(([a]) => a).map(([a, w]) => `<li>${esc(a)}${w ? `<span class="why">${esc(w)}</span>` : ''}</li>`);
  const brief = tx(spec.briefKey, th);
  const fz = spec.frozen?.['global'];
  const budget = spec.stars && fz && fz.budget > 0 ? `<p class="lamps"><b>Budget:</b> ${esc(levelMoney(fz.budget))}.</p>` : '';
  let fail = '';
  if (!spec.stars) fail = '<p>This job is a scene: it has no pass or fail and awards no lamps.</p>';
  else if (FAIL_SKIP.has(id)) fail = '<p>An answer outside the pass mark fails the job. The report then shows the working, so you can see where yours went off.</p>';
  else { const o = runDesign(spec, 'global', spec.naive.actions); if (o.status === 'lost' && o.reason) fail = `<p>${esc(short(o.reason))}</p><p class="fine-ink">That is the engine's own sentence for a first-try build that misses. Yours will name your numbers.</p>`; }
  const listed = heading[id] ?? 'X';
  const board = listed !== here ? `<p class="board">On the job board this job is listed under "${esc(gd(`JOBS_CH_${listed}`))}".</p>` : '';
  return `<article class="level card" id="${id}">
<h3><span class="wo">${jobNo(id)}</span> ${esc(lv.title)} ${lookChip(look)}</h3>
${place ? `<p class="place">${esc(place)}</p>` : ''}
<h4>Goal</h4>
${brief ? `<p class="brief">${esc(brief)}</p>` : ''}${budget}${lampsHtml(spec, th)}
<h4>If it fails</h4>
${fail}
${board}${radio.length ? `<h4>On the radio</h4><ul class="radio">${radio.join('')}</ul>` : ''}
${steps.length ? `<details class="hints"><summary>Coach steps (hints that show how to build)</summary><ol class="steps">${steps.join('')}</ol></details>` : ''}
${spec.concepts.length ? `<p class="tags">${spec.concepts.map((c) => `<span>${esc(words(c))}</span>`).join('')}</p>` : ''}
</article>`;
}

function chapterPage(n: number): string {
  const ch = CHAPTERS.find((c) => c.n === n)!;
  const ids = idsOf(n);
  const newIds = new Set(newLookIds());
  const heading = boardHeadings();
  const here = n === 9 ? 'F' : String(n);
  const nw = ids.filter((i) => newIds.has(i)), cl = ids.filter((i) => !newIds.has(i));
  const lookLine = cl.length === 0 ? 'All of its jobs are drawn in the new 3D look.' : nw.length === 0 ? 'All of its jobs are in the classic 2D look for now.' : `${ranges(nw)} are drawn in the new 3D look. ${ranges(cl)} ${cl.length === 1 ? 'is a bench and stays' : 'are benches and stay'} in the classic 2D look for now.`;
  const jobs = ids.filter((i) => i !== 'P0');
  const body = `<h1>${esc(ch.title)}</h1>
<p class="lede"><b>What it teaches.</b> ${esc(ch.teach)}</p>
<p class="meta">${n === 0 ? 'One scene.' : `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}: ${ranges(jobs)}.`} ${lookLine}</p>
${ch.shots.map((s) => figure(s)).join('\n')}
<nav class="toc" aria-label="Jobs in this chapter">${ids.map((id) => `<a href="#${id}">${esc(titleOf(id))}</a>`).join('')}</nav>
${ids.map((id) => levelHtml(id, newIds.has(id) ? 'new' : 'classic', heading, here)).join('\n')}`;
  return page(ch.title, `${ch.title}: ${ch.teach}`, body, `<a href="./">Wiki</a> / ${esc(ch.title)}`, `chapter-${n}.html`);
}


/** The hospital's feeder in the README's example career (Home Counties, seed 5). */
const HOSP = (): string => buildDistrict(5, 'standard').story?.hospital ?? 'F1';
/** Home Counties names, as the game passes them to the story strings (career-game.ts storyNames). */
const NAMES = (): Record<string, string> => ({ hospitalName: t('story.hospitalName'), villagesName: t('story.villagesName'), councillor: t('story.councillor'), councillorShort: t('story.councillorShort'), doctor: t('story.doctor'), doctorShort: t('story.doctorShort'), hubPlace: t('story.hubPlace') });
const sx = (key: string, extra: Record<string, unknown> = {}): string => { const s = t(key, { ...NAMES(), hospital: HOSP(), feeder: HOSP(), due: 3, year: 1, ...extra } as unknown as Record<string, number>); if (s === key || /\{[a-zA-Z]+\}/.test(s)) throw new Error(`story text ${key} did not render: ${s}`); return s; };
const PEOPLE: [string, string][] = [['tobi', 'Runs the crews. Asks you to rest them, and remembers when you did not.'], ['vance', 'Finance. Wants the cash to last and the owners paid.'], ['okafor', 'The regulator. Judges your SAIDI and SAIFI, and your plans.'], ['ines', 'Keeps the hospital running on its feeder.'], ['tom', 'Speaks for the villages on the far feeder of the second primary.']];

/** The story block: the five people, the hospital's letter with both answers and what each did, and the ending sheet. */
export function storyHtml(prefix: string): string {
  const people = PEOPLE.map(([k, note]) => `<li><b>${esc(sx(`story.who.${k}`))}</b><span>${esc(note)}</span></li>`).join('');
  return `<div class="story-grid">
<div class="letter card"><p class="letter-title">${esc(sx('story.inesPromise.title'))}</p><p>${esc(sx('story.inesPromise.body'))}</p>
<ul class="answers"><li><b>${esc(sx('story.inesPromise.a'))}</b><span>${esc(sx('story.inesPromise.aRes'))}</span></li><li><b>${esc(sx('story.inesPromise.b'))}</b><span>${esc(sx('story.inesPromise.bRes'))}</span></li></ul>
<p class="fine-ink">Each answer shows its cost before you press it. A promise in writing comes due two years later, and the people remember the answers.</p></div>
<div><ul class="people">${people}</ul>
<figure class="shot"><img src="${prefix}assets/shots/ending-recap.jpg" alt="The ending sheet: ten years told back, year by year, with each answer you gave" width="900" height="900" loading="lazy"><figcaption>The ending sheet tells your ten years back to you.</figcaption></figure></div>
</div>`;
}

const KINDS = ['reconductor', 'newFeeder', 'newTransformer', 'tieSwitch', 'remoteSwitch', 'recloser', 'vegetation', 'harden', 'replaceAssets', 'regulator', 'battery', 'demandResponse'];
const ENDINGS = ['chiefEngineer', 'steady', 'bailedOut', 'licenceRevoked'];
const DISTRICT_SHOT: Record<string, [string, string]> = {
  standard: ['home-counties-map.jpg', 'Home Counties: fields, named villages, the hospital on its feeder'],
  city: ['harbour-city-map.jpg', 'Harbour City: cable routes along a street grid down to the harbour'],
  moor: ['high-moor-map.jpg', 'High Moor: one substation far up the moor, long trunks down the valleys'],
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
${figure(shot('career-glass.jpg', 'none', 'The Career at the start of year 1: the district, the board of projects and the two reliability numbers, in glass panels over a flat map'))}
<figure class="shot"><img src="../assets/shots/career-letter.jpg" alt="A letter on the desk: the hospital asks for a promise" width="1400" height="787" loading="lazy"><figcaption>A letter on the desk: each answer shows what it costs before you press it</figcaption></figure>
<h2>The two numbers</h2>
<dl class="terms">
<dt>SAIDI</dt><dd>Minutes off per customer in a year: all the customer-minutes without power, divided by the customers.</dd>
<dt>SAIFI</dt><dd>Power cuts per customer in a year: every customer interruption longer than five minutes (IEEE 1366), divided by the customers.</dd>
<dt>Owners</dt><dd>At each annual review the owners take ${Math.round(OWNERS.payout * 100)} % of the cash above the reserve (${money(OWNERS.reserveM)} plus ${OWNERS.reserveQuarters} quarters of committed project instalments) as a dividend. Money you do not plan to spend does not stay.</dd>
<dt>Price-control close</dt><dd>Every ${INCENTIVE.periodYears} years, if the network's average health ended below where the period started and the replacement money it was allowed (the asset base over its ${MONEY.lifeYears}-year life) was not all spent, the regulator takes back the unspent part plus ${OWNERS.narmPenaltyPct} %.</dd>
<dt>Overload</dt><dd>Past its cyclic rating a line faults more and ages faster. Past ${OVERLOAD.emergencyPct} % of its rating at the season's peak it cannot carry the load at all: the control room cuts customers in ${OVERLOAD.rotaBlockH}-hour rota blocks, and those count in SAIDI and SAIFI.</dd>
<dt>Targets</dt><dd>The regulator pays or fines on the rolling ${INCENTIVE.rollingYears}-year average against target. Every ${INCENTIVE.periodYears} years the targets reset to what your network should achieve. The licence goes only for a network that cannot meet its targets even in fair weather, ${INCENTIVE.yearsToRevoke} years running.</dd>
</dl>
<h2>The people</h2>\n${storyHtml('../')}\n<h2>Districts</h2>
<p>A career starts in one district. Each pushes a different pressure, and its targets come from its own expected performance, so every one can be won, though not with the same plan. Each ISO week also has one district and seed, the same for everyone.</p>
<div class="grid2">${districts}</div>
<h2>Projects</h2>
<p>Each quarter you pick from a board. Every card shows what it does to expected SAIDI, loading and firm margin before you buy it.</p>
<table class="ledger">${projects}</table>
<h2>How it ends</h2>
<table class="ledger">${endings}</table>`;
  return page('Career: The Utility', 'GRID Career mode: ten years as a district engineer. Districts, projects, SAIDI and SAIFI, and how it ends.', body, '<a href="./">Wiki</a> / Career', 'career.html');
}



// ---- how a job goes, controls ---------------------------------------------------------------------------------------------------
function howPage(): string {
  const body = `<h1>How a job goes</h1>
<p class="lede">Every job is the same four steps. The shots below are the finale, which draws in the new look.</p>
<ol class="how">
<li><b>Read the work order.</b> It opens when you take a job: the place, three people on the radio, the goal in plain words, the pass conditions with their numbers and the three lamps you can earn. The pin on the screen opens it again.</li>
</ol>
${figure(shot('look-job.jpg', 'new', '1. The work order for the finale: the goal, the pass conditions with numbers, and "Take the job".', true))}
<ol class="how" start="2"><li><b>Build.</b> Pick parts from the tray and put them on the map. Each part has a price, and the budget tag keeps the running total. A job over its budget is lost.</li></ol>
${figure(shot('look-build.jpg', 'new', '2. Build. The planning card holds the parts and what the day will bring. The budget is in the corner.', true))}
<ol class="how" start="3"><li><b>Run the day.</b> The lever runs the 24-hour clock in 15-minute blocks, at 1x, 2x or 4x. Voltage, loading and frequency move on the dials and the map. In the new look the windows of a town light by the voltage it gets, and go dark when it loses supply.</li></ol>
${figure(shot('look-run.jpg', 'new', '3. Run the day. The dials show frequency and the clock; towns light as power reaches them.', true))}
<ol class="how" start="4"><li><b>Read the report.</b> It explains what happened in your own numbers and what to try next. A won job shows the lamps you earned. A lost day names the first thing that failed, and Retry starts the job again with your design kept.</li></ol>
${figure(shot('look-report.jpg', 'new', '4. A lost day: the incident report names the first thing that failed and shows the numbers behind it, with the world still visible behind it.', true))}
<h2>The three lamps</h2>
<p>Passing the job lights the first lamp. The second and third ask for less spend, and the third often adds a condition of its own. The lamps are on the work order, with their numbers, before you build.</p>
<h2>Modes</h2>
<ul>
<li><b>Learner</b>: the coach steps and their reasons show as you go.</li>
<li><b>Engineer</b>: per-unit values and stricter limits.</li>
<li><b>Sandbox</b>: just the grid.</li>
</ul>
<p>Cute is a switch in the settings. It adds faces to the drawings; the drawings still follow the numbers.</p>
<h2>Order of jobs</h2>
<p>A job opens when you have passed the one before it. "See the finale" on the job board opens the finale at any time. The jobs board marks every job that still draws in the classic look with a "Classic" chip.</p>`;
  return page('How a job goes', 'The four steps of every GRID job: read the work order, build, run the day, read the report.', body, '<a href="./">Wiki</a> / How a job goes', 'how.html');
}

function controlsPage(): string {
  const pad = (k: string): string => esc(gd(k));
  const body = `<h1>Controls</h1>
<p class="lede">Mouse and keyboard, gamepad, and what each does in the new 3D look and in the classic 2D look.</p>
<h2>Mouse and keyboard</h2>
<div class="tablewrap"><table class="keys"><thead><tr><th>Do</th><th>New look (3D)</th><th>Classic look (2D)</th></tr></thead><tbody>
<tr><td>Pan the map</td><td>Left-drag the ground. Arrow keys also pan.</td><td>Drag. Arrow keys also pan.</td></tr>
<tr><td>Orbit and tilt</td><td>Right-drag or middle-drag, or Shift and left-drag. Q and E turn, Page Up and Page Down tilt.</td><td>Not available.</td></tr>
<tr><td>Zoom</td><td>Mouse wheel, toward the cursor.</td><td>Mouse wheel.</td></tr>
<tr><td>Reset the camera</td><td>0</td><td>0</td></tr>
<tr><td>Single-line diagram</td><td>L shows or hides it over the map.</td><td>Not available.</td></tr>
<tr><td>Run the day</td><td colspan="2">Space pulls the lever (run or pause). The period key (.) steps one 15-minute block. + and − change the run speed.</td></tr>
<tr><td>Pick a part</td><td colspan="2">Click it in the tray, or press 1 to 9 for the part in that place. H picks the hut in chapter 1. Shift and a digit steps a knob down.</td></tr>
<tr><td>Place it</td><td colspan="2">Click a peg. Tab and Shift and Tab walk the pegs, Enter places at the highlighted one.</td></tr>
<tr><td>Take a step back</td><td colspan="2">Backspace takes the last pick back. Esc cancels the pick, or closes an open tag.</td></tr>
<tr><td>Survey a line (chapter 2)</td><td colspan="2">S starts the survey. Click to drop bends. Enter finishes at the nearest yard, Backspace removes the last bend, Tab walks the yards. A right-click finishes or undoes.</td></tr>
<tr><td>Operate a part</td><td colspan="2">Click it to open its tag: breakers, tap changers, capacitor steps, unit commitment. X closes the tag.</td></tr>
<tr><td>Build, Inspect, Timeline</td><td colspan="2">B, I and T open those drawers on the jobs that have them (the grid jobs without the parts tray), and close them again.</td></tr>
</tbody></table></div>
<h2>Gamepad</h2>
<p>The key hints show along the bottom of the screen while a pad is in use:</p>
<ul class="legend">
<li><b>On a job:</b> ${pad('PAD_LEGEND_GRID')}</li>
<li><b>In menus:</b> ${pad('PAD_LEGEND_MENU')}</li>
<li><b>Surveying a line:</b> ${pad('PAD_LEGEND_SURVEY')}</li>
<li><b>Placing a transformer:</b> ${pad('PAD_LEGEND_XF')}</li>
</ul>
<div class="tablewrap"><table class="keys"><thead><tr><th>Do</th><th>Pad</th></tr></thead><tbody>
<tr><td>Pick a part</td><td>LB and RB walk the tray. A picks the part under the ring.</td></tr>
<tr><td>Place it</td><td>The D-pad walks the pegs. A places.</td></tr>
<tr><td>Take a step back</td><td>B undoes the pick, then steps out of the tray, then closes a tag.</td></tr>
<tr><td>Run the day</td><td>X pulls the lever. Back cycles the speed (1x, 2x, 4x) from anywhere.</td></tr>
<tr><td>Open the next tag</td><td>Y.</td></tr>
<tr><td>Move the camera (3D look)</td><td>The left stick pans. The right stick turns (left and right) and zooms (up and down).</td></tr>
<tr><td>Type a number</td><td>A on a number box opens an on-screen number pad.</td></tr>
<tr><td>Menu</td><td>Start.</td></tr>
</tbody></table></div>
<h2>Touch</h2>
<p>One finger pans the map and a tap acts like a click. Two fingers pinch to zoom and turn. Touch has not been checked on a phone in recent releases.</p>`;
  return page('Controls', 'GRID controls for mouse, keyboard and gamepad, in the new 3D look and the classic 2D look.', body, '<a href="./">Wiki</a> / Controls', 'controls.html');
}

// ---- the home page ------------------------------------------------------------------------------------------------------------
/** Not built yet, written plainly. Review with each release: src/wiki.test.ts checks the counts and look lists around it, not this prose. */
export const PLANNED: string[] = [
  'The new 3D look for chapters 4 to 8. Those jobs still draw in the classic 2D look. Chapter 4 is next.',
  'A Career screen laid over the district, with the board as a drawer. Today the Career has the glass panels of the new look on a flat map.',
  'A busier first day in the finale. This is an open item from the 1.18 review.',
];
export const NOT_CHECKED: string[] = [
  'Nobody has listened to the sound. Every cue is made in code and measured, not heard.',
  'The Windows build is made and started on Linux for every release, and has not been played by a person.',
  'The two Mainland map jobs in 3D (WO-05 and WO-29) have been checked by tests and screenshots, not played by hand at full speed.',
];

function nowSection(): string {
  const rel = releaseOf(read('CHANGELOG.md'));
  const newIds = newLookIds();
  const jobs = LEVEL_SPECS.filter((l) => l.id !== 'P0');
  const chapters = [...new Set(jobs.map((l) => l.chapter))].filter((n) => n < 9).length;
  const byChapter = (ids: string[]): string => CHAPTERS.filter((c) => c.n >= 1).map((c) => ({ c, ids: idsOf(c.n).filter((i) => ids.includes(i)) })).filter((x) => x.ids.length).map((x) => `${x.c.n === 9 ? 'the finale' : `chapter ${x.c.n}`} (${ranges(x.ids)})`).join(', ');
  const classicIds = LEVEL_SPECS.map((l) => l.id).filter((i) => !newIds.includes(i));
  const classicJobs = classicIds.filter((i) => i !== 'P0');
  return `<section class="now card" id="now" aria-labelledby="now-h">
<h2 id="now-h">What is in the game now</h2>
<dl class="facts">
<dt>Version</dt><dd>${esc(rel.version)}, "${esc(rel.name)}". Alpha. This wiki is built from that release.</dd>
<dt>Campaign</dt><dd>A prologue and ${jobs.length} jobs in ${chapters} chapters and a finale. All of them can be played, from Ohm's law on a beach to a province.</dd>
<dt>Career</dt><dd>Ten years as a district engineer, one quarter at a time. ${['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][CHARTER_IDS.length] ?? CHARTER_IDS.length} districts, and a weekly district that is the same for everyone.</dd>
<dt>In the new 3D look</dt><dd>The title, ${byChapter(newIds.filter((i) => i !== 'P0'))}.</dd>
<dt>Still in the classic 2D look</dt><dd>The prologue, ${byChapter(classicJobs)}. The job board marks them "Classic".</dd>
<dt>Platforms</dt><dd>${PLATFORMS.join(' and ')}. The macOS build is untested: no one has opened it on a Mac.</dd>
</dl>
<h3>The campaign is complete. What is not built yet</h3>
<p>Every chapter, job and the Career exist. What is left is mostly the look:</p>
<ul>${PLANNED.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<p>The design docs also list ideas that are not scheduled: black-start jobs, a level editor, other languages.</p>
<h3>What nobody has checked yet</h3>
<ul>${NOT_CHECKED.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
</section>`;
}

function indexPage(): string {
  const newIds = new Set(newLookIds());
  const chapters = CHAPTERS.map((c) => {
    const ids = idsOf(c.n);
    const allNew = ids.every((i) => newIds.has(i)), noneNew = ids.every((i) => !newIds.has(i));
    return `<li><a href="chapter-${c.n}.html"><b>${esc(c.title)}</b></a> ${allNew ? lookChip('new') : noneNew ? lookChip('classic') : '<span class="look new">New look</span> <span class="look classic">Classic look</span>'}<span>${ids.map((id) => esc(titleOf(id))).join(' · ')}</span></li>`;
  }).join('');
  const body = `<h1>GRID wiki</h1>
<p class="lede">What each chapter teaches, every job with its goal and what failing looks like, the controls, and a guide to the Career.</p>
${nowSection()}
<h2>Start here</h2>
<ul class="start"><li><a href="how.html"><b>How a job goes</b></a><span>The four steps, with shots.</span></li><li><a href="controls.html"><b>Controls</b></a><span>Mouse, keyboard and gamepad.</span></li></ul>
<h2>The campaign</h2>
<ul class="chapters">${chapters}</ul>
<h2>Career</h2>
<p><a href="career.html">Career: The Utility</a>: districts, projects, the two reliability numbers and the endings.</p>`;
  return page('GRID wiki', 'Player guide to GRID: what is in the game now, every job with its goal, the controls and the Career mode.', body, 'Wiki', 'index.html');
}

/** The home page with its generated story block (between the <!--story--> markers) refreshed. */
export function homePage(src: string): string {
  return src.replace(/<!--story-->[\s\S]*?<!--\/story-->/, `<!--story-->\n${storyHtml('')}\n<!--/story-->`);
}

/** Every wiki page, path relative to site/; with the home page's source, index.html too. */
export function buildWiki(home?: string): Record<string, string> {
  const out: Record<string, string> = { 'wiki/index.html': indexPage(), 'wiki/how.html': howPage(), 'wiki/controls.html': controlsPage(), 'wiki/career.html': careerPage() };
  if (home !== undefined) out['index.html'] = homePage(home);
  for (const c of CHAPTERS) out[`wiki/chapter-${c.n}.html`] = chapterPage(c.n);
  return out;
}
