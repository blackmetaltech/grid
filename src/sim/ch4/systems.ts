// The chapter 4 system (one entry of the pipeline, before `levelRules`) and the chapter's part of the verdict. Everything is gated on `state.ch4`, so no other
// level sees it. It solves the level's circuit once per block, writes the tracked metrics the star rules read, prices the build, and records why the circuit
// is failing; `ch4Verdict` turns that into a loss (at once for a burnt neutral, a burst can, the pump's start or the swing; after an hour of grace otherwise).
import { log } from '@core/kit';
import type { GridState, Rules } from '../../types';
import { t } from '../../i18n';
import type { SimParams } from '../params';
import { BASE_MVA, CAP_USD_PER_KVAR, EST, EXAM_IDS, FEEDER_M, NEUTRAL, NEUTRAL_STD, NIGHT, PRICE10, PRICE12, SHAPE, STARTERS, V_PH, ZEBRA } from './data';
import { solveFeeder, neutralRatingA } from './feeder';
import { bankBursts, canVolts, qcNeeded, solvePfc } from './pfc';
import { runSwing, type HydroBuild } from './hydro';
import { nightAt, ratedAnswers } from './exam';
import type { Ch4Fail } from './state';

export const GRACE_BLOCKS = 4;
const STARTER_WORD = { dol: 'b4.starter.dol', yd: 'b4.starter.yd', soft: 'b4.starter.soft' } as const;
const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;

// ---- cost of the build, pack currency ----------------------------------------------------------------------------------------------------------
export function canUsd(unitUF: number, ratedV: number): number {
  return (CAP_USD_PER_KVAR * 2 * Math.PI * 50 * unitUF * 1e-6 * ratedV * ratedV) / 1000;   // price of one can at its rated kVAr
}
export function seriesCapUsd(seriesPct: number, circuits: number): number {
  if (seriesPct <= 0) return 0;
  const iA = (ZEBRA.thermalMva * 1e6) / (Math.sqrt(3) * ZEBRA.kv * 1000), xcOhm = (seriesPct / 100) * (ZEBRA.xOhmKm * ZEBRA.km);
  return circuits * ((3 * iA * iA * xcOhm) / 1000) * PRICE12.seriesUsdPerKvar;
}
export function ch4Cost(s: Readonly<GridState>): number {
  const c = s.ch4; if (!c) return 0;
  let usd = 0;
  if (c.l10) {
    const moved = c.l10.phase.filter((p) => p !== 'a').length;
    usd += moved * PRICE10.moveHouse;
    if (c.l10.neutralMm2 !== NEUTRAL_STD) usd += (NEUTRAL[c.l10.neutralMm2]!.usdPerM - NEUTRAL[NEUTRAL_STD]!.usdPerM) * FEEDER_M + PRICE10.neutralCrew;
  }
  if (c.l11) {
    if (c.l11.bank) usd += 3 * c.l11.bank.count * canUsd(c.l11.bank.unitUF, c.l11.bank.ratedV);
    usd += STARTERS[c.l11.starter].usd;
  }
  if (c.l12) {
    const l = c.l12;
    usd += seriesCapUsd(l.seriesPct, l.third ? 3 : 2) + l.reduceMW * PRICE12.redispatchUsdPerMw + (l.third ? PRICE12.circuitUsdPerKm * ZEBRA.km : 0);
  }
  return usd * c.priceFactor;
}

// ---- the system --------------------------------------------------------------------------------------------------------------------------------
const push = (s: GridState, element: string, causeKey: string): void => { s.events.log.push({ day: s.clock.day, block: s.clock.block, tS: 0, element, causeKey }); if (s.events.log.length > 200) s.events.log.splice(0, s.events.log.length - 200); };

export function ch4Step(s: GridState, p: SimParams): void {
  const c = s.ch4;
  if (!c) return;
  const tr = s.metrics.track, k = Math.max(0, s.tick - s.levelStart);   // block of the run (0-based): the pipeline has not advanced the tick yet
  let fail: Ch4Fail | null = null;
  if (c.l10) fail = step10(s, k);
  else if (c.l11) fail = step11(s, k, p.f0);
  else if (c.l12) fail = step12(s);
  else if (c.l13) fail = step13(s);
  c.fail = fail;
  if (fail && !fail.now) c.badBlocks += 1;
  tr.badBlocks = c.badBlocks;
  s.budget.spent = ch4Cost(s);
}

function step10(s: GridState, k: number): Ch4Fail | null {
  const c = s.ch4!, l = c.l10!, tr = s.metrics.track, lim = c.limits;
  const scale = SHAPE[Math.min(k, SHAPE.length - 1)]!;
  const r = solveFeeder(l.phase, l.neutralMm2, scale);
  if (!r) return { key: 'level.lost.b4.solve', params: {}, now: true };
  const rating = neutralRatingA(l.neutralMm2);
  const vLo = Math.min(...Object.values(r.vFar)), vHi = Math.max(...Object.values(r.vFar));
  tr.neutralPct = Math.max(tr.neutralPct ?? 0, r.iNpct); tr.iNA = Math.max(tr.iNA ?? 0, r.iN); tr.iMaxA = Math.max(tr.iMaxA ?? 0, r.iMax);
  tr.neutralLoadPct = Math.max(tr.neutralLoadPct ?? 0, (100 * r.iN) / rating);
  tr.vFarMinV = Math.min(tr.vFarMinV ?? Infinity, vLo); tr.vFarMaxV = Math.max(tr.vFarMaxV ?? 0, vHi); tr.vDevPct = Math.max(tr.vDevPct ?? 0, r.vDevPct);
  tr.lossWh = (tr.lossWh ?? 0) + (r.lossPct / 100) * r.pSupplyW * 0.25; tr.supplyWh = (tr.supplyWh ?? 0) + r.pSupplyW * 0.25;
  tr.lossPct = tr.supplyWh > 0 ? (100 * tr.lossWh) / tr.supplyWh : 0;
  const when = hhmm(s.clock.block);
  if (r.iN > rating) {
    const open = solveFeeder(l.phase, l.neutralMm2, scale, true);
    push(s, 'neutral', 'ch4.neutralBurn'); log(s, t('log.b4.neutralBurn', { i: r1(r.iN), rating, time: when }), 'bad');
    return { key: 'level.lost.b4.neutralBurn', params: { i: r1(r.iN), rating, size: l.neutralMm2, time: when, vMax: open ? Math.round(Math.max(...Object.values(open.vFar))) : 0, vNom: V_PH }, now: true };
  }
  if (r.iNpct > lim.neutralMaxPct!) return { key: 'level.lost.b4.neutral', params: { pct: r1(r.iNpct), max: lim.neutralMaxPct!, iN: r1(r.iN), iMax: r1(r.iMax), time: when }, now: false };
  const lo = lim.vLoV!, hi = lim.vHiV!;
  if (vLo < lo || vHi > hi) {
    const low = V_PH - vLo >= vHi - V_PH, ph = (Object.entries(r.vFar).find(([, v]) => v === (low ? vLo : vHi)) ?? ['a'])[0];
    return { key: low ? 'level.lost.b4.voltLow' : 'level.lost.b4.voltHigh', params: { phase: ph, v: r1(low ? vLo : vHi), lo: Math.round(lo), hi: Math.round(hi), time: when }, now: false };
  }
  return null;
}

function step11(s: GridState, k: number, f0: number): Ch4Fail | null {
  const c = s.ch4!, l = c.l11!, tr = s.metrics.track, lim = c.limits;
  const r = solvePfc(l.bank, l.starter, f0);
  tr.pfBus = r.pf; tr.qBankKvar = r.qBankKvar; tr.vBusPu = r.vBusPu;
  if (l.bank && bankBursts(l.bank)) {
    tr.canBurst = 1; push(s, 'bank', 'ch4.canBurst'); log(s, t('log.b4.canBurst', { v: Math.round(canVolts(l.bank.conn)), rated: l.bank.ratedV }), 'bad');
    return { key: 'level.lost.b4.canBurst', params: { v: Math.round(canVolts(l.bank.conn)), rated: l.bank.ratedV, conn: l.bank.conn === 'Y' ? 'star' : 'delta', vl: 400 }, now: true };
  }
  if (k >= l.pumpBlock && !l.started) {
    l.started = true; tr.dipPct = r.dipPct; tr.iStartA = r.iStartA;
    push(s, 'pump', 'ch4.pumpStart');
    if (r.dipPct > lim.dipMaxPct!) { log(s, t('log.b4.dip', { dip: r1(r.dipPct), max: lim.dipMaxPct! }), 'bad'); return { key: 'level.lost.b4.dip', params: { dip: r1(r.dipPct), max: lim.dipMaxPct!, iSt: Math.round(r.iStartA), iFl: Math.round(r.iFullA), starter: t(STARTER_WORD[l.starter]) }, now: true }; }
  }
  if (r.pf < lim.pfMin! - 1e-9) return { key: 'level.lost.b4.pfLow', params: { pf: r2(r.pf), min: lim.pfMin!, q: Math.round(r.qBankKvar), need: Math.round(qcNeeded(EST.kw, EST.pf, lim.pfMin!) / 1000) }, now: false };
  if (r.qNetKvar < 0) return { key: 'level.lost.b4.pfLead', params: { q: Math.round(r.qBankKvar), qm: Math.round(r.qBankKvar + r.qNetKvar) }, now: false };
  return null;
}

export const hydroBuildOf = (s: Readonly<GridState>): HydroBuild => { const l = s.ch4!.l12!; return { vref: l.vref, seriesPct: l.seriesPct, third: l.third, reduceMW: l.reduceMW }; };

function step12(s: GridState): Ch4Fail | null {
  const c = s.ch4!, l = c.l12!, tr = s.metrics.track;
  const b = hydroBuildOf(s);
  if (!l.fired) {
    const sw = runSwing(b), n = sw.n;
    tr.pmaxPre = n.pmaxPre; tr.pmaxPost = n.pmaxPost; tr.emfPu = n.E; tr.deltaPostDeg = n.deltaPostDeg ?? 0;
    if (s.clock.block >= l.eventBlock) {
      l.fired = true;
      l.swing = { stable: sw.out.stable, noEquilibrium: sw.out.noEquilibrium, peakDeltaDeg: sw.out.peakDeltaDeg, deltaUDeg: sw.out.deltaUDeg, tLossS: sw.out.tLossS, trace: sw.out.trace };
      tr.peakDeltaDeg = sw.out.peakDeltaDeg; tr.outOfStep = sw.out.stable ? 0 : 1; tr.deltaUDeg = sw.out.deltaUDeg;
      push(s, 'line', 'ch4.circuitLost');
      if (!sw.out.stable) { push(s, 'KFH', 'ch4.outOfStep'); log(s, t('log.b4.outOfStep', { time: hhmm(s.clock.block) }), 'bad'); }
      else log(s, t('log.b4.swingOk', { peak: r1(sw.out.peakDeltaDeg) }));
    }
  }
  if (l.fired && l.swing && !l.swing.stable) {
    const n = runSwing(b).n;
    return { key: l.swing.noEquilibrium ? 'level.lost.b4.noEquilibrium' : 'level.lost.b4.outOfStep', params: {
      time: hhmm(l.eventBlock), pm: r2(n.pm), pmaxPost: r2(n.pmaxPost), pmaxPre: r2(n.pmaxPre), du: r1(l.swing.deltaUDeg), peak: r1(l.swing.peakDeltaDeg), tLoss: l.swing.tLossS === null ? 0 : Math.round(l.swing.tLossS * 1000), vref: b.vref, mw: Math.round(n.pm * BASE_MVA),
    }, now: true };
  }
  return null;
}

function step13(s: GridState): Ch4Fail | null {
  const c = s.ch4!, l = c.l13!, tr = s.metrics.track, lim = c.limits;
  const a = ratedAnswers(), truth = { [EXAM_IDS.E]: a.E, [EXAM_IDS.delta]: a.deltaDeg, [EXAM_IDS.pmax]: a.pmax };
  let worst = 0, missing = 0;
  for (const [id, val] of Object.entries(truth)) {
    const pr = s.metrics.predictions.find((x) => x.id === id);
    if (!pr) { missing += 1; continue; }
    pr.actual = val;
    worst = Math.max(worst, (100 * Math.abs(pr.predicted - val)) / Math.abs(val));
  }
  tr.predMissing = missing; tr.predErrPct = missing > 0 ? 100 : worst;
  const n = l.excitation === null ? null : nightAt(l.excitation);
  tr.qErrPu = n ? Math.abs(n.q - NIGHT.qTarget) : 1; tr.nightDeltaDeg = n ? n.deltaDeg : 0; tr.nightQ = n ? n.q : 0;
  tr.taskDone = n && Math.abs(n.q - NIGHT.qTarget) <= lim.qTolPu! && n.deltaDeg < NIGHT.deltaMaxDeg ? 1 : 0;
  if (tr.predErrPct > lim.predMaxPct!) return { key: 'level.lost.b4.examPredict', params: { miss: missing, err: r1(tr.predErrPct), max: lim.predMaxPct!, E: r2(a.E), delta: r1(a.deltaDeg), pmax: r2(a.pmax) }, now: false };
  return null;
}

export interface Ch4Verdict { key: string; params: Record<string, string | number> }
/** The chapter's losses; null when none applies (the generic rules go on). */
export function ch4Verdict(s: Readonly<GridState>, rules: Readonly<Rules>, ticksUsed: number): Ch4Verdict | null {
  const c = s.ch4;
  if (!c || !c.fail) return null;
  const atEnd = rules.horizonBlocks !== null && ticksUsed >= rules.horizonBlocks;
  if (c.fail.now || c.badBlocks > GRACE_BLOCKS - 1 || atEnd) return { key: c.fail.key, params: c.fail.params };
  return null;
}

/** L13 only: the exam's stars. A passed exam is one star; the task done is two; the star-3 conditions on top are three. Everything else: the generic stars. */
export function ch4Stars(s: Readonly<GridState>, stars: 1 | 2 | 3): 1 | 2 | 3 {
  const c = s.ch4;
  if (!c?.l13) return stars;
  return (s.metrics.track.taskDone ?? 0) > 0 ? stars : 1;
}
