// L26: a day's dispatch of four thermal plants plus an energy-limited hydro unit and curtailable solar over a two-area system with a 220 kV corridor.
// Per 15-minute block: commitment windows (with warm-up and ramps), then one of three dispatch rules: merit order (cheapest first, corridor ignored), equal-lambda
// (corridor ignored), or corridor-aware two-area lambda (the corridor splits the price: LMP preview). Hydro runs where the system lambda exceeds its water value
// (engine solveWaterValue). Oracle: tools/oracles/ch7_oracles.py (own lambda iteration, own water value).
import { economicDispatch, solveWaterValue, type EdUnit } from '../dispatch';
import { SC, type PlantData } from './data';
import type { DispatchMode, L26Design, Window } from './state';

export const PLANTS = Object.keys(SC.l26.plants);
export const PLANT_LABEL_KEY: Record<string, string> = { coalsub: 'ch7.plant.coalsub', coalsc: 'ch7.plant.coalsc', ccgt: 'ch7.plant.ccgt', ocgt: 'ch7.plant.ocgt' };

const interp = (arr: number[], b: number): number => { const h = b / 4, i = Math.floor(h) % 24, j = (i + 1) % 24, fr = h - Math.floor(h); return arr[i]! * (1 - fr) + arr[j]! * fr; };
export const demandMW = (b: number): number => interp(SC.l26.demandHourlyMW, b);
export const solarMW = (b: number): number => interp(SC.l26.solarHourlyMW, b);

/** The engine's ED, with the empty system handled like the oracle (a demand with no unit is a shortfall; a negative one a surplus). */
function ed(units: EdUnit[], D: number): { feasible: boolean; lambda: number; p: number[]; sf: number; su: number } {
  if (units.length === 0) return { feasible: D <= 1e-9 && D >= -1e-9, lambda: 0, p: [], sf: D > 1e-9 ? D : 0, su: D < -1e-9 ? -D : 0 };
  const r = economicDispatch(units, D);
  return { feasible: r.feasible, lambda: r.lambda, p: r.p, sf: r.shortfallMW, su: r.surplusMW };
}

let HYDRO: { p: number[]; nu: number } | null = null;
/** Hydro schedule (MW per block) and water value: bisected so the day's energy equals the budget, hydro running where the all-thermal system lambda exceeds it. */
export function hydroSchedule(): { p: number[]; nu: number } {
  if (HYDRO) return HYDRO;
  const c = SC.l26, nb = c.blocks;
  const net = Array.from({ length: nb }, (_, b) => demandMW(b) - solarMW(b));
  const units: EdUnit[] = Object.values(c.plants).map((p) => ({ a: p.a, b: p.b, c: p.c, pMin: 0, pMax: p.pMax }));
  const lam = (_b: number, n: number): number => { const r = ed(units, Math.max(n, 0)); return r.feasible ? r.lambda : 500; };
  const h = solveWaterValue({ pMin: 0, pMax: c.hydro.pMaxMW }, net, c.hydro.energyMWh, lam, c.dtH, 200);
  HYDRO = { p: h.p, nu: h.nu };
  return HYDRO;
}

export type L26Fail = 'congestion' | 'imbalance';
export interface L26Study {
  costUSD: number; ensMWh: number; surplusMWh: number; trip: { block: number; flowMW: number } | null; maxFlowMW: number;
  /** lambda (US$/MWh) of the generation area and the load area at 20:00 (block 80), and the flow then */
  lam20: { g: number | null; s: number | null; flowMW: number };
  kind: L26Fail | null; ok: boolean;
  startsCostUSD: number;
  /** per-block detail (only with detail = true): hourly arrays are the UI's merit-order stack */
  detail?: { flow: number[]; lamG: (number | null)[]; lamS: (number | null)[]; p: Record<string, number[]>; hydro: number[]; solar: number[]; demand: number[]; shortfall: number[] };
}

export function studyL26(d: L26Design, detail = false): L26Study {
  const c = SC.l26, P = c.plants, DT = c.dtH, F = c.corridorMW, FOP = c.corridorOpFrac * F, hyd = hydroSchedule().p;
  const prev: Record<string, number> = {};
  for (const k of PLANTS) { const w = d.windows[k] ?? [0, 24]; prev[k] = w[0] === 0 && w[1] > 0 ? P[k]!.pMin : 0; }
  let cost = 0, startCost = 0, ens = 0, surplus = 0, maxFlow = 0, trip: L26Study['trip'] = null, lam20: L26Study['lam20'] = { g: null, s: null, flowMW: 0 };
  const det: NonNullable<L26Study['detail']> = { flow: [], lamG: [], lamS: [], p: Object.fromEntries(PLANTS.map((k) => [k, [] as number[]])), hydro: [], solar: [], demand: [], shortfall: [] };
  for (let b = 0; b < c.blocks; b++) {
    const h = b / 4;
    const avail: string[] = [], units: EdUnit[] = [];
    for (const k of PLANTS) {
      const p = P[k] as PlantData, [s, e] = (d.windows[k] ?? [0, 24]) as Window;
      const on = s < e && s <= h && h < e, warm = on && s > 0 && h < s + p.startH;
      if (on && s > 0 && Math.abs(h - s) < 1e-9) { cost += p.startCost; startCost += p.startCost; }
      if (on && !warm) { avail.push(k); units.push({ a: p.a, b: p.b, c: p.c, pMin: p.pMin, pMax: p.pMax, pPrev: prev[k]!, rampMWperMin: p.rampMWperMin }); }
    }
    for (const k of PLANTS) if (!avail.includes(k)) prev[k] = 0;
    const lo = (u: EdUnit): number => { const dlt = u.rampMWperMin! * 15, wl = u.pPrev! - dlt, wh = u.pPrev! + dlt, nlo = Math.max(u.pMin, wl), nhi = Math.min(u.pMax, wh); return nlo <= nhi ? nlo : (wh < u.pMin ? u.pMin : u.pMax); };
    const hi = (u: EdUnit): number => { const dlt = u.rampMWperMin! * 15, wl = u.pPrev! - dlt, wh = u.pPrev! + dlt, nlo = Math.max(u.pMin, wl), nhi = Math.min(u.pMax, wh); return nlo <= nhi ? nhi : (wh < u.pMin ? u.pMin : u.pMax); };
    const D = demandMW(b), DG = c.gDemandMW, DS = D - DG, hy = hyd[b]!;
    let sol = solarMW(b), need = D - hy - sol;
    let lamG: number | null = null, lamS: number | null = null, sf = 0, su = 0, flow = 0;
    const out: Record<string, number> = {};
    const areaSum = (area: 'G' | 'S'): number => avail.reduce((a, k) => a + (P[k]!.area === area ? out[k]! : 0), 0);
    if (d.mode === 'merit') {
      avail.forEach((k, i) => { out[k] = lo(units[i]!); });
      let rem = need - avail.reduce((a, k) => a + out[k]!, 0);
      if (rem < 0 && sol > 0) { const cs = Math.min(sol, -rem); sol -= cs; need += cs; rem = need - avail.reduce((a, k) => a + out[k]!, 0); }
      if (rem < 0) su = -rem;
      const order = avail.map((k, i) => ({ k, i })).sort((x, y) => { const f = (z: { k: string; i: number }): number => { const u = units[z.i]!, h2 = hi(u); return h2 > 0 ? u.a / h2 + u.b + u.c * h2 : 1e9; }; return f(x) - f(y); });
      for (const { k, i } of order) { if (rem <= 0) break; const add = Math.min(hi(units[i]!) - out[k]!, rem); out[k]! += add; rem -= add; }
      sf = Math.max(rem, 0);
      lamG = lamS = Math.max(0, ...avail.map((k, i) => units[i]!.b + 2 * units[i]!.c * out[k]!)) || 0;
      flow = areaSum('G') + hy + sol - DG;
    } else {
      let r = ed(units, need);
      if (!r.feasible && r.su > 0 && sol > 0) { const cs = Math.min(sol, r.su); sol -= cs; need = D - hy - sol; r = ed(units, need); }
      avail.forEach((k, i) => { out[k] = r.p[i]!; });
      sf = r.sf; su = r.su;
      flow = areaSum('G') + hy + sol - DG;
      lamG = lamS = r.feasible ? r.lambda : null;
      if (d.mode === 'corridor' && r.feasible && Math.abs(flow) > FOP + 1e-6) {
        const fl = flow > 0 ? FOP : -FOP;
        const gi = avail.map((k, i) => ({ k, i })).filter((x) => P[x.k]!.area === 'G'), si = avail.map((k, i) => ({ k, i })).filter((x) => P[x.k]!.area === 'S');
        const rg = ed(gi.map((x) => units[x.i]!), DG + fl - hy - sol), rs = ed(si.map((x) => units[x.i]!), DS - fl);
        gi.forEach((x, j) => { out[x.k] = rg.p[j]!; }); si.forEach((x, j) => { out[x.k] = rs.p[j]!; });
        sf = rg.sf + rs.sf; su = rg.su + rs.su; lamG = rg.feasible ? (gi.length ? rg.lambda : null) : null; lamS = rs.feasible ? (si.length ? rs.lambda : null) : null; flow = fl;
      }
    }
    if (d.mode !== 'corridor' && Math.abs(flow) > F + 1e-6 && trip === null) trip = { block: b, flowMW: flow };
    ens += sf * DT; surplus += su * DT;
    for (const k of avail) prev[k] = out[k]!;
    avail.forEach((k, i) => { const u = units[i]!, p = out[k]!; cost += (u.a + u.b * p + u.c * p * p) * DT; });
    maxFlow = Math.max(maxFlow, Math.abs(flow));
    if (b === 80) lam20 = { g: lamG, s: lamS, flowMW: flow };
    if (detail) { det.flow.push(flow); det.lamG.push(lamG); det.lamS.push(lamS); for (const k of PLANTS) det.p[k]!.push(out[k] ?? 0); det.hydro.push(hy); det.solar.push(sol); det.demand.push(D); det.shortfall.push(sf); }
  }
  const kind: L26Fail | null = trip ? 'congestion' : ens >= 0.05 || surplus >= 0.05 ? 'imbalance' : null;
  return { costUSD: cost, ensMWh: ens, surplusMWh: surplus, trip, maxFlowMW: maxFlow, lam20, kind, ok: kind === null, startsCostUSD: startCost, ...(detail ? { detail: det } : {}) };
}

/** The mode a design runs in, for messages. */
export const modeKey = (m: DispatchMode): string => `ch7.mode.${m}`;
