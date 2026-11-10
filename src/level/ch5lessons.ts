// Chapter 5 shift-report lessons and incident-report hints in the player's own numbers (referenced by the level specs; queries.ts calls them through `spec.lessonText` / `spec.tryText`).
// Every number printed is one the reader can recompute from another printed number, as the chapter 2 cards do.
import { dmath } from '@core/numerics';
import { t } from '../i18n';
import type { GridState } from '../types';
import { LINE_TEMPLATES } from '../data/lineTemplates';

const f1 = (x: number): string => x.toFixed(1), f2 = (x: number): string => x.toFixed(2), f3 = (x: number): string => x.toFixed(3);
const tr = (s: GridState, k: string): number | undefined => s.metrics.track[k];

/** L14: the band the towns held in pu and in kV on the 11 kV base, the tap steps used, and what hunting looks like. */
export function l14Lesson(s: GridState): string {
  const lo = tr(s, 'vMinPu'), hi = tr(s, 'vMaxPu');
  if (lo === undefined || hi === undefined) return '';
  const ops = tr(s, 'tapOps') ?? 0;
  let out = t('level.L14.lesson', { lo: f3(lo), hi: f3(hi), lokv: f2(lo * 11), hikv: f2(hi * 11), kv33: f1(33 * 1.0), kv132: f1(132 * 1.0), ops });
  if (ops > 40) out += ' ' + t('level.L14.lessonHunt', { ops });
  return out;
}
export function l14Try(s: GridState): string {
  if (s.status !== 'lost') return '';
  return t((tr(s, 'vViolV') ?? 1) < 1 ? 'level.L14.tryLow' : 'level.L14.tryHigh');
}

/** |A| of the exact line (cosh of gamma times length) for the 400 kV twin-Moose template, and the no-load receiving voltage for the sending set-point. */
export function l15NoLoad(s: GridState): { absA: number; v0: number } {
  const tpl = LINE_TEMPLATES.find((x) => x.id === 'l400-twinmoose')!, km = s.branches[0]?.lengthKm ?? 350;
  const m = dmath.hypot(tpl.rOhmKm, tpl.xOhmKm) * tpl.bUsKm * 1e-6, ang = (dmath.atan2(tpl.xOhmKm, tpl.rOhmKm) + Math.PI / 2) / 2, g = Math.sqrt(m), a = g * dmath.cos(ang) * km, b = g * dmath.sin(ang) * km;
  const A = dmath.hypot(dmath.cosh(a) * dmath.cos(b), dmath.sinh(a) * dmath.sin(b));
  return { absA: A, v0: (s.buses[0]?.vSet ?? 1) / A };
}

/** L15: the line's own constants: SIL, charging Q, |A| of the exact line and the no-load receiving voltage for the sending voltage the plant holds. */
export function l15Lesson(s: GridState): string {
  const tpl = LINE_TEMPLATES.find((x) => x.id === 'l400-twinmoose')!, km = s.branches[0]?.lengthKm ?? 350;
  // gamma = sqrt(z y), A = cosh(gamma l) = cosh(a) cos(b) + j sinh(a) sin(b)
  const zr = tpl.rOhmKm, zx = tpl.xOhmKm, y = tpl.bUsKm * 1e-6, m = dmath.hypot(zr, zx) * y, ang = (dmath.atan2(zx, zr) + Math.PI / 2) / 2;
  const g = Math.sqrt(m), gr = g * dmath.cos(ang), gi = g * dmath.sin(ang), a = gr * km, b = gi * km;
  const A = dmath.hypot(dmath.cosh(a) * dmath.cos(b), dmath.sinh(a) * dmath.sin(b));
  const v1 = s.buses[0]?.vSet ?? 1;
  const qc = tpl.kv * tpl.kv * tpl.bUsKm * 1e-6 * km;
  const out = t('level.L15.lesson', { km, sil: Math.round(tpl.silMw), qc: Math.round(qc), a: f3(A), v1: f2(v1), v0: f3(v1 / A), kv0: Math.round((v1 / A) * 400) });
  const hi = tr(s, 'vMaxPu'), lo = tr(s, 'vMinPu');
  return hi === undefined || lo === undefined ? out : out + ' ' + t('level.L15.lessonRun', { lo: f3(lo), hi: f3(hi), ops: tr(s, 'switchOps') ?? 0 });
}
export function l15Try(s: GridState): string {
  if (s.status !== 'lost') return '';
  return t((tr(s, 'vViolV') ?? 1) > 1 ? 'level.L15.tryHigh' : 'level.L15.tryLow', { qc: t('level.L15.qc', { qc: 192 }) });
}

/** L16: how the chord's reactance compares with the way round, and what the day's worst loading was. */
export function l16Lesson(s: GridState): string {
  const tpl = LINE_TEMPLATES.find((x) => x.id === 'l220-zebra')!;
  const chord = s.branches[6], ring = s.branches[0];
  if (!chord || !ring) return '';
  const xc = tpl.xOhmKm * chord.lengthKm, xr = tpl.xOhmKm * ring.lengthKm * 3;
  const out = t('level.L16.lesson', { xc: f1(xc), xr: f1(xr), ratio: f1(xr / xc), share: Math.round((100 * xr) / (xr + xc)) });
  const pk = tr(s, 'peakLoading'), n1 = tr(s, 'n1Max');
  return pk === undefined ? out : out + ' ' + t(n1 !== undefined && n1 <= 1 ? 'level.L16.lessonSecure' : 'level.L16.lessonOpen', { pk: Math.round(pk * 100), n: n1 !== undefined && n1 < 9 ? Math.round(n1 * 100) : 999 });
}
export function l16Try(s: GridState): string {
  if (s.status !== 'lost') return '';
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('level.L16.tryBudget');
  return t('level.L16.tryLoading', { pct: Math.round((tr(s, 'loadingViolPct') ?? 1) * 100) });
}

/** L17: the nose of the curve in MW, the margin, and why the capacitor is weak where it is needed. */
export function l17Lesson(s: GridState): string {
  const m = tr(s, 'marginMinPct');
  if (m === undefined) return '';
  const load = s.loads[0]?.Ppeak ? 300 : 300, nose = load * (1 + m / 100);
  let out = t('level.L17.lesson', { load, nose: Math.round(nose), margin: f1(m) });
  const cap = s.shunts.find((h) => h.kind === 'cap');
  if (cap) out += ' ' + t('level.L17.lessonCap', { q: Math.round(cap.mvarStep * cap.on), q8: Math.round(cap.mvarStep * cap.on * 0.64), v: '0.80' });
  return out;
}
export function l17Try(s: GridState): string {
  if (s.status !== 'lost') return '';
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('level.L17.tryBudget');
  return t('level.L17.tryCollapse', { margin: f1(tr(s, 'marginMinPct') ?? 0) });
}

/** L18: the converged V2, the Q limit of the PV bus, and the prediction scorecard. */
export function l18Lesson(s: GridState): string {
  const v2 = s.solution?.buses.find((b) => b.id === 'B2')?.vPu;
  if (v2 === undefined) return '';
  const q3 = s.units[1]?.Q ?? 0;
  let out = t('level.L18.lesson', { v2: f3(v2), q3: Math.round(q3), qmax: Math.round(s.units[1]?.qMax ?? 0), v3: f2(s.buses.find((b) => b.id === 'B3')?.vSet ?? 1.05) });
  const n = s.metrics.predictions.length;
  if (n > 0) out += ' ' + t('level.L18.lessonPredict', { hits: tr(s, 'predHits') ?? 0, n });
  return out;
}
export function l18Try(s: GridState): string {
  if (s.status !== 'lost') return '';
  return t((tr(s, 'loadingViolBlocks') ?? 0) > 0 && (tr(s, 'vViolBlocks') ?? 0) === 0 ? 'level.L18.tryLoading' : 'level.L18.tryVoltage');
}
