// Chapter 6 shift-report lessons and incident-report hints in the player's own numbers. Every printed number is recomputable from the others on the card
// (RoCoF = dP f0 / (2 H S); droop sharing = S/R; net load = demand - sun).
import { t } from '../i18n';
import type { GridState } from '../types';
import type { SimParams } from '../sim/params';
import { examTruth } from '../sim/freqtrack';
import { isDispatchable } from '../sim/netbuild';

const f1 = (x: number): string => x.toFixed(1), f2 = (x: number): string => x.toFixed(2), f3 = (x: number): string => x.toFixed(3);
const hh = (b: number): string => String(Math.floor((b % 96) / 4)).padStart(2, '0'), mm = (b: number): string => String((b % 4) * 15).padStart(2, '0');
const tripped = (s: GridState): { unit: string; block: number } | null => { const e = s.events.log.find((x) => x.causeKey === 'cascade.initial-trip'); return e ? { unit: e.element, block: e.block } : null; };

/** The shift report's consolidation line of a chapter 6 level ('' until there is something to say). */
export function freqLesson(s: GridState, p: SimParams, th: Record<string, number>, id: string): string {
  const tr = s.metrics.track;
  if (id === 'L22') return examLesson(s);
  if (id === 'L20') return duckLesson(s, p, th);
  const ev = tripped(s);
  if (!ev || tr.hSys === undefined) return '';
  const base = { unit: ev.unit, hh: hh(ev.block), mm: mm(ev.block), lost: Math.round(tr.lostMW ?? 0), s: Math.round(tr.sSys ?? 0), h: f2(tr.hSys), f0: p.f0, rocof: f2(tr.rocof0 ?? 0), headroom: Math.round(tr.headroomMW ?? 0), cover: f2(tr.reserveCover ?? 0), nadir: f2(tr.nadirHz ?? p.f0), fend: f2(tr.fEndHz ?? p.f0), shed: Math.round(tr.shedMW ?? 0) };
  if (id === 'L19') return t('level.L19.lesson', base) + ' ' + ((tr.reserveCover ?? 0) < 1 ? t('level.L19.lessonShort', base) : t('level.L19.lessonOk', base));
  const hs = Math.round((tr.hSys ?? 0) * (tr.sSys ?? 0));
  const l21 = t('level.L21.lesson', { ...base, hs, rocof: f2((base.lost * p.f0) / (2 * Math.max(1, hs))) });
  const slope = f2(tr.rocof500 ?? 0);
  const tail = (tr.derTripped ?? 0) > 0 ? t('level.L21.lessonDer', { slope, der: Math.round(tr.derMW ?? 0), total: base.lost + Math.round(tr.derMW ?? 0), nadir: base.nadir })
    : (tr.rideFitted ?? 0) > 0 ? t('level.L21.lessonRide', { slope, nadir: base.nadir }) : (tr.rocof500 ?? 0) > 1 ? t('level.L21.lessonStill', { slope, nadir: base.nadir }) : t('level.L21.lessonNoDer', { slope, nadir: base.nadir });
  return l21 + ' ' + tail;
}

/** L20: curtailment at noon, the net-load ramp at dusk (from the day's history), the share of blocks in range and the worst block. */
function duckLesson(s: GridState, p: SimParams, th: Record<string, number>): string {
  const tr = s.metrics.track;
  if ((tr.blocks ?? 0) < 4) return '';
  let ramp = 0, at = 0;
  const e = s.history.entries;
  for (let i = 1; i < e.length; i++) {
    const net = (x: typeof e[number]): number => x.demandMW - (x.genMW.pv ?? 0);
    const r = (net(e[i]!) - net(e[i - 1]!)) / 15;
    if (r > ramp) { ramp = r; at = e[i]!.block; }
  }
  const low = (tr.worstDevSignedHz ?? 0) < 0;
  return t('level.L20.lesson', { cur: f1(tr.curtailPct ?? 0), min: Math.round(p.coalMinPct ?? 40), ramp: Math.round(ramp), rh: hh(at), rm: mm(at), inr: f1(tr.inRangePct ?? 100), need: Math.round(th.inRangeMinPct ?? 95), dev: Math.round(Math.abs(tr.worstDevSignedHz ?? 0) * 1000), dir: t(low ? 'level.L20.dirLow' : 'level.L20.dirHigh'), wh: hh(tr.worstDevBlock ?? 0), wm: mm(tr.worstDevBlock ?? 0) });
}

/** L22: the three textbook answers by hand, then the player's droops and the shares they got. */
function examLesson(s: GridState): string {
  const e = examTruth();
  let out = t('level.L22.lesson', { a: f3(e.examA), b: f3(e.examB), cdf: f3(-e.examCdf), c: f1(e.examC), c2: f1(e.examCg2) });
  const g1 = s.units.find((u) => u.id === 'U1'), g2 = s.units.find((u) => u.id === 'U2'), tr = s.metrics.track;
  if (g1 && g2 && tr.shareG1 !== undefined) {
    const w1 = g1.mva / g1.droopPct, w2 = g2.mva / g2.droopPct;
    out += ' ' + t('level.L22.lessonTask', { r1: g1.droopPct, r2: g2.droopPct, w1: Math.round(w1 * 100), w2: Math.round(w2 * 100), share: f1(tr.shareG1 * 100), g1: f1(tr.dPm_U1 ?? 0), g2: f1(tr.dPm_U2 ?? 0) });
  }
  return out;
}

/** What to try after a loss, from the numbers the verdict used. */
export function freqTry(s: GridState, p: SimParams, th: Record<string, number>, id: string): string {
  if (s.status !== 'lost') return '';
  const tr = s.metrics.track, key = s.block.verdictKey ?? '';
  if (id === 'L22') {
    const g1 = s.units.find((u) => u.id === 'U1');
    return key === 'level.lost.share' && g1 ? t('level.L22.tryShare', { r1: g1.droopPct, need: f2(g1.droopPct * 0.9) }) : '';
  }
  if (key === 'level.lost.budget') return t(id === 'L19' ? 'level.L19.tryBudget' : id === 'L20' ? 'level.L20.tryBudget' : 'level.L21.tryBudget');
  if (id === 'L20') return key === 'level.lost.freqBand' || key === 'level.lost.inRange' ? t('level.L20.tryBand') : '';
  if (id === 'L21') return key === 'level.lost.nadir' ? t('level.L21.tryNeeds', { nadir: f2(tr.nadirHz ?? p.f0) }) : '';
  // L19
  if (key !== 'level.lost.nadir') return '';
  const cap = s.units.filter((u) => u.online && isDispatchable(u)).reduce((a, u) => a + u.pMax, 0), load = s.block.demandMW;
  if (cap < load && (tr.shedMW ?? 0) === 0) return t('level.L19.tryCapacity', { short: Math.round(load - cap), cap: Math.round(cap), load: Math.round(load) });
  return (tr.reserveCover ?? 0) < 1 ? t('level.L19.tryShort', { hr: Math.round(tr.headroomMW ?? 0), lost: Math.round(tr.lostMW ?? 0) }) : '';
}
