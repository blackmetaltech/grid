// Plain JSON-able network description used by the pure sim modules. Everything is per-unit on S_BASE_MVA unless a
// name says otherwise (kV, MW, MVA, km, ohm). No module here imports the engine, game state or a region pack.

/** Three-phase MVA base of the whole grid (DESIGN 3.2). */
export const S_BASE_MVA = 100;

/** Branches with |z| below this (pu) are merged into one bus before Y_bus is built (DESIGN 3.14 rule 1). */
export const TIE_Z_PU = 1e-6;

/** Teaching message as data: the UI/locale layer turns `key` + `params` into words (keys are listed in the lane report). */
export interface Msg { key: string; params?: Record<string, string | number> }

export interface NetBus {
  id: string;
  /** Nominal line-to-line kV of the zone (only used to convert currents to kA). */
  kV: number;
}

/** Line or transformer: unified pi model (DESIGN 3.3). HV/"from" side carries the tap. */
export interface NetBranch {
  id: string;
  from: string;
  to: string;
  /** Series resistance and reactance (pu). */
  r: number;
  x: number;
  /** Total shunt susceptance (charging, pu) and total shunt conductance (pu); half at each end. */
  bc: number;
  gc?: number;
  /** Off-nominal tap ratio magnitude on the from side (default 1). tau = 1 - 0.0125 n for tap position n. */
  tau?: number;
  /** Continuous rating (MVA); 0/undefined = unrated (loading reports 0). */
  rateMVA?: number;
  inService: boolean;
}

/** Fixed shunt at a bus: Y = g + jb (pu at 1 pu volts); capacitor b > 0, reactor b < 0. Delivered Q = b |V|^2. */
export interface NetShunt {
  id: string;
  bus: string;
  g?: number;
  b: number;
  inService: boolean;
}

/** Load at a bus: P = p (aZ V^2 + aI V + aP), Q likewise (pu, positive = consumption). Default constant power. */
export interface NetLoad {
  id: string;
  bus: string;
  p: number;
  q: number;
  /** ZIP shares [aZ, aI, aP], default [0, 0, 1]. */
  zip?: [number, number, number];
}

export type UnitKind = 'sync' | 'bess-gfm' | 'inverter' | 'statcom' | 'svc';

/**
 * A source or compensator at a bus.
 *  - sync / bess-gfm: P fixed (p), voltage set-point vSet, Q within [qMin, qMax]; can be an island's slack (formers).
 *  - inverter (grid-following): injects p and fixed q; with vSet it regulates voltage within [qMin, qMax]; never a former.
 *  - statcom: regulates vSet within +-iMax*|V|; at its limit Q = +-iMax |V| (constant current).
 *  - svc: regulates vSet within susceptance [bMin, bMax]; at its limit Q = b |V|^2 (fixed susceptance).
 */
export interface NetUnit {
  id: string;
  bus: string;
  kind: UnitKind;
  online: boolean;
  /** Scheduled active power (pu, generation positive). */
  p?: number;
  pMax?: number;
  vSet?: number;
  qMin?: number;
  qMax?: number;
  /** Fixed reactive output of an unregulated inverter (pu). */
  q?: number;
  iMax?: number;
  bMin?: number;
  bMax?: number;
}

export interface Net {
  buses: NetBus[];
  branches: NetBranch[];
  shunts: NetShunt[];
  loads: NetLoad[];
  units: NetUnit[];
}

/** Deterministic id order (code-unit compare, never locale). */
export const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** True for units that can hold an island's voltage and frequency. */
export const isFormer = (u: NetUnit): boolean => u.online && (u.kind === 'sync' || u.kind === 'bess-gfm');

export function emptyNet(): Net {
  return { buses: [], branches: [], shunts: [], loads: [], units: [] };
}
