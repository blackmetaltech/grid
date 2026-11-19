// The chapter-8 study dispatcher: one pure function from the player's design (state.ch8) to what the level checks (pass or fail with the incident report's numbers, the tracked metrics,
// the build cost in pack currency, the star score) plus the verdict that levelResult returns. Never stored in the state, always recomputed from src/sim/distrib.
import type { GridState, Rules } from '../../types';
import { L31, L35, L35S, L32, L33, L34, L36, V_LO_PU, r1, r2, r3 } from './data';
import { studyVoltage, studyPv, handDropPct, custId } from './feeder';
import { studyL32 } from './reliab';
import { studyL33 } from './protect';
import { studyL34 } from './subst';
import { examAnswers, EXAM_IDS } from './exam';
import type { Ch8State } from './state';

type Params = Record<string, string | number>;
export type Ch8Fail = 'voltageLow' | 'voltageHigh' | 'overload' | 'pvShort' | 'reliability' | 'miscoordination' | 'fuseBlown' | 'fuseLoad' | 'blind' | 'nuisance' | 'overheat' | 'notRestored' | 'noPrediction';
export const CH8_FAIL_KINDS: Ch8Fail[] = ['voltageLow', 'voltageHigh', 'overload', 'pvShort', 'reliability', 'miscoordination', 'fuseBlown', 'fuseLoad', 'blind', 'nuisance', 'overheat', 'notRestored', 'noPrediction'];

export interface Study {
  id: Ch8State['id']; ok: boolean; kind: Ch8Fail | null; failKey: string | null; failParams: Params;
  /** Build cost in pack currency (what `budget.spent` shows). */
  capex: number;
  /** The star score: build cost in pack currency, or (L36) the worst prediction error in percent. Lower is better. */
  score: number;
  ensMWh: number;
  track: Record<string, number>;
  /** Predictions: id -> the engine's answer for the design as it stands. */
  actuals: Record<string, number>;
}

const fail = (kind: Ch8Fail, params: Params): { kind: Ch8Fail; failKey: string; failParams: Params } => ({ kind, failKey: `level.lost.ch8.${kind}`, failParams: params });
const hh = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fin = (x: number): number => (Number.isFinite(x) ? x : 1e6);

/** The prediction ids of a level and the error (percent) of a prediction against the engine. */
export const errPct = (predicted: number, actual: number): number => (Math.abs((predicted - actual) / actual) * 100);

function raw(c: Ch8State, s: Readonly<GridState>): Study {
  const m = c.money, hi = c.vHiPu;
  const base: Study = { id: c.id, ok: true, kind: null, failKey: null, failParams: {}, capex: 0, score: 0, ensMWh: 0, track: {}, actuals: {} };
  const voltFail = (st: { minV: number; minNode: string; maxV: number; maxNode: string; marginLoPu: number; marginHiPu: number }, where: string): void => {
    const low = st.marginLoPu <= st.marginHiPu;
    Object.assign(base, { ok: false }, fail(low ? 'voltageLow' : 'voltageHigh', low
      ? { nodeId: st.minNode, v: r1(st.minV), lim: r1(V_LO_PU * 230), pct: r1((st.minV / 230 - 1) * 100), when: where }
      : { nodeId: st.maxNode, v: r1(st.maxV), lim: r1(hi * 230), pct: r1((st.maxV / 230 - 1) * 100), when: where }));
  };
  if (c.id === 'L31') {
    const d = c.l31!, st = studyVoltage(L31, d, hi);
    Object.assign(base, { capex: st.capexUSD * m, score: st.capexUSD * m });
    base.track = { marginPu: st.marginPu, vMinV: st.minV, vMaxV: st.maxV, lossPct: st.lossPct, loadingMax: st.loadingMax, handDropPct: handDropPct(L31, d), farDropPct: (1 - st.peak.byId[custId(L31.nodes[4]!)]!.vPu) * 100, regSteps: st.regStepPeak };
    if (st.loadingMax > 1) Object.assign(base, { ok: false }, fail('overload', { section: st.loadingSection, i: Math.round(st.peak.sections.find((x) => x.id === st.loadingSection)!.currentA), pct: Math.round(st.loadingMax * 100) }));
    else if (st.marginPu < 0) voltFail(st, st.marginLoPu <= st.marginHiPu ? 'peak' : 'min');
    return base;
  }
  if (c.id === 'L32') {
    const d = c.l32!, st = studyL32(d), r = st.rel;
    Object.assign(base, { capex: st.capexUSD * m, score: st.capexUSD * m, ensMWh: r.ensMWh });
    base.track = { saidiMin: r.saidi, saifi: r.saifi, caidi: r.caidi, ensMWh: r.ensMWh, faultsPerYear: r.faultsPerYear, used: st.used };
    if (!st.saidiOk || !st.saifiOk) Object.assign(base, { ok: false }, fail('reliability', { saidi: r1(r.saidi), saidiMax: L32.saidiMaxMin, saifi: r2(r.saifi), saifiMax: L32.saifiMax, caidi: r1(r.caidi), worst: st.worst.id, worstMin: r1(st.worst.saidiMin), faults: r2(r.faultsPerYear) }));
    return base;
  }
  if (c.id === 'L33') {
    const d = c.l33!, st = studyL33(d);
    base.score = st.scoreS;
    base.track = { marginS: st.marginS, blowsPerYear: st.blowsPerYear, customersOut: st.customersOut };
    const b = st.bad;
    if (st.kind && b) {
      const sp = L33.spurs.find((x) => x.id === b.id)!;
      const common = { spur: b.id, fuse: b.fuseA, pickup: d.pickupA, n: st.customersOut };
      if (st.kind === 'miscoordination') {
        // the current at which the slow curve is quicker than total clearing by most
        const worst = b.coord.points.reduce((a, p) => (p.marginSlow < a.marginSlow ? p : a));
        Object.assign(base, { ok: false }, fail('miscoordination', { ...common, amps: Math.round(worst.currentA), tSlow: r3(worst.tSlow), tTc: r3(worst.tTC) }));
      } else if (st.kind === 'fuseBlown') {
        const worst = b.coord.points.reduce((a, p) => (p.marginFast < a.marginFast ? p : a));
        Object.assign(base, { ok: false }, fail('fuseBlown', { ...common, amps: Math.round(worst.currentA), tFast: r3(worst.tFast), tMm: r3(worst.tMM), shots: d.fastShots, n: sp.customers }));
      } else if (st.kind === 'fuseLoad') Object.assign(base, { ok: false }, fail('fuseLoad', { ...common, load: sp.loadA, need: Math.ceil(L33.fuseLoadFactor * sp.loadA) }));
      else if (st.kind === 'blind') Object.assign(base, { ok: false }, fail('blind', { ...common, imin: sp.iMinA, melt: Math.round(2.2 * b.fuseA), see: Math.round(d.pickupA * 1.05) }));
    } else if (st.kind === 'nuisance') Object.assign(base, { ok: false }, fail('nuisance', { pickup: d.pickupA, load: L33.headLoadA, need: Math.ceil(1.25 * L33.headLoadA) }));
    return base;
  }
  if (c.id === 'L34') {
    const d = c.l34!, st = studyL34(d);
    Object.assign(base, { capex: st.capexUSD * m, score: st.capexUSD * m, ensMWh: st.unservedMWh });
    base.track = { hotMarginC: L34.hotSpotLimitC - st.hotPeakC, hotPeakC: st.hotPeakC, lolDays: st.lolDays, restoredAtH: st.restoredAtH, firmMva: st.firmMva, unservedMWh: st.unservedMWh };
    if (st.overheat) Object.assign(base, { ok: false }, fail('overheat', { hot: r1(st.hotPeakC), lim: L34.hotSpotLimitC, at: hh(L34.tripHour + st.hotPeakAtH), k: r2(Math.min(L34.peakMva, st.firmMva * L34.kMaxShed) / st.firmMva), firm: r1(st.firmMva), peak: L34.peakMva }));
    else if (st.notRestored) Object.assign(base, { ok: false }, fail('notRestored', { at: r1(st.restoredAtH), limit: L34.restoreWithinH, mwh: r1(st.unservedMWh), firm: r1(st.firmMva), peak: L34.peakMva }));
    return base;
  }
  if (c.id === 'L35') {
    const d = c.l35!;
    const st = studyPv(L35, d.feeder, { pvKw: d.pvLimitKw, oltcSetPu: d.oltcSetPu, ldc: d.ldc, voltVar: d.voltVar, sites: L35S.pvNodes, noonLoad: L35S.noonLoadFrac, eveningLoad: L35S.eveningLoadFrac }, hi, L35S.oltc);
    const cap = st.capexUSD + (d.ldc ? L35S.price.oltcLdc : 0) + (d.voltVar ? L35S.price.voltVar : 0);
    Object.assign(base, { capex: cap * m, score: cap * m });
    base.track = { bought: cap > 0 ? 1 : 0, marginPu: st.marginPu, pvKw: d.pvLimitKw, vMaxV: st.maxV, vMinV: st.minV, reverseFlow: st.reverseFlow ? 1 : 0, oltcStepNoon: st.noon.oltcStep, oltcStepEve: st.evening.oltcStep };
    if (d.pvLimitKw < L35S.minPvKw) Object.assign(base, { ok: false }, fail('pvShort', { pv: d.pvLimitKw, need: L35S.minPvKw }));
    else if (st.marginPu < 0) {
      const high = st.marginHiPu < 0;   // noon first: the PV is this level's cause, the evening dip is the feeder's old problem
      Object.assign(base, { ok: false }, fail(high ? 'voltageHigh' : 'voltageLow', high ? { nodeId: st.maxNode, v: r1(st.maxV), lim: r1(hi * 230), pct: r1((st.maxV / 230 - 1) * 100), when: 'noon' } : { nodeId: st.minNode, v: r1(st.minV), lim: r1(V_LO_PU * 230), pct: r1((st.minV / 230 - 1) * 100), when: 'evening' }));
    }
    return base;
  }
  // L36
  const a = examAnswers();
  base.actuals = { dropPct: a.dropPct, saifi: a.saifi, saidi: a.saidi };
  base.track = { dropPct: a.dropPct };
  void s;
  return base;
}

/** The study of a ch8 state: pass/fail, tracked numbers (including the prediction scores) and the cost. null outside chapter 8. */
export function studyOf(s: Readonly<GridState>): Study | null {
  if (!s.ch8) return null;
  const r = raw(s.ch8, s);
  r.track.score = r.score;
  const preds = s.metrics.predictions.filter((p) => p.id in r.actuals);
  if (s.ch8.id === 'L36') {
    const made = EXAM_IDS.filter((id) => preds.some((p) => p.id === id));
    const errs = EXAM_IDS.map((id) => { const p = preds.find((x) => x.id === id); return p ? errPct(p.predicted, r.actuals[id]!) : 1e3; });
    r.track.predictionsMade = made.length; r.track.predErrPct = Math.max(...errs);
    r.track.predictionsOk5 = errs.filter((e) => e <= L36.tolPct).length; r.track.predictionsOk1 = errs.filter((e) => e <= L36.tolStarPct).length;
    r.track.whyOk = s.ch8.l36!.why === L36.whyRight ? 1 : 0; r.track.score = made.length === 3 ? r.track.predErrPct : 1e3; r.score = r.track.score;
    if (made.length < 3) Object.assign(r, { ok: false }, fail('noPrediction', { n: made.length }));
  }
  return r;
}

const lostR = (key: string, params: Params): { status: 'lost'; key: string; params: Params; stars: 0 } => ({ status: 'lost', key, params, stars: 0 });
const meets = (rs: readonly { key: string; min: number | null; max: number | null }[], track: Record<string, number>): boolean => rs.every((r) => { const x = track[r.key]; return x !== undefined && (r.min === null || x >= r.min - 1e-12) && (r.max === null || x <= r.max + 1e-12); });

/** The verdict of a chapter-8 level (null for every other level): budget, then the study's incident, then stars. The run is one operator block long: the player builds, then Runs. */
export function ch8Verdict(s: Readonly<GridState>, rules: Readonly<Rules>, ticksUsed: number): { status: 'playing' | 'won' | 'lost'; key: string | null; params: Params; stars: 0 | 1 | 2 | 3 } | null {
  const st = studyOf(s);
  if (!st) return null;
  if (s.budget.capexLimit > 0 && st.capex > s.budget.capexLimit + 1e-9) return lostR('level.lost.budget', { spent: Math.round(st.capex), max: Math.round(s.budget.capexLimit) });
  if (ticksUsed < 1) return { status: 'playing', key: null, params: {}, stars: 0 };
  if (!st.ok) return lostR(st.failKey!, st.failParams);
  let stars: 1 | 2 | 3 = 1;
  if (s.ch8!.id === 'L36') {
    if (st.track.predictionsOk5 === 3) stars = 2;
    if (st.track.predictionsOk1 === 3 && st.track.whyOk === 1) stars = 3;
  } else if (rules.starCost) {
    const v = st.score, x2 = meets(rules.star2 ?? [], st.track), x3 = meets(rules.star3, st.track);
    if (v <= rules.starCost[0] + 1e-6 && x2) stars = 2;
    if (v <= rules.starCost[1] + 1e-6 && x2 && x3) stars = 3;
  }
  return { status: 'won', key: 'level.won', params: { stars }, stars };
}

/** The levelRules system calls this each block: it writes the study's numbers into the state (cost, tracked metrics, ENS, the predictions' actual answers). */
export function ch8Step(s: GridState): void {
  const st = studyOf(s);
  if (!st) return;
  s.budget.spent = st.capex;
  s.metrics.track = { ...s.metrics.track, ...st.track };
  s.metrics.ensMWh = st.ensMWh;
  for (const p of s.metrics.predictions) if (p.id in st.actuals) p.actual = st.actuals[p.id]!;
}
export { fin };
