// GRID game state (DESIGN §8.2) on top of core's BaseState.
//
// Contract (core): the state is plain JSON. It is cloned on every action, hashed, saved and sent over the bridge.
//   - no typed arrays, Maps, Sets, classes, functions, Dates;
//   - no optional fields and no `undefined`: an absent value is `null` (an optional key that is sometimes missing and sometimes
//     undefined would hash differently after a save round-trip);
//   - big binary-ish data is a base64 string (`map.tiles`);
//   - derived data (branch flows, Jacobian, sensitivities, overlay colours) is NEVER stored: queries recompute it.
// Units are in the field name or the doc comment: pu (per unit on S_base = 100 MVA), MW, MVAr, MVA, kV, km, m, s, Hz, deg, rad.
// Ids are strings and unique within their list. `block` is the 15-minute operator block (0..95 in a day).
import type { BaseState } from '@core/kit';

/** Game modes (DESIGN §2.4). First is the default. */
export const MODES = ['learner', 'engineer', 'sandbox'] as const;
export type GridMode = (typeof MODES)[number];

/** Operator blocks per day: 24 h × 4 (the 15-minute settlement period, DESIGN §3.1). */
export const BLOCKS_PER_DAY = 96;
/** Minutes per operator block. */
export const BLOCK_MINUTES = 15;
/** Allowed clock speeds: 0 = paused, otherwise the multiple of real time (DESIGN §3.1). */
export const SPEEDS = [0, 0.5, 1, 2, 4] as const;
export type ClockSpeed = (typeof SPEEDS)[number];

export type ClockPhase = 'build' | 'run' | 'event' | 'replay' | 'result';
export interface Clock {
  /** Whole days elapsed since the start (0-based). */
  day: number;
  /** Operator block within the day, 0..95. */
  block: number;
  phase: ClockPhase;
  speed: ClockSpeed;
}

export interface MapGrid {
  /** Edge of one terrain tile, m. */
  tileM: number;
  /** Width and height in tiles. */
  w: number;
  h: number;
  /** Terrain class per tile, one byte each, row-major, base64 (core state must be plain JSON). '' on an empty map. */
  tiles: string;
  /** Latitude of the map centre, degrees north (from the region pack's climate). */
  latitudeDeg: number;
}

export type BusKind = 'gen' | 'load' | 'sub' | 'junction';
export interface Bus {
  id: string;
  name: string;
  /** Position in tiles from the map's top-left corner. */
  x: number;
  y: number;
  /** Nominal line-to-line voltage, kV. */
  kvNom: number;
  kind: BusKind;
  /** Voltage set-point of a generator/slack bus, pu; null for other kinds. */
  vSet: number | null;
  /** Zone (island/area) label used for V_base grouping and island detection. */
  zone: string;
}

export type BranchKind = 'line' | 'cable' | 'xfmr';
export interface TapAuto { vSet: number; deadband: number; delayBlocks: number; counter: number }
export interface Branch {
  id: string;
  /** Bus ids. */
  from: string;
  to: string;
  kind: BranchKind;
  /** Catalogue row id (conductor, cable or transformer SKU). */
  catalogId: string;
  circuits: number;
  lengthKm: number;
  /** Route corner points in tiles, for drawing only. */
  waypoints: [number, number][];
  inService: boolean;
  /** Transformer tap position (steps) and optional automatic control; null for lines and cables. */
  tap: { pos: number; auto: TapAuto | null } | null;
  /** Thermal rating of the whole branch, MVA. */
  ratingMVA: number;
  /** Running overload timer, s left to trip; null when not overloaded. */
  timer: { secLeft: number } | null;
}

export type UnitKind = 'coal' | 'gas' | 'diesel' | 'biomass' | 'nuclear' | 'hydro' | 'psp' | 'pv' | 'wind' | 'synccon';
export interface Unit {
  id: string;
  bus: string;
  catalogId: string;
  kind: UnitKind;
  online: boolean;
  /** Present output, MW and MVAr; set-point, MW. */
  P: number;
  Q: number;
  Pset: number;
  /** Commitment: hourly-block schedule (1 = on) and timers, blocks. */
  commit: { schedule: number[]; minUpLeft: number; startLeft: number };
  /** Governor droop, percent. */
  droopPct: number;
  /** Inertia constant on own MVA base, s. */
  H: number;
  /** Rating, MVA. */
  mva: number;
  /** Spare capacity to Pmax, MW (the reserve). */
  headroom: number;
  gridForming: boolean;
}

export type LoadClass = 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'critical';
export interface Load {
  id: string;
  bus: string;
  class: LoadClass;
  /** Peak active demand, MW. */
  Ppeak: number;
  /** Power factor, 0..1 (lagging). */
  pf: number;
  /** ZIP split of constant-impedance / constant-current / constant-power shares (sum 1). */
  zip: [number, number, number];
  /** Fraction of the demand currently shed (0..1). */
  shedFrac: number;
  /** UFLS stage index this load is fed from; null when not on a stage. */
  uflsStage: number | null;
  priority: 'hospital' | 'school' | null;
}

export type ShuntKind = 'cap' | 'reactor' | 'svc' | 'statcom';
export interface Shunt {
  id: string;
  bus: string;
  kind: ShuntKind;
  /** Size of one step, MVAr (+ capacitive). */
  mvarStep: number;
  steps: number;
  /** Steps switched in. */
  on: number;
  auto: { vLowPu: number; vHighPu: number; delayBlocks: number; counter: number } | null;
}

export interface Storage {
  id: string;
  bus: string;
  catalogId: string;
  /** Output (+ discharging), MW. */
  P: number;
  /** State of charge, 0..1. */
  soc: number;
  mode: 'schedule' | 'threshold' | 'ffr';
  /** One MW value per block of a day for 'schedule' mode; null otherwise. */
  schedule: number[] | null;
}

export type RelayKind = 'overcurrent' | 'distance' | 'overvoltage' | 'undervoltage' | 'underfrequency' | 'rocof';
export interface Relay {
  id: string;
  kind: RelayKind;
  /** Branch or bus id it protects. */
  element: string;
  /** Pick-up setting: A or pu of CT rating, pu of V, Hz or Hz/s depending on kind. */
  pickup: number;
  /** Time-multiplier setting (IDMT) or definite delay, s. */
  tms: number;
  curve: 'SI' | 'VI' | 'EI' | 'LTI' | 'definite';
  /** Pick-up time of a running timer, s elapsed; null when idle. */
  elapsedS: number | null;
}
export interface Breaker {
  id: string;
  /** Branch id it opens. */
  branch: string;
  closed: boolean;
  /** Rated breaking current, kA. */
  ratingKA: number;
  /** Interrupting time, cycles. */
  cycles: 2 | 3 | 5;
}
export interface UflsStage {
  /** Under-frequency pick-up, Hz. */
  hz: number;
  /** Share of demand this stage sheds, percent. */
  shedPct: number;
  /** Relay plus breaker delay, s. */
  delayS: number;
  /** Operated in the current event. */
  operated: boolean;
}

export interface CloudBlob { x: number; y: number; radiusTiles: number; opacity: number }
export interface Weather { tempC: number; clouds: CloudBlob[]; windMs: number; stormActive: boolean }

export interface Dispatch {
  /** System marginal price, currency per MWh (pack currency). */
  lambda: number;
  /** Hydro water value, currency per MWh; null when no hydro. */
  waterValue: number | null;
  auto: boolean;
  /** Manual schedule: one row per unit, one MW per block; null when auto. */
  schedule: number[][] | null;
}

/** Per-bus result of the last load flow. Flows and the Jacobian are recomputed by queries, never stored. */
export interface LoadFlowResult {
  converged: boolean;
  iterations: number;
  /** One entry per energised bus. */
  buses: { id: string; vPu: number; thetaRad: number }[];
  /** Loadability margin multiplier at the nose; null if not computed. */
  lambdaStar: number | null;
}

export interface Freq { fHz: number; /** Hz/s over the 500 ms window */ rocof: number }

export interface ScriptedEvent {
  id: string;
  /** Block of the day (0..95) on `day` when it fires. */
  day: number;
  block: number;
  kind: 'trip-unit' | 'trip-branch' | 'fault' | 'load-surge' | 'storm' | 'cloud-front';
  /** Element id the event hits; '' for weather events. */
  target: string;
  /** Size: MW for surges, ohms for fault impedance, otherwise 0. */
  magnitude: number;
}
export interface EventLogEntry { day: number; block: number; tS: number; element: string; /** locale key of the cause text */ causeKey: string }
export interface Events { queue: ScriptedEvent[]; log: EventLogEntry[] }

/** Last event window only: f/δ traces decimated to 20 ms and quantised (≤ 64 KB). */
export interface ReplayLog {
  startDay: number;
  startBlock: number;
  /** Sample spacing, s. */
  dtS: number;
  /** Frequency in mHz relative to f0 (integers) and rotor angle in 0.1 deg (integers). */
  fMilliHz: number[];
  deltaDeciDeg: number[];
  /** Discrete things that happened, in time order. */
  marks: { tS: number; element: string; causeKey: string }[];
}

/** A prediction the player made before running (P17) and what happened. */
export interface Prediction { id: string; quantity: string; predicted: number; actual: number | null; unit: string }

export interface Metrics {
  /** Operating cost so far, pack currency (US$ in `global`). */
  cost: number;
  capex: number;
  opex: number;
  /** Energy not served, MWh; network losses, MWh. */
  ensMWh: number;
  lossesMWh: number;
  poorSupplyMin: number;
  ovMin: number;
  /** Smallest generation margin seen, percent of demand. */
  minMarginPct: number;
  /** Lowest frequency and largest |RoCoF| seen, Hz and Hz/s. */
  nadirHz: number;
  maxRocof: number;
  tapOps: number;
  switchOps: number;
  /** CO2 emitted, tonnes. */
  co2t: number;
  predictions: Prediction[];
}

export interface Budget { /** pack currency */ capexLimit: number; spent: number }

/** One operator block of history. */
export interface HistoryEntry {
  day: number;
  block: number;
  demandMW: number;
  /** Generation by kind, MW. */
  genMW: Record<string, number>;
  fHz: number;
  worstVPu: number;
  worstLoading: number;
  cost: number;
}
/** Fixed ring: at most `capacity` entries (96 × days), oldest dropped first. */
export interface HistoryRing { capacity: number; entries: HistoryEntry[] }

export interface Coach { stepId: string | null; hintsUsed: number; seen: string[] }

export interface GridState extends BaseState {
  /** Operator-block count equals `tick` (BaseState). `region` and `ruleset` come from BaseState too. */
  mode: GridMode;
  clock: Clock;
  map: MapGrid;
  buses: Bus[];
  branches: Branch[];
  units: Unit[];
  loads: Load[];
  shunts: Shunt[];
  storage: Storage[];
  protection: { relays: Relay[]; breakers: Breaker[]; ufls: UflsStage[] };
  weather: Weather;
  dispatch: Dispatch;
  solution: LoadFlowResult | null;
  freq: Freq;
  events: Events;
  replay: ReplayLog | null;
  metrics: Metrics;
  budget: Budget;
  history: HistoryRing;
  coach: Coach;
  /** Concept ids unlocked in this level state (campaign-wide unlocks live in the profile save). */
  codexUnlocked: string[];
  stars: 0 | 1 | 2 | 3;
}
