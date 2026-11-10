// L28's shift-report lesson and the incident report's "what to try", in the player's own numbers (kept out of queries.ts so the shared file only calls two functions).
import { t } from '../i18n';
import type { GridState } from '../types';
import { BLOCKS_PER_DAY } from '../types';

const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
const SOC_USABLE = 0.8, ETA_ONE_WAY = Math.sqrt(0.86);

/** Energy the island's loads draw from `fromAbs` to `toAbs` (absolute blocks), MWh, from the loads' own class shape at the level's scripted weather (an approximation the lesson prints as such: it re-reads the track). */
export function islandNeed(s: Readonly<GridState>): { mwh: number; needMWh: number } {
  const f = s.rules.finale;
  if (!f) return { mwh: 0, needMWh: 0 };
  const mwh = f.nightMWh;
  return { mwh, needMWh: mwh / ETA_ONE_WAY / SOC_USABLE };
}

export function finaleLesson(s: GridState): string {
  const tr = s.metrics.track, f = s.rules.finale;
  if (!f || tr.demandMWh === undefined) return '';
  const fmt = (x: number, d = 0): string => x.toFixed(d);
  const parts: string[] = [];
  parts.push(t('level.L28.lessonA', { peak: fmt(tr.peakDemandMW ?? 0), vmin: fmt(tr.vMinPu ?? 0, 3) }));
  parts.push(t('level.L28.lessonB', { ens: fmt(s.metrics.ensMWh, 1), ensPct: fmt(tr.ensPct ?? 0, 3), energy: fmt(f.energyMWh), dips: tr.freqDips ?? 0, nadir: fmt(tr.freqNadirHz ?? 50, 2) }));
  if ((tr.islandDarkBlocks ?? 0) === 0 && (tr.lightning ?? 0) > 0) {
    const bats = s.storage.filter((b) => b.bus === f.islandBus);
    const { mwh, needMWh } = islandNeed(s);
    const path = bats.length > 0 ? t('level.L28.lessonIslandBattery', { need: fmt(needMWh, 1), have: fmt(bats.reduce((a, b) => a + b.mwh, 0), 0) }) : t('level.L28.lessonIslandLine');
    parts.push(t('level.L28.lessonIsland', { mwh: fmt(mwh, 1), path }));
  }
  if (s.status === 'won') parts.push(t('level.L28.lessonC', { vmax: fmt(tr.vMaxPu ?? 0, 3), loss: fmt(tr.lossPct ?? 0, 2), viol: tr.freqViolBlocks ?? 0 }));
  return parts.join(' ');
}

export function finaleTryHint(s: GridState): string {
  if (s.status !== 'lost') return '';
  const k = s.block.verdictKey ?? '', tr = s.metrics.track;
  if (k === 'level.lost.budget') return t('level.L28.tryBudget');
  if (k.startsWith('level.lost.island')) { const { mwh, needMWh } = islandNeed(s); return t('level.L28.tryIsland', { mwh: mwh.toFixed(0) || '75', need: Math.ceil(needMWh || 100.6) }); }
  if (k === 'level.lost.voltageLow') return t('level.L28.tryLow');
  if (k === 'level.lost.voltageHigh') return t('level.L28.tryHigh');
  if (k === 'level.lost.ens' || k === 'level.lost.blackout') return t('level.L28.tryEns');
  void tr; void BLOCKS_PER_DAY; void hhmm;
  return '';
}
