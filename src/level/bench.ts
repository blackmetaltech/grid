// The DC bench of the first chapter (DESIGN 2.6 L01-L03): one battery hut, copper cable, homes. The player's circuit lives in
// `state.bench` (plain data); everything derived (voltages, current, loss share, cost) is recomputed here from the bench, the shared
// copper table (IEC 60228) and the region's prices, never stored. Solved with the bench MNA (src/sim/bench), so the numbers are the
// oracle numbers (G-01b, G-02, the L03 exact table).
import type { ActionFn, ActionResult } from '@core/kit';
import { abs, cx } from '@core/numerics';
import { COPPER } from '../data/conductors';
import { GROUND, cableLoopR, solveMna, solveL03, type Elem } from '../sim/bench';
import { t } from '../i18n';
import type { BenchState, GridState } from '../types';

/** Region-priced parts of the bench, as plain numbers (src/catalogue.ts maps the pack). */
export interface BenchParams {
  /** Cable price: per metre per mm2 per core, sheath per metre, pole price and spacing (m). */
  cable: { perMm2PerM: number; sheathPerM: number; polePrice: number; poleSpacingM: number };
  /** The 48 V <-> 380 V DC-DC converter: unit price and efficiency (fraction). */
  converter: { price: number; eta: number };
}

/** Cross-sections the catalogue sells (mm2), ascending. */
export const CABLE_SIZES_MM2: readonly number[] = COPPER.map((c) => c.areaMm2);
/** Battery-hut sites on the beach strip of L01: every 30 m from 120 m to 300 m from the hamlet (the level's site list). */
export const HUT_SITES_M: readonly number[] = [120, 150, 180, 210, 240, 270, 300];
export const HUT_MIN_M = 120, HUT_MAX_M = 300;

/** Fixed geometry of the other bench levels, metres. */
export const GEOM = {
  /** L02: hut to hamlet 1 and hamlet 2 directly (radial), and via the junction box (trunk, then one branch per hamlet). */
  l02: { hamlet1M: 120, hamlet2M: 250, trunkM: 100, branch1M: 40, branch2M: 160 },
  /** L03: school and health centre, one way. */
  l03: { distanceM: 1000 },
} as const;
export const SOURCE_V = 48;
export const HOME_W = 48, HOME_V = 48;
export const HOMES = { l01: [10], l02: [10, 14], l03: [] as number[] } as const;
export const L03_LOAD_W = 5000;

const copper = (mm2: number | null) => COPPER.find((c) => c.areaMm2 === mm2) ?? null;

export function freshBench(scenario: BenchState['scenario'], limits: BenchState['limits'], hutM: number | null = null): BenchState {
  return { scenario, hutM, cableMm2: { main: null, b: null }, topology: null, converters: false, limits };
}

/** Is everything the scenario needs in place? */
export function benchComplete(b: BenchState): boolean {
  if (b.scenario === 'l01') return b.hutM !== null && b.cableMm2.main !== null;
  if (b.scenario === 'l02') return b.topology !== null && b.cableMm2.main !== null && b.cableMm2.b !== null;
  return b.cableMm2.main !== null;
}

/** Cable runs (length in m, cross-section) of the bench as laid. */
function runs(b: BenchState): { id: 'main' | 'b' | 'b2'; lengthM: number; mm2: number | null }[] {
  if (b.scenario === 'l01') return [{ id: 'main', lengthM: b.hutM ?? 0, mm2: b.cableMm2.main }];
  if (b.scenario === 'l03') return [{ id: 'main', lengthM: GEOM.l03.distanceM, mm2: b.cableMm2.main }];
  const g = GEOM.l02;
  if (b.topology === 'trunk') return [{ id: 'main', lengthM: g.trunkM, mm2: b.cableMm2.main }, { id: 'b', lengthM: g.branch1M, mm2: b.cableMm2.b }, { id: 'b2', lengthM: g.branch2M, mm2: b.cableMm2.b }];
  return [{ id: 'main', lengthM: g.hamlet1M, mm2: b.cableMm2.main }, { id: 'b', lengthM: g.hamlet2M, mm2: b.cableMm2.b }];
}

/** Build cost so far in the region's currency: cables (two cores plus sheath, poles every spacing), the junction pole and the converters. */
export function benchCost(b: BenchState, p: BenchParams): number {
  let c = 0;
  for (const r of runs(b)) {
    if (r.mm2 === null || r.lengthM <= 0) continue;
    c += (p.cable.perMm2PerM * r.mm2 * 2 + p.cable.sheathPerM) * r.lengthM + Math.ceil(r.lengthM / p.cable.poleSpacingM) * p.cable.polePrice;
  }
  if (b.scenario === 'l02' && b.topology === 'trunk') c += p.cable.polePrice;
  if (b.scenario === 'l03' && b.converters) c += 2 * p.converter.price;
  return c;
}

export interface BenchSolve {
  /** Everything is laid and the circuit has a solution. */
  powered: boolean;
  /** Lowest voltage at a home (or at the load converter), V. */
  vMinV: number;
  /** Current in the most loaded cable as a fraction of its ampacity. */
  ampFracMax: number;
  /** Line-loss share, percent (L01/L02: cable loss over source power; L03: I2R over power delivered at the far end). */
  lossPct: number;
  /** Lowest voltage per hamlet (L02) or the single load (others). */
  vLoadV: number[];
  /** Why not powered: a locale key, or null. */
  reason: string | null;
}
const dark = (reason: string): BenchSolve => ({ powered: false, vMinV: 0, ampFracMax: 0, lossPct: 100, vLoadV: [], reason });

/** Solve the bench as laid (pure). */
export function solveBench(b: BenchState, p: BenchParams): BenchSolve {
  if (!benchComplete(b)) return dark('bench.incomplete');
  const rs = runs(b);
  const R = (id: string): number => { const r = rs.find((x) => x.id === id)!; return cableLoopR(copper(r.mm2)!.r20OhmPerKm, r.lengthM, 2); };
  const amp = (id: string): number => copper(rs.find((x) => x.id === id)!.mm2)!.ampacityAirA;
  if (b.scenario === 'l03') {
    if (b.converters) {
      const r = solveL03({ rOhmPerKm20C: copper(b.cableMm2.main)!.r20OhmPerKm, loopKm: (2 * GEOM.l03.distanceM) / 1000, eta: p.converter.eta, pLoadW: L03_LOAD_W });
      if (!r.ok) return dark('bench.noSolution');
      return { powered: true, vMinV: r.vFar, ampFracMax: r.iA / amp('main'), lossPct: r.lossPctExact, vLoadV: [r.vFar], reason: null };
    }
    const m = solveMna([{ kind: 'V', id: 'src', a: 's', b: GROUND, e: cx(SOURCE_V) }, { kind: 'R', id: 'cable', a: 's', b: 'far', r: R('main') }, { kind: 'CPL', id: 'load', a: 'far', b: GROUND, p: L03_LOAD_W }], 0);
    if (!m.ok) return dark('bench.noLowVoltageSolution');
    const i = abs(m.I.cable!);
    return { powered: true, vMinV: abs(m.V.far!), ampFracMax: i / amp('main'), lossPct: (100 * i * i * R('main')) / L03_LOAD_W, vLoadV: [abs(m.V.far!)], reason: null };
  }
  const el: Elem[] = [{ kind: 'V', id: 'src', a: 's', b: GROUND, e: cx(SOURCE_V) }];
  const homes = (node: string, n: number, tag: string): void => { for (let k = 0; k < n; k++) el.push({ kind: 'LOAD', id: `${tag}${k}`, a: node, b: GROUND, p: HOME_W, q: 0, vnom: HOME_V }); };
  const cables: { id: string; amp: number }[] = [];
  const add = (id: string, a: string, bb: string, r: number, ampacity: number): void => { el.push({ kind: 'R', id, a, b: bb, r }); cables.push({ id, amp: ampacity }); };
  let hamlets: string[];
  if (b.scenario === 'l01') { add('main', 's', 'h1', R('main'), amp('main')); homes('h1', HOMES.l01[0]!, 'a'); hamlets = ['h1']; }
  else if (b.topology === 'trunk') {
    add('main', 's', 'j', R('main'), amp('main')); add('b', 'j', 'h1', R('b'), amp('b')); add('b2', 'j', 'h2', cableLoopR(copper(b.cableMm2.b)!.r20OhmPerKm, GEOM.l02.branch2M, 2), amp('b'));
    homes('h1', HOMES.l02[0]!, 'a'); homes('h2', HOMES.l02[1]!, 'c'); hamlets = ['h1', 'h2'];
  } else { add('main', 's', 'h1', R('main'), amp('main')); add('b', 's', 'h2', R('b'), amp('b')); homes('h1', HOMES.l02[0]!, 'a'); homes('h2', HOMES.l02[1]!, 'c'); hamlets = ['h1', 'h2']; }
  const m = solveMna(el, 0);
  if (!m.ok) return dark('bench.noSolution');
  const v = hamlets.map((h) => abs(m.V[h]!));
  const iSrc = abs(m.I.src!);
  let lossW = 0;
  for (const c of cables) { const i = abs(m.I[c.id]!); lossW += i * i * (el.find((e) => e.id === c.id) as { r: number }).r; }
  return { powered: true, vMinV: Math.min(...v), ampFracMax: Math.max(...cables.map((c) => abs(m.I[c.id]!) / c.amp)), lossPct: (100 * lossW) / (SOURCE_V * iSrc), vLoadV: v, reason: null };
}

/** True while the bench is failing its pass limits (a brownout block): incomplete, unsolvable, a cable beyond its ampacity, voltage or loss out of limit. */
export function benchBad(b: BenchState, r: BenchSolve): boolean {
  if (!r.powered || r.ampFracMax > 1) return true;
  if (b.limits.vMinV !== null && r.vMinV < b.limits.vMinV) return true;
  return b.limits.lossMaxPct !== null && r.lossPct > b.limits.lossMaxPct;
}

/** The levelRules system calls this once per block while a bench is present: updates the tracked metrics and the poor-supply minutes. */
export function stepBench(s: GridState, p: BenchParams): void {
  const b = s.bench;
  if (!b) return;
  const r = solveBench(b, p);
  const tr = s.metrics.track;
  tr.vLoadMinV = r.vMinV; tr.lossPct = r.lossPct; tr.ampFracMax = r.ampFracMax;
  if (benchBad(b, r)) s.metrics.poorSupplyMin += 15;
  s.budget.spent = benchCost(b, p);
}

// ---- actions --------------------------------------------------------------------------------------------------------------
type Params = Record<string, string | number>;
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > 200) s.actionLog.splice(0, s.actionLog.length - 200);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export interface BenchDeps { getBench: (s: GridState) => BenchParams; money: (s: GridState, amount: number) => string }

/** Bench build actions. Every one re-prices the circuit (laying again replaces what was there). */
export function buildBenchActions(d: BenchDeps): Record<string, ActionFn<GridState>> {
  const reprice = (s: GridState): string => { s.budget.spent = benchCost(s.bench!, d.getBench(s)); return d.money(s, s.budget.spent); };
  return {
    /** L01: put the battery hut at `distM` metres from the hamlet (120 to 300). */
    placeHut: (s, distM: unknown) => {
      if (!s.bench) return reject('bench.none');
      if (s.bench.scenario !== 'l01') return reject('bench.hutFixed');
      if (!isNum(distM) || distM < HUT_MIN_M || distM > HUT_MAX_M) return reject('bench.hutRange', { min: HUT_MIN_M, max: HUT_MAX_M, dist: String(distM) });
      s.bench.hutM = distM;
      return accept(s, 'placeHut', 'bench.hutOk', { dist: distM, total: reprice(s) });
    },
    /** Lay a 2-core copper cable of `mm2` on a run: 'main' (L01/L03; L02 the hut-to-hamlet-1 cable or the trunk) or 'b' (L02: the second hamlet's cable or the branches). */
    layCable: (s, run: unknown, mm2: unknown) => {
      if (!s.bench) return reject('bench.none');
      if (run !== 'main' && run !== 'b') return reject('bench.run');
      if (run === 'b' && s.bench.scenario !== 'l02') return reject('bench.noSecondRun');
      if (!isNum(mm2) || !CABLE_SIZES_MM2.includes(mm2)) return reject('bench.size', { size: String(mm2), sizes: CABLE_SIZES_MM2.join(', ') });
      if (s.bench.scenario === 'l01' && s.bench.hutM === null) return reject('bench.hutFirst');
      s.bench.cableMm2[run] = mm2;
      if (s.bench.scenario === 'l02' && s.bench.topology === null) s.bench.topology = 'radial';
      const r = copper(mm2)!;
      return accept(s, 'layCable', 'bench.cableOk', { mm2, ohmKm: r.r20OhmPerKm, amps: r.ampacityAirA, total: reprice(s) });
    },
    /** L02: a junction box on a pole: one trunk from the hut, a branch to each hamlet. */
    placeJunction: (s) => {
      if (!s.bench) return reject('bench.none');
      if (s.bench.scenario !== 'l02') return reject('bench.noJunction');
      s.bench.topology = 'trunk';
      return accept(s, 'placeJunction', 'bench.junctionOk', { total: reprice(s) });
    },
    /** L03: place (true) or remove (false) the 48 V / 380 V converter pair. */
    placeConverters: (s, on: unknown) => {
      if (!s.bench) return reject('bench.none');
      if (s.bench.scenario !== 'l03') return reject('bench.noConverters');
      if (typeof on !== 'boolean') return reject('bench.convArg');
      s.bench.converters = on;
      return accept(s, 'placeConverters', on ? 'bench.convOn' : 'bench.convOff', { total: reprice(s) });
    },
  };
}
