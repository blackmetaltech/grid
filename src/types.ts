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
  /** Series R, X, total charging susceptance bc and shunt conductance gc of the whole branch, pu on 100 MVA (stored at build time). */
  r: number; x: number; bc: number; gc: number;
  /** Tap position limits (steps) for a transformer; 0/0 otherwise. */
  tapMin: number; tapMax: number;
  /** Running overload timer: seconds left to trip, heat fraction used (0..1) and seconds spent below the reset level; null when not overloaded. */
  timer: { secLeft: number; frac: number; belowS: number } | null;
  /** Chapter 3 (absent elsewhere): series capacitor on the line, percent of its reactance, and the line's gross reactance before it (pu on 100 MVA); `x` is the working reactance (L09). */
  seriesCap?: { pct: number; xGross: number };
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
  /** Commitment: per-block schedule (1 = on; [] = none) and timers, blocks. */
  commit: { schedule: number[]; minUpLeft: number; minDownLeft: number; startLeft: number };
  /** Limits copied from the catalogue at placement: MW and MVAr. */
  pMin: number; pMax: number; qMin: number; qMax: number;
  /** Ramp rate, MW per minute. */
  rampMWperMin: number;
  /** Available power this block, MW: Pmax for dispatchable units, sun/wind-limited for pv and wind. */
  availMW: number;
  /** Fuel cost curve a + b P + c P^2 (currency/h, MW), variable O&M, start-up cost, CO2 intensity, start-up and min up/down times (blocks). */
  cost: { a: number; b: number; c: number };
  vomPerMWh: number; startCost: number; co2tPerMWh: number;
  minUpBlocks: number; minDownBlocks: number; startBlocks: number;
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
  /** Demand this block before shedding, MW and MVAr (set by the demand system). */
  P: number; Q: number;
  /** Power factor, 0..1 (lagging). */
  pf: number;
  /** ZIP split of constant-impedance / constant-current / constant-power shares (sum 1). */
  zip: [number, number, number];
  /** Fraction of the demand currently shed (0..1). */
  shedFrac: number;
  /** UFLS stage index this load is fed from; null when not on a stage. */
  uflsStage: number | null;
  priority: 'hospital' | 'school' | null;
  /** A level-authored daily shape: P and Q per block as a fraction of `Ppeak` (96 each); null = the class profile and `pf`. */
  shape: { p: number[]; q: number[] } | null;
  /** Chapter 3 (absent elsewhere): a variable-speed drive load, a 6-pulse harmonic current source I1 / h (L08). */
  vfd?: boolean;
}

export type ShuntKind = 'cap' | 'reactor' | 'svc' | 'statcom';
export interface Shunt {
  id: string;
  bus: string;
  /** Catalogue row id it was built from. */
  catalogId: string;
  kind: ShuntKind;
  /** Size of one step, MVAr (+ capacitive). */
  mvarStep: number;
  steps: number;
  /** Steps switched in. */
  on: number;
  auto: { vLowPu: number; vHighPu: number; delayBlocks: number; counter: number } | null;
  /** Chapter 3 (absent elsewhere): reactor share of the capacitor's reactance, percent (a detuned bank or tuned filter), and the fuse of an overloaded bank blown (L08). */
  detunePct?: number; blown?: boolean;
}

export interface Storage {
  id: string;
  bus: string;
  catalogId: string;
  /** Output (+ discharging), MW. */
  P: number;
  /** State of charge, 0..1. */
  soc: number;
  /** Rated power, MW, energy, MWh, round-trip efficiency (copied from the catalogue at placement). */
  mw: number; mwh: number; etaRt: number;
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

/** A cloud: centre and radius in tiles, opacity 0..1, drift in tiles per block. */
export interface CloudBlob { x: number; y: number; radiusTiles: number; opacity: number; vx: number; vy: number }
export interface Weather { tempC: number; clouds: CloudBlob[]; windMs: number; stormActive: boolean; /** blocks of scripted storm left */ stormLeft: number }

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
  /** Named level measurements the star rules read (e.g. 'pfMinAbs', 'lossPct', 'vLoadMinV'); written by systems, never by levels. */
  track: Record<string, number>;
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

/** A teaching message as data: the front-end turns `key` + `params` into words. */
export interface Note { key: string; params: Record<string, string | number> }

/** Pass/fail conditions of the running level, set by `Level.setup`. null = not enforced. */
export interface Rules {
  /** Blocks the level lasts; reaching it without a loss wins. */
  horizonBlocks: number | null;
  maxEnsMWh: number | null; maxCost: number | null; minNadirHz: number | null; maxPoorSupplyMin: number | null;
  /** Grace before a poor-supply loss, minutes (bench levels: the player sees an hour of dim homes before the incident report). */
  poorSupplyGraceMin?: number;
  /** A total blackout loses the level. */
  blackoutLoses: boolean;
  /** Cost thresholds for 2 and 3 stars (3 also needs zero ENS and every `star3` condition); null = one star. */
  starCost: [number, number] | null;
  /** What `starCost` compares: the operating `metrics.cost` or the build cost `budget.spent`. */
  starBasis: 'operating' | 'capex' | 'score';
  /** Block of the day at which every route with a span under its clearance rule flashes over and trips (the hot evening peak); null = never. */
  flashoverBlock: number | null;
  /** Block at which supports short of their tile's creepage flash over in the sea fog (L29); null/absent = never. */
  fogBlock?: number | null;
  /** A load on a de-energised bus counts as poor supply (a level where part of the job is an unserved bus that would otherwise sit outside every island check: L29's harbour). */
  darkLoadsLose?: boolean;
  /** Block at which a trawler's anchor cuts every submarine cable (L30); null/absent = never. */
  cableCutBlock?: number | null;
  /** The sea distance a submarine cable laid by `layCableRoute` spans, km (L30); absent = the straight distance between its buses. */
  seaCableKm?: number | null;
  /** Chapter 6 (absent elsewhere): record the frequency numbers of the event window and the blocks in `metrics.track` (nadir, RoCoF, shed MW, band share), and rate the predictions. */
  freqTrack?: boolean;
  /** Chapter 6: a 500 ms RoCoF above this (Hz/s) in the event window loses (L21: "RoCoF <= 1.0 Hz/s"). */
  maxRocofHzS?: number | null;
  /** Chapter 6: ids of the legacy rooftop PV units that trip on RoCoF > derRocofHzS (no ride-through, DESIGN S29); cleared by `upgradeRideThrough`. */
  derLegacyIds?: string[];
  derRocofHzS?: number;
  /** Chapter 6 (L20): block frequency outside +-0.2 Hz in any block loses; this share of blocks must sit inside the standard range. */
  maxDevHz?: number | null;
  /** Chapter 6 (L20): at the end of the run at least this percent of the blocks must sit inside the pack's standard frequency range. */
  minInRangePct?: number | null;
  /** Chapter 6 (L22 exam bridge): the textbook cases are rated against the engine's answers; stars = 1 + (>= 2 predictions within 0.5 %) + (all 3). */
  freqExam?: boolean;
  predStars?: boolean;
  /** Chapter 6: once `metrics.track[key]` exists it must stay inside [lo, hi] (L22: G1's share of the step, 0.58..0.62). */
  trackBand?: { key: string; lo: number; hi: number } | null;
  /** Chapter 5 (absent elsewhere, so other levels' states and goldens stay as they were): every energised bus of these nominal kVs must stay within [lo, hi] pu; more than `graceBlocks` blocks outside loses. */
  vWatch?: { lo: number; hi: number; kv: number[]; graceBlocks: number; /** only these bus ids (instead of every bus of the listed kVs) */ buses?: string[] } | null;
  /** Chapter 5: any branch above this fraction of its rating in a block loses (L16: "no line above 100 %"). */
  maxLoading?: number | null;
  /** Chapter 5: blocks above `maxLoading` tolerated before the loss (an overload timer, not a trip wire); absent = 0. */
  loadingGraceBlocks?: number;
  /** Chapter 5: probe the N-1 security of every block (worst post-outage loading of any branch, tracked as `n1Loading`); it never changes play, only the third star. */
  n1?: boolean;
  /** Chapter 5: a case that is beyond its maximum loadability (lambda* < 1) loses as a voltage collapse. */
  collapseLoses?: boolean;
  /** Chapter 5 exam bridge (L18): resolve the player's predictions against the textbook 3-bus case and count the ones within 0.5 %. */
  exam?: boolean;
  /** Chapter 5: track the post-trip loadability margin (percent above the load, from the continuation) once this block of the day has passed (L17). */
  marginFromBlock?: number | null;
  /** Extra conditions for the third star: a tracked metric (`metrics.track[key]`) must be >= min and/or <= max. */
  star3: { key: string; min: number | null; max: number | null }[];
  /** Chapter 3 (absent elsewhere): the harmonic, fault and power-factor rules of L07-L09 (src/sim/ch3). */
  ch3?: import('./sim/ch3/rules').Ch3Rules;
}

/** A bench level's circuit as the player has built it so far (DC bench, DESIGN 2.6 L01-L03). Derived values are recomputed, never stored. */
export interface BenchState {
  scenario: 'l01' | 'l02' | 'l03' | 'l04' | 'l06';
  /** Distance of the battery hut from the first hamlet, m; null until placed. */
  hutM: number | null;
  /** Cable per segment: 'main' (L01, L03; L02 trunk or radial A), 'b' (radial B / trunk branch), cross-section in mm2; null = not laid. */
  cableMm2: { main: number | null; b: number | null };
  /** L02 only: 'radial' (two cables from the hut) or 'trunk' (junction box, trunk plus branch); null until chosen. */
  topology: 'radial' | 'trunk' | null;
  /** L03: converter pair placed (380 V line) or not (48 V line). */
  converters: boolean;
  /** Pass limits resolved from the level and region at setup: lowest home voltage, V, and highest line-loss share, percent (null = not enforced). */
  limits: { vMinV: number | null; lossMaxPct: number | null };
  /** L04 (chapter 2): the alternator as wound; absent on every other bench (src/level/ch2/machine.ts). */
  machine?: MachineState;
  /** L06 (chapter 2): the textbook town line as built; absent on every other bench (src/level/ch2/town.ts). */
  town?: TownState;
  /** Set by the chapter-2 benches each block while the circuit is failing: the locale key and params of why (the verdict reads it). */
  verdict?: { key: string; params: Record<string, string | number> };
}

/** L04's alternator: what the player sets (poles, turns, field, coil area) and what the scenario fixes (shaft speed, targets, copper price). */
export interface MachineState {
  poles: number; turns: number; fieldT: number; areaM2: number;
  /** Shaft speed set by the water head, rpm. */
  rpm: number;
  /** The village's needs: rms volts and hertz with their tolerances, percent. */
  vTargetRms: number; vTolPct: number; fTargetHz: number; fTolPct: number;
  /** Pack price of copper: per metre per mm2 per core. */
  copperPerMm2PerM: number;
}
/** L06's textbook town line: the step-up/step-down turns ratio, the transformer rating, and what the scenario fixes. */
export interface TownState {
  /** Turns ratio N2/N1 of the step-up transformer (the step-down is its mirror); 1 = no transformers. */
  ratio: number; kva: number;
  /** Fixed by the scenario: power sent (W), line loop resistance (ohm), generator voltage (V), loss limit (percent). */
  pW: number; rLoopOhm: number; vGenV: number; lossMaxPct: number;
  /** Pack price of one kVA of distribution transformer. */
  pricePerKva: number;
}

/** Summary of the last operator block (everything the HUD and the explain card need that is not stored elsewhere). */
export interface BlockSummary {
  demandMW: number; genMW: number; lossMW: number;
  /** Energy not served this block as average MW, and generation short of demand after dispatch, MW. */
  ensMW: number; shortfallMW: number; curtailedMW: number; imbalanceMW: number;
  reserveMW: number; marginPct: number;
  /** L28 (the finale, absent elsewhere): the three scripted days, the island that must stay lit, the repair crews (src/sim/finale.ts). */
  finale?: import('./sim/finale').FinaleRules | null;
  worstVPu: number; worstLoading: number;
  costBlock: number; starts: number; startCostBlock: number;
  eventWindow: boolean; trips: string[]; blackout: boolean;
  verdict: 'playing' | 'won' | 'lost'; verdictKey: string | null; verdictParams: Record<string, string | number>;
  needs: Note[];
}

export interface LoggedAction { tick: number; name: string; key: string }

/** What a route request looked like (src/sim/route/types.ts RouteRequest, repeated structurally: the state stays plain JSON and imports nothing). */
export interface RouteRequestRecord {
  waypoints: [number, number][]; familyId: string; crossingFamilyId: string | null; conductorId: string; kv: number; spanM: number;
  /** Insulator ids (L29); absent = plain pins. */
  insulatorId?: string; coastInsulatorId?: string;
}
/** The support of a route that is shortest of creepage for its tile (L29 fog flashover): index along the route, distance to the sea (m), pollution class, creepage needed and had (mm). */
export interface SaltSupportRecord { index: number; seaM: number; cls: number; needMm: number; hasMm: number; insulatorId: string }
/** The span of a built route with the smallest clearance margin: the numbers the lesson, the flashover event and the incident report quote. */
export interface WorstSpanRecord {
  /** Span index along the route and its horizontal length, m. */
  span: number; lengthM: number;
  /** Dominant tile kind under the span ('river', 'road', ...). */
  over: string;
  /** Sag and horizontal tension at the design temperature (m, N), conductor weight (N/m), lowest clearance (m) and the rule (m). */
  sagM: number; hN: number; wNPerM: number; clearanceM: number; requiredM: number;
}
/** A line built by `buildRoute`: the request that made it (re-planned by queries), its worst margin and the build cost. */
export interface RouteRecord {
  branchId: string;
  request: RouteRequestRecord;
  /** Smallest clearance margin over all spans at the design temperature (m; negative = a violation) and the spans with a negative margin. */
  worstMarginM: number;
  badSpans: number[];
  lengthM: number;
  cost: number;
  /** Number of supports on the route and the worst span (not in the original brief: the verdict and the lesson read them without re-planning). */
  supports: number;
  worst: WorstSpanRecord;
  /** The longest span of the line (usually the river crossing: the sag lesson). Absent in states saved before it existed. */
  longest?: WorstSpanRecord;
  /** Supports short of the creepage their tile needs and the worst of them (only when there are any), and the thinnest creepage (mm) of a support within 6 tiles of the sea (only when one is). */
  saltShort?: number[]; saltWorst?: SaltSupportRecord; coastMinCreepageMm?: number;
  /** The most exposed support within 6 tiles of the sea (highest creepage need, then thinnest creepage, then nearest the surf): the one the L29 lesson quotes. */
  coastWorst?: SaltSupportRecord;
}

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
  rules: Rules;
  block: BlockSummary;
  /** Successful player actions of this game (newest last, capped). */
  actionLog: LoggedAction[];
  coach: Coach;
  /** Concept ids unlocked in this level state (campaign-wide unlocks live in the profile save). */
  codexUnlocked: string[];
  stars: 0 | 1 | 2 | 3;
  /** The bench circuit of a bench level; null on grid levels and in free play. */
  bench: BenchState | null;
  /** Id of the terrain map the level stands on ('mainland'); the map data stays in code (src/level/maps), never in the state. null: no terrain. */
  terrain: string | null;
  /** Lines built with `buildRoute`, in build order. */
  routes: RouteRecord[];
  /** Chapter 4 (absent elsewhere, so other levels' states and goldens stay as they were): the circuit of L10-L13 as the player built it (src/sim/ch4). */
  ch4?: import('./sim/ch4/state').Ch4State | null;
  /** Chapter 7 (absent elsewhere, so other levels' states and goldens stay as they were): the player's design of L23-L27 (src/sim/ch7); every result is recomputed from it. */
  ch7?: import('./sim/ch7/state').Ch7State | null;
  /** Submarine cables laid with `layCableRoute` (L30), in build order; absent until the first one (old states and goldens stay as they were). */
  cables?: SeaCableRecord[];
  /** What the player paid for each transformer, shunt bank and battery placed this level (id -> price), so demolishing it refunds that price; absent until the first purchase (old states and goldens stay as they were). Pre-placed district gear has no entry and refunds nothing. */
  purchases?: Record<string, number>;
}

/** A laid submarine cable: its branch, price (refunded when it is demolished), and what it was made of. */
export interface SeaCableRecord { branchId: string; cableId: string; lengthKm: number; cost: number; chargingKvar: number }
