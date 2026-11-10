// Chapter 6 (frequency & renewables) bookkeeping, kept out of event.ts and tick.ts so the shared files only call three small hooks:
//   - what the event window needs besides the units (grid-forming batteries, legacy rooftop PV that trips on RoCoF),
//   - what the event window's numbers become in `metrics.track` (nadir, RoCoF, shed MW, final frequency, per-unit droop response, predictions),
//   - the per-block frequency track of the operator clock (share of blocks inside the standard range, worst deviation, curtailment share).
// Everything is guarded by `rules.freqTrack`, so levels of the other chapters keep the same states (goldens) as before.
import { runFrequencyWindow, type FreqBess, type FreqResult, type FreqUnit } from './dynamics';
import type { SimParams } from './params';
import { fin } from './finite';
import type { GridState, Storage, Unit } from '../types';

/** Virtual inertia of a grid-forming battery on its rating (the catalogue's hVs = 4 s). */
export const GFM_HV_S = 4;
/** A grid-forming battery is a catalogue row whose id says so (the Storage record keeps no mode flag). */
export const isGridForming = (b: Pick<Storage, 'catalogId'>): boolean => b.catalogId.includes('gfm');

/** How the event window should treat a battery: grid-forming ones add S_b and H_v and answer in 50 ms. */
export function bessFreqMode(b: Pick<Storage, 'catalogId'>): Pick<FreqBess, 'mode' | 'Hv'> {
  return isGridForming(b) ? { mode: 'forming', Hv: GFM_HV_S } : { mode: 'following' };
}

/** Legacy rooftop PV still without ride-through: ids, and the MW they carry now. */
export function legacyMW(s: Readonly<GridState>): number {
  const ids = s.rules.derLegacyIds ?? [];
  return s.units.reduce((a, u) => a + (ids.includes(u.id) && u.online && u.kind === 'pv' ? u.P : 0), 0);
}

/** Extra input of the frequency window: the legacy-DER RoCoF trip (DESIGN S29), only when the level lists legacy units. */
export function derInput(s: Readonly<GridState>): { derLegacyMW?: number; derRocofTrip?: { hzPerS: number; windowS: number; delayS: number } } {
  const mw = legacyMW(s);
  if (!(mw > 0)) return {};
  return { derLegacyMW: mw, derRocofTrip: { hzPerS: s.rules.derRocofHzS ?? 1, windowS: 0.5, delayS: 0 } };
}

/** The window has run: if the legacy rooftops tripped, take them out of the state (the next block's dispatch sees them gone). */
export function afterDer(s: GridState, fr: FreqResult): void {
  if (!fr.events.some((e) => e.kind === 'der_rocof_trip')) return;
  const ids = s.rules.derLegacyIds ?? [];
  s.metrics.track.derMW = fin(s.units.reduce((a, u) => a + (ids.includes(u.id) && u.kind === 'pv' ? u.P : 0), 0));
  for (const u of s.units) if (ids.includes(u.id) && u.kind === 'pv') { u.online = false; u.P = 0; u.availMW = 0; }
  s.metrics.track.derTripped = 1;
}

/** Event window -> `metrics.track` (and the player's predictions rated against what happened). */
export function freqWindowTrack(s: GridState, fr: FreqResult, f0: number, lostGenMW = 0, survivors: Unit[] = []): void {
  if (!s.rules.freqTrack) return;
  const tr = s.metrics.track;
  // reserve cover: the headroom the surviving units had at the instant of the trip (MW to P_max) over the generation that was lost
  const headroom = survivors.reduce((a, u) => a + Math.max(0, u.pMax - u.P), 0);
  tr.headroomMW = fin(headroom); tr.lostMW = fin(lostGenMW);
  tr.reserveCover = lostGenMW > 1e-9 ? fin(headroom / lostGenMW) : 0;
  tr.nadirHz = Math.min(tr.nadirHz ?? f0, fin(fr.nadirHz, f0));
  tr.zenithHz = Math.max(tr.zenithHz ?? f0, fin(fr.zenithHz, f0));
  tr.rocof0 = fin(Math.abs(fr.rocof0));
  tr.maxRocof = Math.max(tr.maxRocof ?? 0, fin(fr.maxRocof500));
  tr.shedMW = fin((tr.shedMW ?? 0) + fr.shedMW);
  tr.fEndHz = fin(fr.fEndHz, f0);
  tr.hSys = fin(fr.hSys); tr.sSys = fin(fr.sSys);
  tr.tNadirS = fin(fr.tNadir);
  for (const u of fr.unitFinal) tr[`dPm_${u.id}`] = fin(u.dPmMW);
  for (const b of fr.bessFinal) tr[`pBess_${b.id}`] = fin(b.pMW);
  if (s.rules.freqExam) {   // L22: G1's share of the step the two machines carried (the task: set the droops for 60:40)
    const g1 = tr.dPm_U1 ?? 0, g2 = tr.dPm_U2 ?? 0;
    if (g1 + g2 > 1e-9) { tr.shareG1 = fin(g1 / (g1 + g2)); tr.shareErr = fin(Math.abs(tr.shareG1 - 0.6)); }
  }
  const actual: Record<string, number> = { rocof0: Math.abs(fr.rocof0), nadirHz: fr.nadirHz, fEndHz: fr.fEndHz, shedMW: fr.shedMW };
  for (const p of s.metrics.predictions) { const a = actual[p.id]; if (a !== undefined) p.actual = fin(a); }
}

/** Fraction of a prediction made within `tolPct` percent of what happened (the third star of an exam bridge). */
export function predictionsWithin(s: Readonly<GridState>, tolPct: number): number {
  return s.metrics.predictions.filter((p) => p.actual !== null && Math.abs(p.predicted - p.actual) <= (tolPct / 100) * Math.max(1e-12, Math.abs(p.actual))).length;
}

/** One operator block: frequency statistics (L20) and the shared nadir. Called by the pipeline's metrics system, only on frequency levels. */
export function freqBlockTrack(s: GridState, p: SimParams): void {
  if (!s.rules.freqTrack) return;
  if (s.rules.freqExam) { const e = examTruth(); const m: Record<string, number> = { examA: e.examA, examB: e.examB, examC: e.examC }; for (const q of s.metrics.predictions) { const a = m[q.id]; if (a !== undefined) q.actual = a; } }
  const tr = s.metrics.track, f = s.freq.fHz, [lo, hi] = p.gridcode.standardRangeHz;
  tr.nadirHz = Math.min(tr.nadirHz ?? p.f0, fin(s.metrics.nadirHz, p.f0));
  if (s.block.eventWindow) return;   // the window's own frequency is a transient, not a block of the day
  tr.blocks = (tr.blocks ?? 0) + 1;
  if (f >= lo - 1e-9 && f <= hi + 1e-9) tr.inRangeBlocks = (tr.inRangeBlocks ?? 0) + 1;
  tr.inRangePct = fin((100 * (tr.inRangeBlocks ?? 0)) / tr.blocks, 100);
  tr.maxDevHz = Math.max(tr.maxDevHz ?? 0, fin(Math.abs(f - p.f0)));
  if (Math.abs(f - p.f0) >= Math.abs((tr.worstDevSignedHz ?? 0))) { tr.worstDevSignedHz = fin(f - p.f0); tr.worstDevBlock = s.clock.block; }
  // renewable energy lost to curtailment as a share of what the sun and wind offered
  const offered = s.units.reduce((a, u) => a + (u.kind === 'pv' || u.kind === 'wind' ? (u.online ? u.availMW : 0) : 0), 0);
  tr.offeredMWh = fin((tr.offeredMWh ?? 0) + offered * 0.25);
  tr.curtailedMWh = fin((tr.curtailedMWh ?? 0) + s.block.curtailedMW * 0.25);
  tr.curtailPct = tr.offeredMWh > 1e-9 ? fin((100 * tr.curtailedMWh) / tr.offeredMWh) : 0;
}

// ---- the exam bridge (L22): the textbook cases, answered by the engine's own window -------------------------------------------------------
/** What the engine says for the three textbook cases of PS-23, PS-25 and PS-26 (no deadband, no UFLS, no limits). */
export interface ExamTruth {
  /** (a) RoCoF, Hz/s, of a 500 MVA, H = 5 s machine at 60 Hz that loses 0.2 pu (positive magnitude). */
  examA: number;
  /** (b) steady frequency change, Hz, for R = 0.05, D = 0.8, dP = 0.01 pu (negative). */
  examB: number;
  /** (c) steady frequency change, Hz, of G1 500 MVA at 4 % and G2 300 MVA at 5 % for +100 MW (negative), and G1's and G2's MW. */
  examCdf: number; examC: number; examCg2: number;
}
const ideal = (id: string, S: number, H: number, R: number): FreqUnit => ({ id, kind: 'gas', S, H, R, P0: 0, Pmin: -1e9, Pmax: 1e9 });
const textbook = { deadbandHz: 0, ufls: [] as { hz: number; shedPct: number; delayS: number }[] };
let examMemo: ExamTruth | null = null;
export function examTruth(): ExamTruth {
  if (examMemo) return examMemo;
  const a = runFrequencyWindow({ f0: 60, units: [ideal('g', 500, 5, 0.05)], bess: [], loadMW: 500, disturbanceMW: 0.2 * 500, dLoad: 0, gridCode: textbook, window: { maxS: 1 } });
  const b = runFrequencyWindow({ f0: 50, units: [ideal('g', 100, 5, 0.05)], bess: [], loadMW: 100, disturbanceMW: 0.01 * 100, dLoad: 0.8, gridCode: textbook, window: { maxS: 90, settlePuPerS: 1e-9, settleAfterS: 30 } });
  const c = runFrequencyWindow({ f0: 50, units: [ideal('g1', 500, 5, 0.04), ideal('g2', 300, 5, 0.05)], bess: [], loadMW: 800, disturbanceMW: 100, dLoad: 0, gridCode: textbook, window: { maxS: 120, settlePuPerS: 1e-9, settleAfterS: 40 } });
  examMemo = {
    examA: Math.abs(a.rocof0), examB: b.fEndHz - 50, examCdf: c.fEndHz - 50,
    examC: c.unitFinal.find((u) => u.id === 'g1')?.dPmMW ?? 0, examCg2: c.unitFinal.find((u) => u.id === 'g2')?.dPmMW ?? 0,
  };
  return examMemo;
}
