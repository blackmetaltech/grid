// Game state for the sample game: one open tank filled through a valve and drained through an orifice at its base.
// Replace this with your game's state. Plain JSON only (no classes, Maps or functions): it is cloned, hashed and saved.
import type { BaseState } from '@core/kit';

export interface TankState extends BaseState {
  /** Water depth above the orifice, m. */
  h: number;
  /** Valve opening, 0..1 (fraction of the supply's maximum flow). */
  valve: number;
  /** Ticks in a row with the depth inside the target band. */
  held: number;
  /** Target band for the depth, m, and how many ticks it must be held. */
  band: [number, number];
  holdTicks: number;
  /** Depth history, one entry per tick (last 120). */
  history: number[];
  overflows: number;
  /** Supply water used since the game or level started, m³ (a level metric). */
  waterUsedM3: number;
  /** Regional flavour from the region pack, copied at the start so later log lines need no lookup. */
  site: string;
  operator: string;
}

/** Physical constants of the rig. Every number has a unit and a source. */
export const RIG = {
  /** Standard gravity, m/s² (CODATA). */
  g: 9.80665,
  /** Discharge coefficient of a sharp-edged orifice (typ. 0.60–0.62; e.g. White, Fluid Mechanics, §6.12). */
  Cd: 0.61,
  /** Orifice area, m² (≈ 50 mm diameter). */
  a: 0.002,
  /** Tank cross-section, m². */
  A: 0.5,
  /** Tank wall height, m: above this it overflows. */
  H: 2.0,
  /** Supply flow with the valve fully open, m³/s. */
  qMax: 0.009,
  /** Simulated seconds per tick. */
  dt: 10,
} as const;
