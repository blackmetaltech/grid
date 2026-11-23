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

/** The 400 kV ring's charging at 1 pu, MVAr (bc is pu on 100 MVA), to the nearest 10: what the light-load voltage rise has to absorb. */
export function ringChargingMVAr(s: Readonly<GridState>): number {
  const kv = (id: string): number => s.buses.find((b) => b.id === id)?.kvNom ?? 0;
  return Math.round(s.branches.filter((b) => b.kind === 'line' && kv(b.from) >= 380).reduce((a, b) => a + b.bc * 100, 0) / 10) * 10;
}

export function finaleLesson(s: GridState): string {
  const tr = s.metrics.track, f = s.rules.finale;
  if (!f || tr.demandMWh === undefined) return '';
  const fmt = (x: number, d = 0): string => x.toFixed(d);
  const parts: string[] = [];
  if (s.region === 'in') parts.push(t('level.L28.lessonTie', { nadir: fmt(s.metrics.nadirHz, 2) }));
  parts.push(t('level.L28.lessonA', { peakDay: (tr.peakDemandDay ?? 0) + 1, peak: fmt(tr.peakDemandMW ?? 0), vmin: fmt(tr.vMinPu ?? 0, 3), vminTime: hhmm(tr.vMinBlock ?? 0), vminDay: (tr.vMinDay ?? 0) + 1 }));
  if (s.clock.day >= 1 || s.status === 'won') parts.push(t('level.L28.lessonB', { ens: fmt(s.metrics.ensMWh, 1), ensPct: fmt(tr.ensPct ?? 0, 3), energy: fmt(f.energyMWh), dips: tr.freqDips ?? 0, nadir: fmt(tr.freqNadirHz ?? 50, 2) }));
  if ((tr.islandDarkBlocks ?? 0) === 0 && (tr.lightning ?? 0) > 0) {
    const bats = s.storage.filter((b) => b.bus === f.islandBus);
    const { mwh, needMWh } = islandNeed(s);
    const have = fmt(bats.reduce((a, b) => a + b.mwh, 0), 0), shed = tr.islandShedMWh ?? 0;
    const path = bats.length === 0 ? t('level.L28.lessonIslandLine') : shed > 0 ? t('level.L28.lessonIslandShed', { have, shed: fmt(shed, 1) }) : t('level.L28.lessonIslandBattery', { need: fmt(needMWh, 1), have });
    parts.push(t('level.L28.lessonIsland', { mwh: fmt(mwh, 1), path }));
  }
  if (s.status === 'won' && (tr.islandShedMWh ?? 0) > 0 && (tr.unplannedEnsMWh ?? 0) <= 1e-9) parts.push(t('level.L28.lessonOrdered', { shed: fmt(tr.islandShedMWh ?? 0, 1) }));   // DECISIONS 24
  if (s.status === 'won') parts.push(t('level.L28.lessonC', { vmax: fmt(tr.vMaxPu ?? 0, 3), vmaxTime: hhmm(tr.vMaxBlock ?? 0), vmaxDay: (tr.vMaxDay ?? 0) + 1, loss: fmt(tr.lossPct ?? 0, 2), viol: tr.freqViolBlocks ?? 0, lo: fmt(tr.bandLoHz ?? 49.9, 2), hi: fmt(tr.bandHiHz ?? 50.05, 2) }));
  return parts.join(' ');
}

export function finaleTryHint(s: GridState): string {
  if (s.status !== 'lost') return '';
  const k = s.block.verdictKey ?? '', tr = s.metrics.track;
  if (k === 'level.lost.budget') return t('level.L28.tryBudget');
  if (k.startsWith('level.lost.island')) return t('level.L28.tryIsland', { mwh: islandNeed(s).mwh.toFixed(0) });   // the draw and the usable window, not the answer (DECISIONS 20)
  if (k === 'level.lost.voltageLow') return t('level.L28.tryLow');
  if (k === 'level.lost.voltageHigh') return t('level.L28.tryHigh', { mvar: ringChargingMVAr(s) });
  if (k === 'level.lost.ens' || k === 'level.lost.blackout') return t('level.L28.tryEns');
  void tr; void BLOCKS_PER_DAY; void hhmm;
  return '';
}
