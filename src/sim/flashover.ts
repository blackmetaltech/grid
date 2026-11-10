// Flashover (DEPTH §4.2): at the block the level names (the evening peak, 19:30) the lines are at their design temperature, so every span that sags
// below its clearance rule flashes over and the line trips. The sag numbers were fixed when the route was built (RouteRecord.worst): this system only
// opens the branch, writes the event and marks the metric the verdict reads. Runs before the load flow, so the block already sees the line open.
import { log } from '@core/kit';
import { t } from '../i18n';
import { kindWord } from '../route-words';
import type { GridState } from '../types';
import { SOC_MIN, SOC_MAX, ISLAND_LOSS_ALLOWANCE, oneWayEfficiency } from './islandStorage';
import { solvedOf } from './solved';

export function flashoverStep(s: GridState): void {
  const at = s.rules.flashoverBlock;
  if (at === null || s.clock.block !== at) return;
  for (const r of s.routes) {
    if (r.badSpans.length === 0) continue;
    const b = s.branches.find((x) => x.id === r.branchId);
    if (!b || !b.inService) continue;
    b.inService = false; b.timer = null;
    s.block.trips.push(b.id);
    s.metrics.track.flashover = (s.metrics.track.flashover ?? 0) + 1;
    s.events.log.push({ day: s.clock.day, block: s.clock.block, tS: 0, element: b.id, causeKey: 'route.flashover' });
    if (s.events.log.length > 200) s.events.log.splice(0, s.events.log.length - 200);
    const w = r.worst;
    log(s, t('log.flashover', { id: b.id, span: w.span + 1, sag: w.sagM, clr: w.clearanceM, req: w.requiredM }), 'bad');
  }
}

/** Sea-fog flashover (L29, DEPTH §4.4): at the level's fog block every support whose insulator creepage is under what its tile's pollution class needs flashes over
 *  and the line trips. The creepage numbers were fixed when the route was built (RouteRecord.saltShort / saltWorst); like the clearance flashover this only opens the branch,
 *  writes the event and the log line, and marks the metric the verdict reads. */
export function saltFlashoverStep(s: GridState): void {
  const at = s.rules.fogBlock ?? null;
  if (at === null || s.clock.block !== at) return;
  for (const r of s.routes) {
    if (!r.saltShort || r.saltShort.length === 0 || !r.saltWorst) continue;
    const b = s.branches.find((x) => x.id === r.branchId);
    if (!b || !b.inService) continue;
    b.inService = false; b.timer = null;
    s.block.trips.push(b.id);
    s.metrics.track.saltFlashover = (s.metrics.track.saltFlashover ?? 0) + 1;
    s.events.log.push({ day: s.clock.day, block: s.clock.block, tS: 0, element: b.id, causeKey: 'route.saltFlashover' });
    if (s.events.log.length > 200) s.events.log.splice(0, s.events.log.length - 200);
    const w = r.saltWorst;
    log(s, t('log.saltFlashover', { id: b.id, n: w.index + 1, short: r.saltShort.length, sea: w.seaM, cls: classWord(w.cls), need: w.needMm, has: w.hasMm }), 'bad');
  }
}

/** Params of the 'level.lost.saltFlashover' verdict: the worst support of the first line that flashed over in the fog. */
export function saltFlashoverParams(s: Readonly<GridState>): Record<string, string | number> {
  const r = s.routes.find((x) => x.saltWorst && !(s.branches.find((b) => b.id === x.branchId)?.inService ?? false)) ?? s.routes.find((x) => x.saltWorst);
  if (!r || !r.saltWorst) return {};
  const w = r.saltWorst, hh = Math.floor(((s.rules.fogBlock ?? 0) % 96) / 4), mm = ((s.rules.fogBlock ?? 0) % 4) * 15;
  return { id: r.branchId, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, n: w.index + 1, short: r.saltShort?.length ?? 1, sea: w.seaM, cls: classWord(w.cls), need: w.needMm, has: w.hasMm };
}
const classWord = (c: number): string => ['', 'I', 'II', 'III', 'IV'][c] ?? String(c);

/** Params of the 'level.lost.flashover' verdict: the worst span of the first route that flashed over. */
export function flashoverParams(s: Readonly<GridState>): Record<string, string | number> {
  const r = s.routes.find((x) => x.badSpans.length > 0 && !(s.branches.find((b) => b.id === x.branchId)?.inService ?? false)) ?? s.routes.find((x) => x.badSpans.length > 0);
  if (!r) return {};
  const w = r.worst;
  return { id: r.branchId, span: w.span + 1, spanM: w.lengthM, sag: w.sagM, clr: w.clearanceM, req: w.requiredM, over: kindWord(w.over) };
}

const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;

/** The anchor cut (L30, DEPTH §8b): at the level's cable block a trawler's anchor severs every submarine cable. The branch opens, the event log and the log line say why, and the metric the lesson reads is marked. Runs before the load flow, so the block already sees the cable open. */
export function anchorCutStep(s: GridState): void {
  const at = s.rules.cableCutBlock ?? null;
  if (at === null || s.clock.block !== at) return;
  for (const c of s.cables ?? []) {
    const b = s.branches.find((x) => x.id === c.branchId);
    if (!b || !b.inService) continue;
    b.inService = false; b.timer = null;   // no event window: its cascade does not know a battery can hold the island the cut makes, and would shed it; the load flow of this very block does
    s.metrics.track.cableCut = (s.metrics.track.cableCut ?? 0) + 1;
    s.events.log.push({ day: s.clock.day, block: s.clock.block, tS: 0, element: b.id, causeKey: 'route.anchorCut' });
    if (s.events.log.length > 200) s.events.log.splice(0, s.events.log.length - 200);
    log(s, t('log.anchorCut', { id: b.id, time: hhmm(at), km: c.lengthKm }), 'bad');
  }
}

/** Why the island went dark, as a verdict key and its params (null when no load stands on a dark bus): never connected, no battery after the cut, an inverter under the load, or cells run dry.
 *  Every printed number comes from the state: the dark loads' kW now, the inverter and cell kWh installed, the cell energy drawn since the cut, the energy still deliverable. */
export function islandDark(s: Readonly<GridState>): { key: string; params: Record<string, string | number> } | null {
  const solved = solvedOf(s as GridState);
  if (!solved) return null;
  const dark = s.loads.filter((l) => solved.sol.energised[l.bus] === false && l.P > 0);
  if (dark.length === 0) return null;
  const darkBuses = new Set(dark.map((l) => l.bus));
  const loadKw = dark.reduce((a, l) => a + l.P * (1 - l.shedFrac) * 1000, 0);
  const bats = s.storage.filter((b) => darkBuses.has(b.bus) || solved.sol.energised[b.bus] === false);
  const invKw = bats.reduce((a, b) => a + b.mw * 1000, 0), kwh = bats.reduce((a, b) => a + b.mwh * 1000, 0);
  const left = bats.reduce((a, b) => a + Math.max(0, b.soc - SOC_MIN) * b.mwh * 1000 * oneWayEfficiency(b.etaRt), 0);
  const cutAt = s.rules.cableCutBlock ?? 0;
  // what carrying the dark loads from the cut to the last block of the run takes: the peak kW and the nameplate kWh (loss allowance, one-way efficiency, the 10-90 % window)
  const lastBlock = s.levelStart + (s.rules.horizonBlocks ?? 0), eta = oneWayEfficiency(bats[0]?.etaRt ?? 0.86);
  let peakKw = 0, wh = 0;
  for (let k = cutAt; k <= lastBlock; k++) { const p = dark.reduce((a, l) => a + (l.shape ? l.shape.p[k % 96] ?? 0 : 1) * l.Ppeak * 1000, 0); peakKw = Math.max(peakKw, p); wh += p * 0.25; }
  const needKw = Math.ceil(peakKw * ISLAND_LOSS_ALLOWANCE - 1e-9), needKwh = Math.ceil((wh * ISLAND_LOSS_ALLOWANCE) / (eta * (SOC_MAX - SOC_MIN)) - 1e-9);
  const params = { time: hhmm(s.clock.block), cut: hhmm(cutAt), kw: Math.round(loadKw), inv: Math.round(invKw), kwh: Math.round(kwh), used: Math.round(s.metrics.track.islandKWh ?? 0), left: Math.round(left), needKw, needKwh };
  const cut = (s.metrics.track.cableCut ?? 0) > 0;
  if (!cut) return { key: 'level.lost.islandUnlit', params };
  if (bats.length === 0) return { key: 'level.lost.islandNoBattery', params };
  if (loadKw * ISLAND_LOSS_ALLOWANCE > invKw + 1e-9) return { key: 'level.lost.islandPower', params };
  return { key: 'level.lost.islandEnergy', params };
}
