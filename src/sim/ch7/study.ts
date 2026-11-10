// The chapter-7 study dispatcher: one pure function from the player's design (state.ch7) to what the level checks (pass/fail with the incident report's numbers,
// the tracked metrics, the build cost in pack currency, the star score) plus the verdict that levelResult returns. Never stored in the state, always recomputed.
import type { GridState, Rules } from '../../types';
import { SC, hhmm, r1, r2, r3 } from './data';
import { studyL23 } from './board';
import { studyL24 } from './feeder';
import { studyL25 } from './swing';
import { studyL26, PLANTS } from './merit';
import { studyL27, examQuestions } from './exam';
import type { Ch7Id, Ch7State } from './state';

type Params = Record<string, string | number>;
export type Ch7Fail = 'breakerFail' | 'miscoordination' | 'nuisance' | 'blind' | 'conductorBurnt' | 'outOfStep' | 'congestion' | 'imbalance' | 'dispatch';
export const CH7_FAIL_KINDS: Ch7Fail[] = ['breakerFail', 'miscoordination', 'nuisance', 'blind', 'conductorBurnt', 'outOfStep', 'congestion', 'imbalance', 'dispatch'];

export interface Study {
  id: Ch7Id; ok: boolean; kind: Ch7Fail | null; failKey: string | null; failParams: Params;
  /** Build cost in pack currency (what `budget.spent` shows). */
  capex: number;
  /** The star score in pack currency (L24: seconds), lower is better. */
  score: number;
  ensMWh: number;
  track: Record<string, number>;
  /** Predictions: id -> the engine's answer for the design as it stands. */
  actuals: Record<string, number>;
}

/** Primary prediction of each level (its error feeds the third star where the card says so). */
export const PRIMARY_PREDICTION: Partial<Record<Ch7Id, string>> = { L23: 'faultKA', L25: 'deltaCrDeg', L26: 'lambda20' };

const fail = (kind: Ch7Fail, params: Params): { kind: Ch7Fail; failKey: string; failParams: Params } => ({ kind, failKey: `level.lost.ch7.${kind}`, failParams: params });

function raw(c: Ch7State): Omit<Study, 'track' | 'actuals'> & { track: Record<string, number>; actuals: Record<string, number> } {
  const m = c.money;
  const base = { id: c.id, ok: true, kind: null as Ch7Fail | null, failKey: null as string | null, failParams: {} as Params, capex: 0, score: 0, ensMWh: 0, track: {} as Record<string, number>, actuals: {} as Record<string, number> };
  if (c.id === 'L23') {
    const st = studyL23(c.l23!), f = st.fault;
    Object.assign(base, { capex: st.capexUSD * m, score: st.capexUSD * m, ensMWh: st.ensMWh });
    base.track = { faultKA: f.threePhKA, dutyRatio: st.dutyRatio, n1Secure: st.n1Secure ? 1 : 0, n1VPu: st.n1VPu, faultMVA: f.mva };
    base.actuals = { faultKA: f.threePhKA };
    if (!st.ok) Object.assign(base, { ok: false }, fail('breakerFail', { id: 'F1', ka: r1(f.threePhKA), rated: st.rating, mva: Math.round(f.mva), t: r2(st.clearedAtS), h: SC.l23.outageH, ens: Math.round(st.ensMWh), pre: r1(st.preGensKA) }));
    return base;
  }
  if (c.id === 'L24') {
    const st = studyL24(c.l24!);
    Object.assign(base, { capex: st.capexUSD * m, score: Number.isFinite(st.totalS) ? st.totalS : 1e6, ensMWh: st.avoidableEnsMWh });
    base.track = { totalClearS: Number.isFinite(st.totalS) ? st.totalS : 1e6, minCtiMarginS: st.minMarginS, avoidableEnsMWh: st.avoidableEnsMWh, worstFaultKA: Math.max(...st.faults.map((x) => x.amps)) / 1000 };
    if (st.kind) {
      const b = st.bad!, cti = SC.l24.ctiS;
      if (st.kind === 'nuisance') Object.assign(base, { ok: false }, fail('nuisance', { relay: b.relay + 1, is: Math.round(st.is[b.relay]!), load: Math.round(b.amps), need: Math.round(SC.l24.pickupLoadFactor * b.amps) }));
      else if (st.kind === 'blind') Object.assign(base, { ok: false }, fail('blind', { relay: b.relay + 1, fault: b.fault, amps: Math.round(b.amps), is: Math.round(st.is[b.relay]!), need: Math.round(1.1 * st.is[b.relay]!) }));
      else if (st.kind === 'burnt') Object.assign(base, { ok: false }, fail('conductorBurnt', { fault: b.fault, relay: b.relay + 1, amps: Math.round(b.amps), t: r2(b.upS), limit: r2(b.limitS ?? 0) }));
      else Object.assign(base, { ok: false }, fail('miscoordination', { fault: b.fault, up: b.relay + 1, down: st.faults.find((x) => x.id === b.fault)!.section, upS: r3(b.upS), downS: r3(b.downS), gap: r3(b.upS - b.downS), cti, amps: Math.round(b.amps), ens: r1(st.avoidableEnsMWh) }));
    }
    return base;
  }
  if (c.id === 'L25') {
    const st = studyL25(c.l25!);
    Object.assign(base, { capex: st.capexUSD * m, score: st.capexUSD * m });
    base.track = { marginMs: st.marginMs, clearMs: st.clearS * 1000, tCrMs: st.tCrS * 1000, deltaCrDeg: st.deltaCrDeg, stable: st.stable ? 1 : 0, peakDeg: st.swing.maxDeg };
    base.actuals = { deltaCrDeg: st.deltaCrDeg };
    if (!st.stable) Object.assign(base, { ok: false }, fail('outOfStep', { clear: Math.round(st.clearS * 1000), tcr: Math.round(st.tCrS * 1000), relay: Math.round(st.relayS * 1000), brk: Math.round(st.breakerS * 1000), tloss: r2(st.swing.tLossS ?? 0), du: Math.round(st.deltaUDeg), peak: Math.round(st.swing.clearAtDeg) }));
    return base;
  }
  if (c.id === 'L26') {
    const st = studyL26(c.l26!), cost = st.costUSD * m;
    const opt = SC.l26.optCost;
    Object.assign(base, { capex: 0, score: cost, ensMWh: st.ensMWh });
    base.track = { corridorLoading: st.maxFlowMW / SC.l26.corridorMW, costUSD: st.costUSD, costVsOptPct: opt ? (st.costUSD / opt - 1) * 100 : 0, lambdaS20: st.lam20.s ?? 0, lambdaG20: st.lam20.g ?? 0, ensMWh: st.ensMWh };
    base.actuals = { lambda20: st.lam20.s ?? 0 };
    if (st.kind === 'congestion') Object.assign(base, { ok: false }, fail('congestion', { time: hhmm(st.trip!.block / 4), flow: Math.round(Math.abs(st.trip!.flowMW)), limit: SC.l26.corridorMW, ens: Math.round(st.ensMWh) }));
    else if (st.kind === 'imbalance') Object.assign(base, { ok: false }, fail('imbalance', { ens: r1(st.ensMWh), surplus: r1(st.surplusMWh), short: st.ensMWh >= st.surplusMWh ? 1 : 0 }));
    return base;
  }
  const st = studyL27(c.l27!);
  Object.assign(base, { capex: st.capexUSD * m, score: st.scoreUSD * m });
  base.track = { dutyRatio: st.dutyRatio, boardKA: st.boardKA.duty, dispatchCostPerH: st.dispatch.costPerH, regretUSD: st.dispatch.regretUSD };
  for (const q of examQuestions(false)) base.actuals[q.id] = q.actual;
  if (!st.ratingOk) Object.assign(base, { ok: false }, fail('breakerFail', { id: 'F1', ka: r1(st.boardKA.duty), rated: st.rating, mva: Math.round(st.boardKA.duty * Math.sqrt(3) * SC.l23.kv), t: 0.5, h: SC.l23.outageH, ens: Math.round(SC.l23.estate.mva * SC.l23.estate.pf * SC.l23.outageH), pre: 0 }));
  else if (!st.dispatch.ok) Object.assign(base, { ok: false }, fail('dispatch', { sum: r1(st.dispatch.sumMW), need: SC.l27.ed.demandMW, within: st.dispatch.withinLimits ? 1 : 0 }));
  return base;
}

/** The study of a ch7 state: pass/fail, tracked numbers (including the prediction scores) and the cost. null outside chapter 7. */
export function studyOf(s: Readonly<GridState>): Study | null {
  if (!s.ch7) return null;
  const r = raw(s.ch7);
  r.track.score = r.score;
  const tol = s.ch7.id === 'L27' ? SC.l27.predictTolPct : SC.l23.predictTolPct;
  const preds = s.metrics.predictions.filter((p) => p.id in r.actuals);
  const primary = PRIMARY_PREDICTION[s.ch7.id];
  const errPct = (p: { predicted: number }, id: string): number => (Math.abs((p.predicted - r.actuals[id]!) / r.actuals[id]!) * 100);
  if (primary) { const p = preds.find((x) => x.id === primary); if (p) r.track.predErrPct = errPct(p, primary); }
  if (s.ch7.id === 'L27') {
    const qs = examQuestions(s.mode === 'engineer').map((q) => q.id);
    r.track.predictionsOk = preds.filter((p) => qs.includes(p.id) && errPct(p, p.id) <= tol).length;
    r.track.predictionsMade = preds.filter((p) => qs.includes(p.id)).length;
  }
  return r;
}

const lostR = (key: string, params: Params): { status: 'lost'; key: string; params: Params; stars: 0 } => ({ status: 'lost', key, params, stars: 0 });

/** The verdict of a chapter-7 level (null for every other level): budget, then the study's incident, then stars. The run is one operator block long: the player builds, then Runs. */
export function ch7Verdict(s: Readonly<GridState>, rules: Readonly<Rules>, ticksUsed: number): { status: 'playing' | 'won' | 'lost'; key: string | null; params: Params; stars: 0 | 1 | 2 | 3 } | null {
  const st = studyOf(s);
  if (!st) return null;
  if (s.budget.capexLimit > 0 && st.capex > s.budget.capexLimit + 1e-9) return lostR('level.lost.budget', { spent: Math.round(st.capex), max: Math.round(s.budget.capexLimit) });
  if (ticksUsed < 1) return { status: 'playing', key: null, params: {}, stars: 0 };
  if (!st.ok) return lostR(st.failKey!, st.failParams);
  let stars: 1 | 2 | 3 = 1;
  if (rules.starCost) {
    const v = st.score;
    const extra = rules.star3.every((r) => { const x = st.track[r.key]; return x !== undefined && (r.min === null || x >= r.min - 1e-12) && (r.max === null || x <= r.max + 1e-12); });
    if (v <= rules.starCost[0] + 1e-6) stars = 2;
    if (v <= rules.starCost[1] + 1e-6 && extra) stars = 3;
  }
  return { status: 'won', key: 'level.won', params: { stars }, stars };
}

/** The levelRules system calls this each block: it writes the study's numbers into the state (cost, tracked metrics, ENS, the predictions' actual answers). */
export function ch7Step(s: GridState): void {
  const st = studyOf(s);
  if (!st) return;
  s.budget.spent = st.capex;
  s.metrics.track = { ...s.metrics.track, ...st.track };
  s.metrics.ensMWh = st.ensMWh;
  for (const p of s.metrics.predictions) if (p.id in st.actuals) p.actual = st.actuals[p.id]!;
}
export { PLANTS };
