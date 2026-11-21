// Text truth (1.6): every clock time and every quantity a level's brief, place line, story, coach line, "why?" or debrief template quotes comes from the
// engine. A 1.5 tester read "16:00" on the coach card against a brief that said 20:00, and the L19 coach told the player to run to 22:30 when the shift
// ends at 21:30; this test replays every level's lesson build and checks each quoted number against the times and values the engine actually used.
//  - Times (HH:MM): the level's start and end, every scripted event (queued and fired), every `*Block` field in state or levelInfo, and every block
//    where the total load steps by more than 15 % (a mill starting, a factory stopping).
//  - Quantities (a number followed by GW, MW, kW, MVAr, kVAr, MVA, kV, kA, A, km, pu, Hz, s or %): a value in the state (before and after the run),
//    in levelInfo, in the chapter data tables, or a plain aggregate of them (totals and counts by unit kind, the inverter share, 1 - x for a per-unit
//    band). It has to match to the printed precision (half a unit in the last printed digit), in the same unit or scaled by 1000, 1/1000 or 100.
//  - DERIVED lists the few numbers a sentence works out (a rated current, a capacitor size), each with the engine function that gives it.
// Debrief templates (`level.<id>.lesson*` / `.try*`) are checked with their {placeholders} removed: the numbers that remain are literals and must pass too.
import { describe, expect, it } from 'vitest';
import { Env, TICK } from '@core/kit';
import { GAME } from '../game';
import { t } from '../i18n';
import { en } from '../locales/en';
import type { GridState } from '../types';
import { LEVEL_SPECS } from './index';
import * as D4 from '../sim/ch4/data';
import * as D7 from '../sim/ch7/data';
import * as D8 from '../sim/ch8/data';
import * as DD from '../sim/distrib/data';
import { qcNeeded } from '../sim/ch4/pfc';
import { L26_PRICE_BLOCK } from '../sim/ch7/merit';

const DATA: unknown[] = [D4, D7, D8, DD];
const hh = (b: number): string => `${String(Math.floor((((b % 96) + 96) % 96) / 4)).padStart(2, '0')}:${String((((b % 4) + 4) % 4) * 15).padStart(2, '0')}`;
const sum = <T>(xs: T[], f: (x: T) => number): number => xs.reduce((a, x) => a + f(x), 0);
const ratedA = (s: GridState): number[] => s.branches.map((b) => { const kv = s.buses.find((x) => x.id === b.from)?.kvNom ?? 0; return kv > 0 ? b.ratingMVA * 1000 / (Math.sqrt(3) * kv) : 0; });

/** Numbers a sentence derives, with the engine function that derives them. */
const DERIVED: Record<string, (s: GridState) => number[]> = {
  L07: (s) => ratedA(s),                                                           // "the feeder is rated for 115 A": ratingMVA / (sqrt 3 x kV)
  L11: () => [qcNeeded(D4.EST.kw, D4.EST.pf, 0.95) / 1000],                        // "a bank of about 346 kVAr": Q_c = P (tan phi1 - tan phi2)
  L14: (s) => s.buses.map((b) => 0.95 * b.kvNom),                                  // "the same 0.95 pu is 10.45 kV at a town ...": pu x kV_nom
};
/** Times a level quotes that the engine keeps as a named constant rather than in state. */
const TIMES: Record<string, number[]> = { L26: [L26_PRICE_BLOCK, ...Object.values(D7.SC.l26.windows).flat().flat().map((h) => Number(h) * 4)] };   // the price study's block; the plants' commitment windows (hours)

function scanBlocks(o: unknown, out: Set<number>, depth = 0): void {
  if (depth > 5 || o === null || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o as object)) {
    if (typeof v === 'number' && /block$/i.test(k) && Number.isInteger(v)) out.add(v);
    else if (typeof v === 'object') scanBlocks(v, out, depth + 1);
  }
}
function collect(o: unknown, out: number[], depth = 0): void {
  if (depth > 6 || o === null) return;
  if (typeof o === 'number' && Number.isFinite(o)) out.push(o);
  else if (typeof o === 'object') for (const v of Object.values(o as object)) collect(v, out, depth + 1);
}
const physical = (s: GridState): Partial<GridState> => { const { rng, history, replay, log, actionLog, metrics, ...rest } = s as GridState & Record<string, unknown>; void rng; void history; void replay; void log; void actionLog; void metrics; return rest as Partial<GridState>; };
function aggregates(s: GridState, out: number[]): void {
  const u = s.units;
  out.push(sum(s.loads, (l) => l.Ppeak), sum(s.loads, (l) => l.P), sum(u, (x) => x.pMax), sum(u, (x) => x.P), u.length, s.loads.length);
  const tot = sum(u, (x) => x.P), ibr = sum(u.filter((x) => ['solar', 'wind', 'pv'].includes(x.kind)), (x) => x.P);
  if (tot > 0) out.push(100 * ibr / tot);
  for (const k of new Set(u.map((x) => x.kind))) { const g = u.filter((x) => x.kind === k); out.push(g.length, sum(g, (x) => x.pMax), sum(g, (x) => x.mva)); }
}

interface Facts { times: Set<string>; nums: number[] }
function facts(id: string, region: string): { facts: Facts; texts: [string, string][] } {
  const spec = LEVEL_SPECS.find((l) => l.id === id)!;
  const e = new Env(GAME); e.reset({ seed: 1, level: id, region });
  const li = e.engine.q('levelInfo') as { brief?: string; place?: string; story?: string[] };
  const texts: [string, string][] = [['brief', li.brief ?? ''], ['place', li.place ?? ''], ...(li.story ?? []).map((x, i): [string, string] => [`story ${i + 1}`, x]),
    ...spec.coach.flatMap((c): [string, string][] => [[`coach ${c.id}`, t(c.textKey)], [`why ${c.id}`, t(c.whyKey)]]),
    ...Object.keys(en).filter((k) => k.startsWith(`level.${id}.lesson`) || k.startsWith(`level.${id}.try`)).map((k): [string, string] => [k, en[k]!.replace(/\{[^}]*\}/g, '#')])];
  const blocks = new Set<number>([spec.startBlock ?? 0, (spec.startBlock ?? 0) + (spec.horizonBlocks ?? 0), ...(TIMES[id] ?? [])]);
  const nums: number[] = [];
  scanBlocks({ li, s: e.state }, blocks); collect(physical(e.state), nums); collect(li, nums); aggregates(e.state, nums);
  for (const a of spec.lesson) e.step(a);
  let prev = -1;
  for (let i = 0; i < spec.maxTicks + 2 && e.state.status === 'playing'; i++) {
    e.step(TICK);
    const p = sum(e.state.loads, (l) => l.P), b = e.state.clock.block;
    if (prev > 0.01 && Math.abs(p - prev) > 0.15 * prev) { blocks.add(b); blocks.add(b - 1); }
    if (prev <= 0.01 && p > 0.01) blocks.add(b);
    prev = p;
  }
  scanBlocks(e.state, blocks); for (const l of e.state.events.log) blocks.add(l.block);
  blocks.add(Math.max(...blocks) + 1);   // the end of the last block (a 22:45 block runs to 23:00)
  collect(physical(e.state), nums); aggregates(e.state, nums); for (const m of DATA) collect(m, nums); nums.push(...(DERIVED[id]?.(e.state) ?? []));
  const base = nums.length; for (let i = 0; i < base; i++) { const n = nums[i]!; if (n > 0.5 && n < 1.5) nums.push(Math.abs(1 - n)); }
  return { facts: { times: new Set([...blocks].map(hh)), nums }, texts };
}

const QTY = /(\d+(?:\.\d+)?)\s?(GW|MW|kW|MVAr|kVAr|MVA|kV|kA|A|km|pu|Hz|s|%)(?![a-zA-Z])/g;
function untrue(f: Facts, texts: [string, string][]): string[] {
  const bad: string[] = [];
  const has = (v: number, dec: number): boolean => f.nums.some((n) => [1, 1000, 0.001, 100].some((k) => Math.abs(n * k - v) <= 0.5 * 10 ** -dec + 1e-9));
  for (const [where, x] of texts) {
    for (const m of x.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) { const k = `${m[1]!.padStart(2, '0')}:${m[2]}`; if (!f.times.has(k)) bad.push(`${where}: "${k}" is no time the engine uses (${[...f.times].sort().join(' ')})`); }
    for (const m of x.matchAll(QTY)) if (!has(Number(m[1]), (m[1]!.split('.')[1] ?? '').length)) bad.push(`${where}: "${m[0]}" matches no engine value`);
  }
  return bad;
}

describe('text truth: every time and quantity a level quotes comes from the engine', () => {
  for (const spec of LEVEL_SPECS) for (const region of ['global', 'in']) {
    it(`${spec.id} (${region})`, () => { const { facts: f, texts } = facts(spec.id, region); expect(untrue(f, texts)).toEqual([]); });
  }
  it('the check bites: invented numbers and times are caught', () => {
    const { facts: f } = facts('L19', 'global');
    expect(untrue(f, [['fake', 'At 22:30 a 13.7 MW unit at 4.4 kV and 777 MVA trips']]).length).toBe(4);
    expect(untrue(f, [['real', 'At 20:00 the largest coal unit trips']])).toEqual([]);
  });
});
