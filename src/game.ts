// The GRID game definition the core engine runs. One core `tick` = one 15-minute operator block (DESIGN §3.1, §8.3).
// Everything the Godot front-end shows comes from queries; every player command is an action returning {ok, message} with a
// teaching message. M0 ships an empty-but-real game: an empty grid, the clock system, a placeholder level.
import { baseState, fail, log, need, ok, type GameDef, type System } from '@core/kit';
import type { RegionPack } from '@core/regions';
import { BLOCKS_PER_DAY, MODES, SPEEDS, type ClockSpeed, type GridState } from './types';
import { LEVELS } from './levels';
import { PERSONAS } from './personas';
import { t } from './i18n';
import { REGIONS } from './regions';
import type { GridRegionData } from './regions/data';

export const GAME_ID = 'grid';

/** Length of one operator block in real seconds at 1x (a day plays in 72 s, DESIGN §3.1). */
const BLOCK_REAL_MS_AT_1X = 750;
/** History ring capacity: one entry per block for 7 days (sandbox run). */
const HISTORY_CAPACITY = BLOCKS_PER_DAY * 7;

/** A regional string the game needs; a pack that lacks one is a bug in the pack. */
function regionString(p: RegionPack<GridRegionData>, key: string): string {
  const v = p.strings[key]; if (v === undefined) throw new Error(`Region '${p.id}' has no string '${key}'.`);
  return v;
}

/**
 * The tick pipeline, DESIGN §8.3 order. Only `clock` exists in M0. Later lanes INSERT their system at the commented slot so the
 * order stays the one in the design (each system draws randomness from its own stream; insert deliberately, never reorder).
 * Systems read region data (limits, prices, f0) from the pack passed to them, never from a region id.
 */
const SYSTEMS: System<GridState>[] = [
  // 1. clock: advance the 15-minute block, roll the day over.
  { id: 'clock', run: (s) => {
    s.clock.block += 1;
    if (s.clock.block >= BLOCKS_PER_DAY) { s.clock.block = 0; s.clock.day += 1; }
  } },
  // 2. weather        (M2+: temperature, clouds advect, wind AR(1), scripted weather events)
  // 3. demand         (per-load P, Q: profiles x temperature x surges)
  // 4. renewables     (PV and wind available power, curtailment caps)
  // 5. commitment     (start/stop timers, min up/down, priority list, reserve check)
  // 6. dispatch       (lambda economic dispatch, hydro water value, storage strategy)
  // 7. controls       (auto OLTC, auto capacitor switching, queued operator actions, UVLS)
  // 8. loadflow       (islands, Newton-Raphson, Q-limits, collapse sheds -> `solution`)
  // 9. limits         (thermal timers, voltage relays, brownout accounting)
  // 10. events        (scripted contingencies; may open runEventWindow for frequency + protection + cascade)
  // 11. blockFrequency (quasi-steady delta f from the imbalance when no event window ran)
  // 12. economics     (fuel, starts, VOM, losses, ENS x VOLL, CO2, capex amortisation)
  // 13. metrics       (min margin, nadir, poor-supply minutes ...)
  // 14. levelRules    (pass/fail conditions; end-of-run result and stars)
  // 15. explain       (needsYouNow, failure diagnosis, Codex unlocks)
  // 16. history       (append the ring buffer)
];

const COUNT_KEYS = ['buses', 'branches', 'units', 'loads', 'shunts', 'storage'] as const;

export const GAME: GameDef<GridState> = {
  id: GAME_ID,
  title: 'GRID',
  saveVersion: 1,
  modes: [...MODES],
  /** Game-wide rules version: part of every solution code's ruleset id. Bump when a rule change can change a level score. */
  rulesetVersion: 1,
  regions: REGIONS,
  /** Level scores for leaderboards: the verifier returns these after replaying a solution code. */
  metrics: (s) => ({ ticks: s.tick - s.levelStart, cost: s.metrics.cost, ensMWh: s.metrics.ensMWh }),
  newGame: (seed, mode, ctx) => {
    const pack = ctx.region as RegionPack<GridRegionData>;
    const base = baseState(GAME_ID, seed, mode, pack.id);
    const s: GridState = {
      ...base,
      mode: mode as GridState['mode'],
      clock: { day: 0, block: 0, phase: 'build', speed: 1 },
      map: { tileM: 100, w: 0, h: 0, tiles: '', latitudeDeg: pack.data.climate.latitudeDeg },
      buses: [], branches: [], units: [], loads: [], shunts: [], storage: [],
      protection: { relays: [], breakers: [], ufls: pack.data.gridcode.ufls.map((u) => ({ hz: u.hz, shedPct: u.shedPct, delayS: u.delayS, operated: false })) },
      weather: { tempC: 20, clouds: [], windMs: 0, stormActive: false },
      dispatch: { lambda: 0, waterValue: null, auto: true, schedule: null },
      solution: null,
      freq: { fHz: pack.data.f0, rocof: 0 },
      events: { queue: [], log: [] },
      replay: null,
      metrics: { cost: 0, capex: 0, opex: 0, ensMWh: 0, lossesMWh: 0, poorSupplyMin: 0, ovMin: 0, minMarginPct: 0, nadirHz: pack.data.f0, maxRocof: 0, tapOps: 0, switchOps: 0, co2t: 0, predictions: [] },
      budget: { capexLimit: 0, spent: 0 },
      history: { capacity: HISTORY_CAPACITY, entries: [] },
      coach: { stepId: null, hintsUsed: 0, seen: [] },
      codexUnlocked: [],
      stars: 0,
    };
    log(s, t('log.start', { region: regionString(pack, 'region'), f0: pack.data.f0, code: regionString(pack, 'gridcode') }));
    return s;
  },
  actions: {
    /** Set the clock speed: 0 pauses, otherwise a multiple of real time. */
    setSpeed: (s, speed: unknown) => {
      need(typeof speed === 'number' && Number.isFinite(speed), t('speed.notNumber'));
      if (!(SPEEDS as readonly number[]).includes(speed)) fail(t('speed.invalid', { speed }));
      s.clock.speed = speed as ClockSpeed;
      return ok(speed === 0 ? t('speed.paused') : t('speed.ok', { speed, sec: Math.round(BLOCK_REAL_MS_AT_1X / speed) / 1000 }));
    },
  },
  queries: {
    /** The simulation clock; the HUD formats hh:mm from `block` (15 minutes each). */
    clock: (s) => ({ day: s.clock.day, block: s.clock.block, minuteOfDay: s.clock.block * 15, hour: Math.floor(s.clock.block / 4), minute: (s.clock.block % 4) * 15, phase: s.clock.phase, speed: s.clock.speed, blocksPerDay: BLOCKS_PER_DAY, tick: s.tick }),
    /** Counts of what has been built, the region id and the mode. */
    summary: (s) => ({ region: s.region, mode: s.mode, counts: Object.fromEntries(COUNT_KEYS.map((k) => [k, s[k].length])) as Record<(typeof COUNT_KEYS)[number], number> }),
  },
  systems: SYSTEMS,
  catalogues: () => ({ blocksPerDay: BLOCKS_PER_DAY, blockMinutes: 15, speeds: [...SPEEDS] }),
  levels: LEVELS,
  personas: PERSONAS,
  invariants: (s) => {
    const v: { rule: string; detail: string }[] = [];
    if (!Number.isInteger(s.clock.block) || s.clock.block < 0 || s.clock.block >= BLOCKS_PER_DAY) v.push({ rule: 'block outside 0..95', detail: String(s.clock.block) });
    if (!Number.isInteger(s.clock.day) || s.clock.day < 0) v.push({ rule: 'bad day', detail: String(s.clock.day) });
    if (s.tick !== s.clock.day * BLOCKS_PER_DAY + s.clock.block) v.push({ rule: 'tick must equal day x 96 + block', detail: `${s.tick} vs ${s.clock.day}/${s.clock.block}` });
    if (!(SPEEDS as readonly number[]).includes(s.clock.speed)) v.push({ rule: 'clock speed not allowed', detail: String(s.clock.speed) });
    return v;
  },
  saveLabel: (s) => t('save.label', { region: REGIONS.get(s.region).strings.region ?? s.region, day: s.clock.day + 1, buses: s.buses.length }),
  describe: (s) => `Tick ${s.tick}: day ${s.clock.day}, block ${s.clock.block}, speed ${s.clock.speed}x, ${s.buses.length} buses, status ${s.status}.`,
  legalActions: () => SPEEDS.map((x) => ({ name: 'setSpeed', args: [x] })),
};
