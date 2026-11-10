// The chapter 3 system (one entry of the pipeline, after `metrics`, before `levelRules`) and the chapter's part of the verdict. Everything is gated on
// `state.rules.ch3`, so no other level sees it. It measures (supply-point peak and noon numbers, lowest loaded-bus voltage), runs the L08 harmonic study
// (blowing the capacitor fuse above the IEC 60871 current limit) and the L09 scripted fault (the feeder breaker fails above its breaking current).
import { log } from '@core/kit';
import type { GridState, Rules } from '../../types';
import { t } from '../../i18n';
import { harmonicStudy } from './harmonics';
import { faultStudy } from './series';
import { solvedOf } from '../solved';

const NOON_BLOCK = 52;
const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
const push = (s: GridState, element: string, causeKey: string): void => { s.events.log.push({ day: s.clock.day, block: s.clock.block, tS: 0, element, causeKey }); if (s.events.log.length > 200) s.events.log.splice(0, s.events.log.length - 200); };

export function ch3Step(s: GridState, f0: number): void {
  const c = s.rules.ch3;
  if (!c) return;
  const tr = s.metrics.track, solved = solvedOf(s);
  if (c.track && solved) {
    const lit = s.loads.every((l) => solved.sol.energised[l.bus] !== false);   // a block with a dark load bus is a trip, not a peak
    const p = s.units.reduce((a, u) => a + (u.online ? u.P : 0), 0), q = s.units.reduce((a, u) => a + (u.online ? u.Q : 0), 0);
    const amps = Math.max(0, ...s.branches.map((b) => (b.inService ? (solved.flows.branch[b.id]?.iKA ?? 0) * 1000 : 0)));
    const pf = p > 1e-9 ? p / Math.hypot(p, q) : 1;
    if (lit && p > (tr.peakMW ?? -1)) {
      tr.peakMW = p; tr.peakMVAr = q; tr.pfAtPeak = pf; tr.peakAmps = amps; tr.peakBlock = s.clock.block;
      // what the loads asked for at that block, the capacitors' share of the Q, and the voltage at the first load bus (the lesson's S = P + jQ in the player's numbers)
      const ls = s.loads.map((l) => ({ p: l.P * (1 - l.shedFrac), q: l.Q * (1 - l.shedFrac) }));
      tr.peakLoadMW = ls.reduce((a, l) => a + l.p, 0); tr.peakLoadMVAr = ls.reduce((a, l) => a + l.q, 0);
      const v0 = solved.sol.V[s.loads[0]?.bus ?? ''] ?? 1; tr.peakVPu = v0;
      tr.peakBankMVAr = s.shunts.filter((h) => h.kind === 'cap' && h.on > 0).reduce((a, h) => { const v = solved.sol.V[h.bus] ?? 1; return a + h.mvarStep * h.on * v * v / (1 - (h.detunePct ?? 0) / 100); }, 0);
    }
    if (lit && s.clock.block === NOON_BLOCK) { tr.noonMW = p; tr.noonMVAr = q; tr.noonPf = pf; tr.noonAmps = amps; }
    const vs = s.loads.filter((l) => l.P > 0).map((l) => (solved.sol.energised[l.bus] !== false ? solved.sol.V[l.bus] ?? 0 : 0));
    if (vs.length > 0) tr.loadVMinPu = Math.min(tr.loadVMinPu ?? Infinity, Math.min(...vs));
  }
  if (c.harmonics && solved) {
    const r = c.harmonics, res = harmonicStudy(s, r, f0, (b) => (solved.sol.energised[b] !== false ? solved.sol.V[b] : undefined));
    if (res) {
      tr.thdPct = Math.max(tr.thdPct ?? 0, res.thdPct);
      tr.harmI1A = res.i1A;
      for (const bk of res.banks) {
        if (bk.ratio >= (tr.capRmsRatio ?? 0)) { tr.harmH = bk.hParallel; tr.harmQkvar = Math.round(bk.qNameplateMVAr * 1000); tr.harmDetune = bk.detunePct; tr.harmSscMVA = bk.sscMVA; tr.harmCapA = bk.rmsA; tr.harmRatedA = bk.ratedA; tr.harmFundA = bk.fundA; tr.harmV1PhV = res.v1PhV; }
        tr.capRmsRatio = Math.max(tr.capRmsRatio ?? 0, bk.ratio);
        if (bk.ratio > r.capRmsMax && !(tr.capFuse > 0)) {
          const sh = s.shunts.find((h) => h.id === bk.id)!;
          sh.blown = true; sh.on = 0; sh.auto = null;
          tr.capFuse = 1; tr.capFuseRatio = bk.ratio; tr.capFuseKvar = Math.round(bk.qNameplateMVAr * 1000); tr.capFuseDetune = bk.detunePct; tr.capFuseH = bk.hParallel; tr.capFuseThd = res.thdPct; tr.capFuseBlock = s.clock.block;
          let hi = r.orders[0]!; for (const h of r.orders) if (Math.abs(h - bk.hParallel) < Math.abs(hi - bk.hParallel)) hi = h;
          tr.capFuseNear = hi;
          push(s, bk.id, 'ch3.capFuse');
          log(s, t('log.capFuse', { id: bk.id, ratio: bk.ratio.toFixed(2), h: bk.hParallel.toFixed(1) }), 'bad');
        }
      }
    }
  }
  if (c.fault && s.clock.block === c.fault.block && tr.faultKA === undefined) {
    const f = faultStudy(s, c.fault, f0);
    if (f) {
      tr.faultKA = f.kA; tr.faultKA0 = f.kA0; tr.faultXcOhm = f.xcOhm; tr.faultFResHz = f.fResHz; tr.faultCapPu = f.capPu;
      if (f.kA > c.fault.breakerKA) {
        tr.breakerFail = 1; push(s, c.fault.bus, 'ch3.breakerFail');
        log(s, t('log.breakerFail', { ka: f.kA.toFixed(2), max: c.fault.breakerKA.toFixed(2), bus: c.fault.bus }), 'bad');
      } else { push(s, c.fault.bus, 'ch3.faultCleared'); log(s, t('log.faultCleared', { ka: f.kA.toFixed(2), max: c.fault.breakerKA.toFixed(2), bus: c.fault.bus })); }
    }
  }
}

export interface Ch3Verdict { key: string; params: Record<string, string | number> }

/** The chapter's losses, in the order the player would meet them; null when none applies (the generic rules go on). */
export function ch3Verdict(s: Readonly<GridState>, rules: Readonly<Rules>, ticksUsed: number): Ch3Verdict | null {
  const c = rules.ch3, tr = s.metrics.track;
  if (!c) return null;
  if (c.harmonics && (tr.capFuse ?? 0) > 0) {
    const near = tr.capFuseNear ?? 5;
    return { key: 'level.lost.capFuse', params: { time: hhmm(tr.capFuseBlock ?? 0), kvar: Math.round(tr.capFuseKvar ?? 0), ratio: (tr.capFuseRatio ?? 0).toFixed(2), max: c.harmonics.capRmsMax, h: (tr.capFuseH ?? 0).toFixed(1), near, hz: Math.round(near * 50), thd: (tr.capFuseThd ?? 0).toFixed(1) } };
  }
  if (c.harmonics && (tr.thdPct ?? 0) > c.harmonics.thdMaxPct) return { key: 'level.lost.thd', params: { thd: (tr.thdPct ?? 0).toFixed(1), max: c.harmonics.thdMaxPct } };
  if (c.fault && (tr.breakerFail ?? 0) > 0) return { key: 'level.lost.breakerFail', params: { ka: (tr.faultKA ?? 0).toFixed(2), max: c.fault.breakerKA.toFixed(2), time: hhmm(c.fault.block), cap: (tr.faultCapPu ?? 0).toFixed(1) } };
  const atEnd = rules.horizonBlocks !== null && ticksUsed >= rules.horizonBlocks;
  if (c.loadVMinPu != null && (tr.loadVMinPu ?? 1) < c.loadVMinPu) return { key: 'level.lost.farVoltage', params: { v: (tr.loadVMinPu ?? 0).toFixed(3), min: c.loadVMinPu } };
  if (c.pfPeakMin != null && atEnd && (tr.pfAtPeak ?? 0) < c.pfPeakMin) return { key: 'level.lost.pfPeak', params: { pf: (tr.pfAtPeak ?? 0).toFixed(2), min: c.pfPeakMin, time: hhmm(tr.peakBlock ?? 0) } };
  return null;
}
