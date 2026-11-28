// Chapter 4 read-only queries: the live numbers of the level's circuit (what the Godot panel draws), the kit's prices, and the shift report's lesson and
// try-hint in the player's own numbers. Every number is the engine's (src/sim/ch4); the Godot side only draws.
import type { QueryFn } from '@core/kit';
import { dmath } from '@core/numerics';
import { formatMoney } from '@core/regions';
import { REGIONS } from '../../regions';
import { t } from '../../i18n';
import type { GridState } from '../../types';
import {
  BASE_MVA, CAN_RATINGS_V, CAP_UNITS_UF, EST, EXAM_IDS, FEEDER_M, HOUSES, HYDRO, MAX_CANS, NEUTRAL, NEUTRAL_SIZES, NIGHT, PHASES, PRICE10, PRICE12, PUMP, REDUCE_STEPS_MW, SERIES_PCT,
  STARTERS, VL, VREF_STEPS, V_PH, X_CIRCUIT, XS, ZEBRA, type Phase,
} from '../../sim/ch4/data';
import { neutralRatingA, solveFeeder } from '../../sim/ch4/feeder';
import { bankBursts, bankQvar, canVolts, cPerPhaseUF, motorsQvar, qcNeeded, solvePfc } from '../../sim/ch4/pfc';
import { circuitX, equalAreaPeakDeg, hydroNumbers, runSwing } from '../../sim/ch4/hydro';
import { nightAt, nightExcitationFor, ratedAnswers } from '../../sim/ch4/exam';
import { canUsd, hydroBuildOf, seriesCapUsd } from '../../sim/ch4/systems';
import type { SimParams } from '../../sim/params';

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
const polar = (z: { re: number; im: number }): { mag: number; deg: number } => ({ mag: dmath.hypot(z.re, z.im), deg: (dmath.atan2(z.im, z.re) * 180) / Math.PI });

export interface Ch4QueryDeps { getParams: (s: GridState) => SimParams }

/** The shift report's consolidation line of an L10-L13 level, with the player's numbers; '' before anything is built. */
export function ch4Lesson(s: GridState, lessonKey: string): string {
  const c = s.ch4;
  if (!c) return '';
  if (c.l10) {
    const l = c.l10, r = solveFeeder(l.phase, l.neutralMm2, 1);
    if (!r) return '';
    const sum = r.iPhase.a + r.iPhase.b + r.iPhase.c;
    return t(lessonKey, { ia: r1(r.iPhase.a), ib: r1(r.iPhase.b), ic: r1(r.iPhase.c), sum: r1(sum), iN: r1(r.iN), pct: r1(r.iNpct), iMax: r1(r.iMax), rating: neutralRatingA(l.neutralMm2), size: l.neutralMm2, vlo: r1(Math.min(...Object.values(r.vFar))), vhi: r1(Math.max(...Object.values(r.vFar))) });
  }
  if (c.l11) {
    const l = c.l11, f0 = s.region === 'in' ? 50 : 50, r = solvePfc(l.bank, l.starter, f0), need = qcNeeded(EST.kw, EST.pf, 0.95) / 1000;
    const b = l.bank;
    return t(b ? lessonKey : 'level.L11.lessonNoBank', {   // 11-28b: no bank, no bank sentence (it printed '0 V of a rating of 0 V')
      pf0: EST.pf, kw: EST.kw, need: r1(need), cy: Math.round(cPerPhaseUF(need * 1000, f0, 'Y')), cd: Math.round(cPerPhaseUF(need * 1000, f0, 'D')), q: r1(r.qBankKvar), pf: r2(r.pf),
      conn: b ? (b.conn === 'Y' ? 'star' : 'delta') : '-', cph: b ? b.unitUF * b.count : 0, canv: b ? Math.round(canVolts(b.conn)) : 0, rated: b ? b.ratedV : 0,
      mult: STARTERS[l.starter].mult, ist: Math.round(r.iStartA), ifl: Math.round(r.iFullA), dip: r1(r.dipPct),
    });
  }
  if (c.l12) {
    const sw = runSwing(hydroBuildOf(s)), n = sw.n, o = sw.out, l = c.l12;
    return t(lessonKey, { vref: l.vref, E: r2(n.E), xpre: r2(n.xPre), xpost: r2(n.xPost), pmaxpre: r2(n.pmaxPre), pmaxpost: r2(n.pmaxPost), pm: r2(n.pm), d0: Math.round(n.delta0Deg), dpost: n.deltaPostDeg === null ? '-' : Math.round(n.deltaPostDeg), peak: Math.round(o.peakDeltaDeg), du: Math.round(o.deltaUDeg), mw: Math.round(n.pm * BASE_MVA), pct: l.seriesPct });
  }
  if (c.l13) {
    const a = ratedAnswers(), night = c.l13.excitation === null ? null : nightAt(c.l13.excitation), eNeed = nightExcitationFor(NIGHT.qTarget);
    const nn = nightAt(eNeed)!;
    return t(lessonKey, { E: r2(a.E), delta: r1(a.deltaDeg), pmax: r2(a.pmax), eNeed: r3(eNeed), dNeed: r1(nn.deltaDeg), p: NIGHT.p }) + ' ' + (night ? t('level.L13.lessonE', { e: r3(c.l13.excitation!), q: r3(night.q) }) : t('level.L13.lessonNoE'));
  }
  return '';
}

const HINTS: Record<string, string> = {
  neutralBurn: 'hint.b4.neutralBurn', neutral: 'hint.b4.neutral', voltLow: 'hint.b4.voltLow', voltHigh: 'hint.b4.voltHigh', canBurst: 'hint.b4.canBurst', dip: 'hint.b4.dip', pfLow: 'hint.b4.pfLow', pfLead: 'hint.b4.pfLead',
  outOfStep: 'hint.b4.outOfStep', noEquilibrium: 'hint.b4.noEquilibrium', examPredict: 'hint.b4.examPredict',
};
/** What to try after an L10-L13 loss: from the verdict's own numbers. '' when none fits. */
export function ch4TryHint(s: GridState): string {
  const c = s.ch4;
  if (!c || s.status !== 'lost') return '';
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('hint.b4.budget');
  const k = s.block.verdictKey;
  if (!k || !k.startsWith('level.lost.b4.')) return '';
  const key = HINTS[k.slice('level.lost.b4.'.length)];
  return key ? t(key, { ...s.block.verdictParams }) : '';
}

export function buildCh4Queries(d: Ch4QueryDeps): Record<string, QueryFn<GridState>> {
  const money = (s: GridState, x: number, decimals = 0): string => formatMoney(x, REGIONS.get(s.region), { decimals });
  return {
    /** The live numbers of the running chapter-4 level's circuit. */
    ch4Status: (s) => {
      const c = s.ch4;
      if (!c) return { active: false };
      const tr = s.metrics.track;
      const head = {
        active: true, scenario: c.scenario, limits: c.limits, cost: s.budget.spent, costText: money(s, s.budget.spent), budget: s.budget.capexLimit, budgetText: money(s, s.budget.capexLimit),
        badBlocks: c.badBlocks, running: s.tick > s.levelStart, fail: c.fail ? { key: c.fail.key, now: c.fail.now, text: t(c.fail.key, c.fail.params) } : null,
        clock: hhmm(s.clock.block), done: s.status !== 'playing', won: s.status === 'won',
      };
      if (c.l10) {
        const l = c.l10, r = solveFeeder(l.phase, l.neutralMm2, 1);
        if (!r) return { ...head, error: 'solve' };
        const lo = c.limits.vLoV!, hi = c.limits.vHiV!, rating = neutralRatingA(l.neutralMm2);
        const open = solveFeeder(l.phase, l.neutralMm2, 1, true);
        const kwPh = { a: 0, b: 0, c: 0 }, kvaPh = { a: 0, b: 0, c: 0 };
        const houses = HOUSES.map((h, i) => { kwPh[l.phase[i]!] += h.kw; kvaPh[l.phase[i]!] += h.kw / h.pf; return { id: `H${i + 1}`, pole: Math.floor(i / 3) + 1, kw: h.kw, pf: h.pf, kva: r2(h.kw / h.pf), amps: r1((h.kw * 1000) / h.pf / V_PH), phase: l.phase[i]! }; });
        const ph = (z: { re: number; im: number }) => ({ re: r3(z.re), im: r3(z.im), ...polar(z) });
        return {
          ...head, houses, moved: l.phase.filter((p) => p !== 'a').length, feederM: FEEDER_M, poles: 6, nominalV: V_PH, loV: lo, hiV: hi,
          kwPh, kvaPh, iPhase: r.iPhase, iMax: r1(r.iMax), iN: r1(r.iN), iNpct: r1(r.iNpct), iNmaxPct: c.limits.neutralMaxPct,
          phasors: { a: ph(r.iPh.a), b: ph(r.iPh.b), c: ph(r.iPh.c), n: ph(r.iNc) },
          vFar: { a: r1(r.vFar.a), b: r1(r.vFar.b), c: r1(r.vFar.c) }, vLevels: Object.fromEntries(PHASES.map((p) => [p, r.vLevels[p].map(r1)])), vDevPct: r1(r.vDevPct), lossPct: r2(r.lossPct), shiftFarV: r1(r.shiftFarV),
          neutral: { mm2: l.neutralMm2, ampacityA: rating, loadPct: r1((100 * r.iN) / rating) }, openNeutralVMax: open ? r1(Math.max(...Object.values(open.vFar))) : null,
          pass: { neutral: r.iNpct <= c.limits.neutralMaxPct!, volts: Math.min(...Object.values(r.vFar)) >= lo && Math.max(...Object.values(r.vFar)) <= hi, rating: r.iN <= rating },
          starVolts: r.vDevPct <= 5, starLoss: r.lossPct <= 3,
        };
      }
      if (c.l11) {
        const l = c.l11, f0 = d.getParams(s).f0, r = solvePfc(l.bank, l.starter, f0), need = qcNeeded(EST.kw, EST.pf, c.limits.pfMin!);
        const b = l.bank;
        return {
          ...head, estateKw: EST.kw, estatePf: EST.pf, motorsKvar: r1(motorsQvar() / 1000), needKvar: r1(need / 1000), needCY: Math.round(cPerPhaseUF(need, f0, 'Y')), needCD: Math.round(cPerPhaseUF(need, f0, 'D')),
          bank: b ? { ...b, cPhaseUF: b.unitUF * b.count, canV: Math.round(canVolts(b.conn)), burst: bankBursts(b), qKvar: r1(bankQvar(b, f0) / 1000), cost: money(s, 3 * b.count * canUsd(b.unitUF, b.ratedV) * c.priceFactor) } : null,
          starter: l.starter, mult: STARTERS[l.starter].mult, pf: r3(r.pf), qNetKvar: r1(r.qNetKvar), vBusPu: r3(r.vBusPu), dipPct: r1(r.dipPct), iStartA: Math.round(r.iStartA), iFullA: Math.round(r.iFullA),
          pumpKw: PUMP.kw, started: l.started, pumpClock: hhmm(s.levelStart + l.pumpBlock + 0), pfMin: c.limits.pfMin, dipMaxPct: c.limits.dipMaxPct, starDip: r.dipPct <= 6,
          pass: { pf: r.pf >= c.limits.pfMin! - 1e-9, lead: r.qNetKvar >= 0, can: !(b && bankBursts(b)), dip: r.dipPct <= c.limits.dipMaxPct! },
          vl: VL,
        };
      }
      if (c.l12) {
        const l = c.l12, b = hydroBuildOf(s), n = hydroNumbers(b), sw = runSwing(b);
        const curves = Array.from({ length: 91 }, (_, i) => { const dd = (i * 2 * Math.PI) / 180; return { d: i * 2, pre: n.ok ? r3(n.pmaxPre * dmath.sin(dd)) : 0, post: n.ok ? r3(n.pmaxPost * dmath.sin(dd)) : 0 }; });
        const thermalMw = (ZEBRA.thermalMva * 0.95);
        return {
          ...head, build: l, pm: r3(n.pm), E: r3(n.E), delta0: r1(n.delta0Deg), xPre: r3(n.xPre), xPost: r3(n.xPost), pmaxPre: r3(n.pmaxPre), pmaxPost: r3(n.pmaxPost), deltaPost: n.deltaPostDeg === null ? null : r1(n.deltaPostDeg),
          ok: n.ok, swing: { stable: sw.out.stable, noEquilibrium: sw.out.noEquilibrium, peak: r1(sw.out.peakDeltaDeg), deltaU: r1(sw.out.deltaUDeg), tLossS: sw.out.tLossS, tS: sw.out.trace.tS, deltaDeg: sw.out.trace.deltaDeg.map(r1) },
          eaPeak: equalAreaPeakDeg(n) === null ? null : r1(equalAreaPeakDeg(n)!), curves, circuitXpu: r3(circuitX(l.seriesPct)), circuits: l.third ? 3 : 2, thermalOk: n.pm * BASE_MVA <= thermalMw, circuitMva: ZEBRA.thermalMva,
          eventClock: hhmm(l.eventBlock), fired: l.fired, record: l.swing, margin: n.ok && n.pmaxPost > 0 ? r2(n.pmaxPost / n.pm) : 0, peakMaxDeg: 70,
        };
      }
      const l = c.l13!, a = ratedAnswers(), night = l.excitation === null ? null : nightAt(l.excitation);
      const preds = Object.fromEntries(Object.entries(EXAM_IDS).map(([k, id]) => [k, s.metrics.predictions.find((p) => p.id === id)?.predicted ?? null]));
      const reveal = s.status !== 'playing';
      return {
        ...head, xs: XS, rated: { vt: 1, i: 1, pf: 0.8, iAngleDeg: -r1((dmath.acos(0.8) * 180) / Math.PI) }, predictions: preds, ids: EXAM_IDS, answers: reveal ? { E: r3(a.E), delta: r2(a.deltaDeg), pmax: r3(a.pmax) } : null,
        predErrPct: r2(tr.predErrPct ?? 100), night: { p: NIGHT.p, qTarget: NIGHT.qTarget, excitation: l.excitation, deltaDeg: night ? r2(night.deltaDeg) : null, q: night ? r3(night.q) : null, taskDone: night ? Math.abs(night.q - NIGHT.qTarget) <= c.limits.qTolPu! && night.deltaDeg < NIGHT.deltaMaxDeg : false, noSteady: l.excitation !== null && !night, answerE: reveal ? r3(nightExcitationFor(NIGHT.qTarget)) : null, deltaMaxDeg: NIGHT.deltaMaxDeg, qTolPu: c.limits.qTolPu },
      };
    },
    /** Prices and choices the panel offers (money formatted for the region). */
    ch4Kit: (s) => {
      const c = s.ch4;
      if (!c) return { active: false };
      const f = c.priceFactor, m = (usd: number): string => money(s, usd * f);
      return {
        active: true, scenario: c.scenario,
        l10: { moveHouse: m(PRICE10.moveHouse), neutrals: NEUTRAL_SIZES.map((mm2) => ({ mm2, ampacityA: NEUTRAL[mm2]!.ampacityA, rOhmKm: NEUTRAL[mm2]!.rOhmKm, upgrade: mm2 === 54.6 ? m(0) : m((NEUTRAL[mm2]!.usdPerM - NEUTRAL[54.6]!.usdPerM) * FEEDER_M + PRICE10.neutralCrew) })) },
        l11: { units: CAP_UNITS_UF, ratings: CAN_RATINGS_V, maxCans: MAX_CANS, canPrice: Object.fromEntries(CAP_UNITS_UF.flatMap((u) => CAN_RATINGS_V.map((v) => [`${u}/${v}`, m(canUsd(u, v))]))), starters: Object.entries(STARTERS).map(([id, v]) => ({ id, mult: v.mult, price: m(v.usd) })) },
        l12: { vref: VREF_STEPS, series: SERIES_PCT.map((p) => ({ pct: p, price: m(seriesCapUsd(p, 2)) })), redispatch: REDUCE_STEPS_MW.map((mw) => ({ mw, price: m(mw * PRICE12.redispatchUsdPerMw) })), circuitPrice: m(PRICE12.circuitUsdPerKm * ZEBRA.km), xCircuit: r3(X_CIRCUIT) },
      };
    },
  };
}
