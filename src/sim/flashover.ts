// Flashover (DEPTH §4.2): at the block the level names (the evening peak, 19:30) the lines are at their design temperature, so every span that sags
// below its clearance rule flashes over and the line trips. The sag numbers were fixed when the route was built (RouteRecord.worst): this system only
// opens the branch, writes the event and marks the metric the verdict reads. Runs before the load flow, so the block already sees the line open.
import { log } from '@core/kit';
import { t } from '../i18n';
import { kindWord } from '../route-words';
import type { GridState } from '../types';

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

/** Params of the 'level.lost.flashover' verdict: the worst span of the first route that flashed over. */
export function flashoverParams(s: Readonly<GridState>): Record<string, string | number> {
  const r = s.routes.find((x) => x.badSpans.length > 0 && !(s.branches.find((b) => b.id === x.branchId)?.inService ?? false)) ?? s.routes.find((x) => x.badSpans.length > 0);
  if (!r) return {};
  const w = r.worst;
  return { id: r.branchId, span: w.span + 1, spanM: w.lengthM, sag: w.sagM, clr: w.clearanceM, req: w.requiredM, over: kindWord(w.over) };
}
