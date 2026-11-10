// Chapter 4 level state, carried in `state.ch4` (absent in every other level, so their states and goldens do not change). Plain data: derived numbers
// (currents, voltages, power factor, angles) are recomputed from it, never stored, except what a block must remember (worst values, the swing).
import type { Phase, Starter } from './data';
import type { Bank } from './pfc';

export type Ch4Scenario = 'l10' | 'l11' | 'l12' | 'l13';
export interface Ch4Fail { key: string; params: Record<string, string | number>; /** the loss is final this block (a burnt neutral, a burst can, the pump's start, the swing) */ now: boolean }
export interface SwingRecord { stable: boolean; noEquilibrium: boolean; peakDeltaDeg: number; deltaUDeg: number; tLossS: number | null; trace: { tS: number[]; deltaDeg: number[] } }

export interface Ch4State {
  scenario: Ch4Scenario;
  /** Pack currency per USD for the game prices of this chapter (the pack's bench cable price over its USD price). */
  priceFactor: number;
  /** Pass limits resolved from the level and the region at setup. */
  limits: Record<string, number>;
  /** Blocks the circuit has been failing a pass condition (the grace is an hour: the player sees the dim, buzzing street before the report). */
  badBlocks: number;
  /** Why the circuit is failing now (null: all conditions hold). */
  fail: Ch4Fail | null;
  l10?: { phase: Phase[]; neutralMm2: number };
  l11?: { bank: Bank | null; starter: Starter; pumpBlock: number; started: boolean };
  l12?: { vref: number; seriesPct: number; third: boolean; reduceMW: number; eventBlock: number; fired: boolean; swing: SwingRecord | null };
  l13?: { excitation: number | null };
}
