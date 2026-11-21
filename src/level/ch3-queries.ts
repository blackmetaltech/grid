// Chapter 3's shift-report lessons and "what to try" hints (L07 power triangle, L08 harmonics, L09 series compensation), all in the player's own numbers.
// Every printed number comes from state or from the supply-point numbers the ch3 system recorded in `metrics.track` (src/sim/ch3/systems.ts), and each sentence's arithmetic recomputes from
// the numbers printed in it.
import { dmath } from '@core/numerics';
import { t } from '../i18n';
import type { GridState } from '../types';
import { S_BASE_MVA } from '../sim/network';
import { pathToSupply } from '../sim/ch3/series';
import type { GridLevelSpec } from './spec';

const f1 = (x: number): string => x.toFixed(1), f2 = (x: number): string => x.toFixed(2), f3 = (x: number): string => x.toFixed(3);
const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
const tan = (pf: number): number => Math.sqrt(Math.max(0, 1 - pf * pf)) / pf;
const feederRatedA = (s: GridState): number => { const b = s.branches.find((x) => x.kind === 'line'); const kv = s.buses.find((x) => x.id === b?.from)?.kvNom ?? 11; return b ? Math.round(b.ratingMVA * 1000 / (Math.sqrt(3) * kv)) : 0; };
const kvOfLoad = (s: GridState): number => s.buses.find((b) => b.id === s.loads[0]?.bus)?.kvNom ?? 11;

/** L07: S = P + jQ at the evening peak, what the bank did to it, and the 13:00 wattless current. '' until a block has run. */
export function pfLesson(s: GridState, lessonKey: string): string {
  const tr = s.metrics.track;
  if (tr.peakLoadMW === undefined || tr.peakMW === undefined) return '';
  const pl = tr.peakLoadMW, ql = tr.peakLoadMVAr ?? 0, sl = dmath.hypot(pl, ql), v = tr.peakVPu ?? 1, kv = kvOfLoad(s);
  const i0 = sl * 1000 / (Math.sqrt(3) * kv * v);
  let out = t(lessonKey, { time: hhmm(tr.peakBlock ?? 0), pl: f2(pl), ql: f2(ql), sl: f2(sl), pfl: f2(pl / sl), i0: Math.round(i0), v: f3(v), rated: feederRatedA(s) });
  // the supply point's P is what the cards show (a 1.5 tester read 1.85-1.90 MW on screen against 1.70 here): name both, and the difference
  if (tr.peakMW > pl + 0.005) out += ' ' + t('level.L07.lessonSupply', { ps: f2(tr.peakMW), pl: f2(pl), loss: f2(tr.peakMW - pl) });
  const banks = s.shunts.filter((h) => h.kind === 'cap'), qc = tr.peakBankMVAr ?? 0;
  if (banks.length > 0 && qc > 1e-9) {
    const kvar = Math.round(banks.reduce((a, h) => a + h.mvarStep * h.steps, 0) * 1000), qf = ql - qc, sf = dmath.hypot(pl, qf);
    out += ' ' + t('level.L07.lessonBank', { kvar, qc: f2(qc), qf: f2(qf), sf: f2(sf), pf: f2(pl / sf), amps: Math.round(sf * 1000 / (Math.sqrt(3) * kv * v)), v: f3(v), t1: f2(tan(pl / sl)), t2: f2(tan(0.95)) });
  } else out += ' ' + t('level.L07.lessonNoBank', { amps: Math.round(tr.peakAmps ?? 0), pf: f2(tr.pfAtPeak ?? 0) });
  if (tr.noonAmps !== undefined && tr.noonMW !== undefined) out += ' ' + t('level.L07.lessonNoon', { nkw: Math.round(tr.noonMW * 1000), nam: Math.round(tr.noonAmps), npf: f2(tr.noonPf ?? 0) });
  return out;
}

/** L08: the bank's resonance, the 5th-harmonic current, the bank's rms current and the THD. */
export function harmLesson(s: GridState, lessonKey: string): string {
  const tr = s.metrics.track;
  if (tr.thdPct === undefined) return '';
  const i1 = tr.harmI1A ?? 0, i5 = i1 / 5, thd = f1(tr.thdPct);
  if (tr.harmQkvar === undefined) return t('level.L08.lessonNone', { thd, i5: f1(i5) });
  const p = tr.harmDetune ?? 0, h = tr.harmH ?? 0, common = { kvar: tr.harmQkvar, ssc: Math.round(tr.harmSscMVA ?? 0), h: f2(h), hz: Math.round(h * 50), i5: f1(i5), i1: f1(i1), ratio: f2(tr.capRmsRatio ?? 0), cap: f1(tr.harmCapA ?? 0), rated: f1(tr.harmRatedA ?? 0), thd };
  return p > 0 ? t(lessonKey + 'Detuned', { ...common, p: Number(p.toFixed(2)), hs: f2(1 / Math.sqrt(p / 100)) }) : t(lessonKey, common);
}

/** L09: the drop formula in the player's numbers, the fault with and without the capacitor, the loop's resonant frequency. */
export function seriesLesson(s: GridState, lessonKey: string): string {
  const tr = s.metrics.track, line = s.branches.find((b) => b.kind === 'line');
  if (!line || tr.peakLoadMW === undefined) return '';
  const kv = s.buses.find((b) => b.id === line.from)?.kvNom ?? 33, zb = kv * kv / S_BASE_MVA, xl = (line.seriesCap?.xGross ?? line.x) * zb, r = line.r * zb;
  const k = line.seriesCap?.pct ?? 0, xc = xl * k / 100, p = tr.peakLoadMW, q = tr.peakLoadMVAr ?? 0, dv = (r * p + (xl - xc) * q) / (kv * kv) * 100;
  const base = { r: f2(r), xl: f2(xl), xc: f2(xc), p: f2(p), q: f2(q), kv, dv: f1(dv), v: f3(tr.loadVMinPu ?? 0), k };
  if (k === 0) return t(lessonKey + 'None', base);
  if (tr.faultKA === undefined) return '';   // the fault has not happened yet
  return t(lessonKey, { ...base, ka: f2(tr.faultKA), ka0: f2(tr.faultKA0 ?? 0), max: f2(s.rules.ch3?.fault?.breakerKA ?? 0), fres: f1(tr.faultFResHz ?? 0) });
}

/** The incident report's "what to try" for a chapter 3 loss. '' when none fits. */
export function ch3TryHint(s: GridState): string {
  if (s.status !== 'lost' || !s.rules.ch3) return '';
  const tr = s.metrics.track, c = s.rules.ch3, key = s.block.verdictKey ?? '';
  const over = s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit;
  if (c.harmonics) {
    if (over) return t('level.L08.tryBudget');
    if (key === 'level.lost.capFuse') { const sh = tr.capFuseKvar ?? 900, ssc = tr.harmSscMVA ?? 22; return t('level.L08.tryFuse', { h: f2(tr.capFuseH ?? 0), near: tr.capFuseNear ?? 5, h7: f2(Math.sqrt(1 / (sh / 1000 / ssc + 0.07))) }); }
    if (key === 'level.lost.thd') return t('level.L08.tryThd', { thd: f1(tr.thdPct ?? 0) });
    if (key === 'level.lost.pfPeak') {
      const pf = tr.pfAtPeak ?? 0, need = (tr.peakMW ?? 0) * (tan(pf) - tan(c.pfPeakMin ?? 0.95)) * 1000;
      return t('level.L08.tryPf', { pf: f2(pf), qc: Math.max(50, Math.round(need / 50) * 50) });
    }
    return '';
  }
  if (c.fault) {
    if (over) return t('level.L09.tryBudget');
    const line = pathToSupply(s, c.fault.bus)[0], zb = 33 * 33 / S_BASE_MVA;
    if (key === 'level.lost.farVoltage') { const xl = (line?.seriesCap?.xGross ?? line?.x ?? 0) * zb, k = line?.seriesCap?.pct ?? 0; return t('level.L09.tryVoltage', { v: f3(tr.loadVMinPu ?? 0), k, xl: f2(xl), xc: f2(xl * k / 100) }); }
    if (key === 'level.lost.breakerFail') return t('level.L09.tryBreaker', { k: line?.seriesCap?.pct ?? 0, ka: f2(tr.faultKA ?? 0), max: f2(c.fault.breakerKA), ka0: f2(tr.faultKA0 ?? 0) });
    return '';
  }
  // L07
  if (over) return t('level.L07.tryBudget');
  const pct = Math.round(Math.max(tr.peakLoading ?? 0, 0) * 100);
  const banks = s.shunts.filter((h) => h.kind === 'cap'), load = s.loads[0]?.bus;
  const whyBank = banks.length === 0 ? t('level.L07.tryNoBank') + ' ' : banks.every((h) => h.bus !== load) ? t('level.L07.tryBankWrong', { bus: banks[0]!.bus }) + ' ' : (tr.peakBankMVAr ?? 0) <= 1e-9 ? t('level.L07.tryBankOut') + ' ' : '';
  if (whyBank && (key === 'level.lost.blackout' || (tr.overloadTrips ?? 0) > 0 || key.startsWith('level.lost.poorSupply'))) return whyBank + t('level.L07.tryOverload', { pct, time: hhmm(tr.peakBlock ?? 80), qc: f2((tr.peakLoadMW ?? 1.7) * (tan((tr.peakLoadMW ?? 1.7) / dmath.hypot(tr.peakLoadMW ?? 1.7, tr.peakLoadMVAr ?? 1.4)) - tan(0.95))) });
  if ((tr.overloadTrips ?? 0) > 0 || key === 'level.lost.blackout') {
    const pl = tr.peakLoadMW ?? 1.7, pf = tr.peakLoadMW ? pl / dmath.hypot(pl, tr.peakLoadMVAr ?? 0) : 0.77;
    return t('level.L07.tryOverload', { pct, time: hhmm(tr.peakBlock ?? 80), qc: f2(pl * (tan(pf) - tan(0.95))) });
  }
  if (key.startsWith('level.lost.poorSupply')) return t('level.L07.tryVoltage', { v: f3(tr.loadVMinPu ?? 0) });
  return '';
}

export const isCh3 = (spec: GridLevelSpec): boolean => spec.story?.lessonKind === 'pf' || spec.story?.lessonKind === 'harm' || spec.story?.lessonKind === 'series';
