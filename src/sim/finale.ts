// L28 "Keep the Lights On" (DESIGN 2.6 finale, three days on the whole state). Everything here is gated on `state.rules.finale`, so no other level's state, goldens or time budget change.
//   - the scripted weather of the three days (pinned, so the same scenario for every seed): temperature, wind, cloud cover (finaleWeather, before the demand system)
//   - the holiday's demand by class (finaleScale, used by the demand system and by the commitment look-ahead, so the day's low demand leaves the coal units off)
//   - the repair crews: a branch the storm opened is closed again at its repair block
//   - the batteries: held for reserve (no price arbitrage), floating at the top of their window while the grid is alive (a battery on the island is the island's last resort)
//   - the day's measurements the stars read (island never dark, share of blocks outside the standard frequency range, energy not served as a share of the demand) and the island verdict
import { log } from '@core/kit';
import { dmath } from '@core/numerics';
import { t } from '../i18n';
import type { GridState, LoadClass, Rules } from '../types';
import { solvedOf } from './solved';
import { SOC_MAX } from './islandStorage';
import { oneWayEfficiency } from './dispatch/storage';

/** The weather and demand of one day of the run. */
export interface FinaleDay {
  /** Night minimum (03:00) and afternoon maximum (15:00) of the temperature, degC. */
  tMinC: number; tMaxC: number;
  /** Wind speed at hub height, m/s (a storm overrides it). */
  windMs: number;
  /** Cloud opacity over the whole state, 0 clear .. 1. */
  cloud: number;
  /** Multiplier of each class's demand (the holiday: offices and mills shut). */
  scale: Partial<Record<LoadClass, number>>;
}
export interface FinaleRules {
  days: FinaleDay[];
  /** Bus of Saltmarsh Island's feeder: it must never go dark. */
  islandBus: string;
  /** Branches the crews close again: id, day (0-based), block. */
  repairs: { id: string; day: number; block: number }[];
  /** Lightning on a feeder: the branch opens (protection-cleared, no event window: a battery can hold the island this makes); the crews repair it per `repairs`. */
  lightning: { id: string; day: number; block: number } | null;
  /** Storm warning, per scripted event (for the log): day, block, locale key of the line. */
  beats: { day: number; block: number; key: string }[];
  /** Share of a shed feeder the operator closes again each block (0.5: back in 30 minutes). */
  restorePerBlock: number;
  /** The demand energy of the three days with nothing shed, MWh (oracle: tools/oracles/chf_oracles.py): the ENS share is measured against it. */
  energyMWh: number;
  /** What the island draws from the lightning to the repair, MWh (oracle F-3): the battery has to carry it. */
  nightMWh: number;
}

const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
const dayOf = (f: FinaleRules, day: number): FinaleDay => f.days[Math.max(0, Math.min(day, f.days.length - 1))]!;

/** The temperature of a block: a cosine from the 03:00 minimum to the 15:00 maximum. */
export function finaleTemp(d: FinaleDay, block: number): number {
  const h = block / 4;
  return d.tMinC + (d.tMaxC - d.tMinC) * (0.5 - 0.5 * dmath.cos((2 * Math.PI * (h - 3)) / 24));
}

/** Demand multiplier of a class on a day (1 when the level is not the finale). */
export function finaleScale(s: Pick<GridState, 'rules'>, cls: LoadClass, day: number, block = BLEND_BLOCKS): number {
  const f = s.rules.finale;
  if (!f) return 1;
  const cur = dayOf(f, day).scale[cls] ?? 1;
  if (day <= 0 || block >= BLEND_BLOCKS) return cur;
  const prev = dayOf(f, day - 1).scale[cls] ?? 1;   // a holiday does not begin at the stroke of midnight: the change eases in over the first two hours
  return prev + (cur - prev) * ((block + 1) / BLEND_BLOCKS);
}
const BLEND_BLOCKS = 8;

/** Before the demand system: pin the weather, run the repair crews, keep the batteries full. */
export function finaleWeather(s: GridState): void {
  const f = s.rules.finale;
  if (!f) return;
  const d = dayOf(f, s.clock.day), block = s.clock.block;
  s.weather.tempC = finaleTemp(d, block);
  if (!s.weather.stormActive) s.weather.windMs = d.windMs;
  s.weather.clouds = [{ x: s.map.w / 2, y: s.map.h / 2, radiusTiles: 1000, opacity: d.cloud, vx: 0, vy: 0 }];
  for (const l of s.loads) {   // feeders the under-frequency relays opened are closed again by the operator, down to what the operator ordered off (shedLoad)
    const hold = l.shedHold ?? 0;
    if (l.shedFrac > hold) l.shedFrac = l.shedFrac - f.restorePerBlock > hold + 1e-9 ? l.shedFrac - f.restorePerBlock : hold;
  }
  for (const r of f.repairs) {
    if (r.day !== s.clock.day || r.block !== block) continue;
    const b = s.branches.find((x) => x.id === r.id);
    if (!b || b.inService) continue;
    b.inService = true; b.timer = null;
    s.events.log.push({ day: s.clock.day, block, tS: 0, element: r.id, causeKey: 'finale.repaired' });
    log(s, t('log.finale.repaired', { id: r.id, time: hhmm(block) }), 'good');
    if (f.lightning && r.id === f.lightning.id) for (const l of s.loads) if (l.bus === f.islandBus && l.shedHold !== undefined) {   // with its feeder back, the island's own feeders are closed again with it
      delete l.shedHold; l.shedFrac = 0;
      log(s, t('log.finale.feederBack', { id: l.id }), 'good');
    }
  }
  const lt = f.lightning;
  if (lt && lt.day === s.clock.day && lt.block === block) {
    const b = s.branches.find((x) => x.id === lt.id);
    if (b && b.inService) {
      b.inService = false; b.timer = null;
      s.metrics.track.lightning = (s.metrics.track.lightning ?? 0) + 1;
      s.events.log.push({ day: s.clock.day, block, tS: 0, element: b.id, causeKey: 'finale.lightning' });
      log(s, t('log.finale.lightning', { id: b.id, time: hhmm(block) }), 'bad');
    }
  }
  for (const b of f.beats) if (b.day === s.clock.day && b.block === block) log(s, t(b.key), 'bad');
  // batteries are held for reserve and the island: no arbitrage; on a live grid they float back toward the top of their window (power-limited, one-way efficiency)
  const solved = solvedOf(s);
  for (const b of s.storage) {
    b.mode = 'ffr'; b.schedule = null;
    const live = !solved || solved.sol.energised[b.bus] !== false;
    if (!live || b.soc >= SOC_MAX || b.P > 1e-9) continue;   // a battery that held an island last block (it is discharging) is not on a live grid: no float charge
    const eta = oneWayEfficiency(b.etaRt);
    b.soc = Math.min(SOC_MAX, b.soc + (b.mw * 0.25 * eta) / Math.max(1e-9, b.mwh));
  }
}

/** The day's measurements, after the block's load flow and frequency: island lights, frequency band, energy not served. */
export function finaleTrack(s: GridState, standardRangeHz: [number, number]): void {
  const f = s.rules.finale;
  if (!f) return;
  const tr = s.metrics.track, solved = solvedOf(s);
  tr.demandMWh = (tr.demandMWh ?? 0) + s.loads.reduce((a, l) => a + l.P, 0) * 0.25;
  tr.ensPct = f.energyMWh > 0 ? (100 * s.metrics.ensMWh) / f.energyMWh : 0;
  // what was not served and the operator did not order: relay sheds and dark buses count, the shed an operator holds on purpose (shedLoad, shedHold) does not (DECISIONS 24)
  let unplanned = 0;
  for (const l of s.loads) {
    const dark = solved && solved.sol.energised[l.bus] === false;
    unplanned += l.P * (l.shedFrac - Math.min(l.shedFrac, l.shedHold ?? 0) + (1 - l.shedFrac) * (dark ? 1 : 0));
  }
  tr.unplannedEnsMWh = (tr.unplannedEnsMWh ?? 0) + unplanned * 0.25;
  tr.unplannedEnsPct = f.energyMWh > 0 ? (100 * tr.unplannedEnsMWh) / f.energyMWh : 0;
  const island = s.loads.filter((l) => l.bus === f.islandBus);
  const dark = island.some((l) => l.P > 0 && ((solved ? solved.sol.energised[l.bus] === false : false) || l.shedFrac > 0.5));
  tr.islandDarkBlocks = (tr.islandDarkBlocks ?? 0) + (dark ? 1 : 0);
  if (dark && tr.islandDarkBlock === undefined) { tr.islandDarkBlock = s.clock.block; tr.islandDarkDay = s.clock.day; }
  tr.islandMWh = (tr.islandMWh ?? 0) + island.reduce((a, l) => a + (dark ? 0 : l.P * (1 - l.shedFrac)), 0) * 0.25;
  const demand = s.loads.reduce((a, l) => a + l.P, 0);
  if (tr.peakDemandMW === undefined || demand > tr.peakDemandMW) { tr.peakDemandMW = demand; tr.peakDemandDay = s.clock.day; }
  const lt = f.lightning, ltBranch = lt ? s.branches.find((x) => x.id === lt.id) : undefined;
  if (lt && (tr.lightning ?? 0) > 0 && ltBranch && !ltBranch.inService) {
    tr.islandNightMWh = (tr.islandNightMWh ?? 0) + island.reduce((a, l) => a + l.P, 0) * 0.25;   // what the island drew while its feeder was open
    const shed = island.reduce((a, l) => a + l.P * l.shedFrac, 0) * 0.25;
    if (shed > 0) tr.islandShedMWh = (tr.islandShedMWh ?? 0) + shed;   // of it, what the operator's open feeders left unserved (absent when none)
  }
  const hz = s.freq.fHz;
  if (s.block.eventWindow) {   // a 60 s event-window dip is not a violation (the card counts excursions of 15 minutes or more): it is reported, not counted
    tr.freqDips = (tr.freqDips ?? 0) + 1; tr.freqNadirHz = Math.min(tr.freqNadirHz ?? 50, s.metrics.nadirHz);
    return;
  }
  tr.bandLoHz = standardRangeHz[0]; tr.bandHiHz = standardRangeHz[1];   // the band the count uses, for the debrief
  const out = hz < standardRangeHz[0] - 1e-9 || hz > standardRangeHz[1] + 1e-9;
  tr.freqViolBlocks = (tr.freqViolBlocks ?? 0) + (out ? 1 : 0);
  if (out && Math.abs(hz - 50) > Math.abs((tr.freqWorstDevHz ?? 0))) { tr.freqWorstDevHz = hz - 50; tr.freqWorstBlock = s.clock.block; tr.freqWorstDay = s.clock.day; }
  tr.freqMinHz = Math.min(tr.freqMinHz ?? 50, hz);
}

/** The finale's own loss: the island went dark. (Energy not served and the voltage watch are the generic rules.) */
export function finaleVerdict(s: Readonly<GridState>, rules: Readonly<Rules>): { key: string; params: Record<string, string | number> } | null {
  const f = rules.finale;
  if (!f) return null;
  const tr = s.metrics.track;
  if ((tr.islandDarkBlocks ?? 0) === 0) return null;
  const solved = solvedOf(s as GridState);
  const island = s.loads.filter((l) => l.bus === f.islandBus);
  const mw = island.reduce((a, l) => a + l.P, 0);
  const bats = s.storage.filter((b) => b.bus === f.islandBus);
  const feeders = s.branches.filter((b) => b.from === f.islandBus || b.to === f.islandBus);
  return {
    key: bats.length > 0 ? 'level.lost.islandStormBattery' : 'level.lost.islandStorm',
    params: {
      time: hhmm(tr.islandDarkBlock ?? 0), day: (tr.islandDarkDay ?? 0) + 1, mw: Math.round(mw * 10) / 10, feeders: feeders.length,
      open: feeders.filter((b) => !b.inService).length, mwh: Math.round(bats.reduce((a, b) => a + b.mwh, 0) * 10) / 10, soc: Math.round(Math.min(...bats.map((b) => b.soc), 1) * 100),
      live: solved && solved.sol.energised[f.islandBus] !== false ? 1 : 0,
    },
  };
}
