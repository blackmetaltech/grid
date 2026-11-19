// Chapter 8 level state, carried in `state.ch8` (absent in every other level, so their states and goldens do not change). It holds ONLY the player's design:
// every result (voltages, SAIDI, margins, hot-spots, hosting) is recomputed from it by the studies in this folder, never stored.
import type { Ch8Id } from './data';
export type { Ch8Id };

export interface FeederDesign {
  /** Conductor of each trunk section (by node order): Weasel, Rabbit, Dog or Hyena. */
  cond: string[];
  /** Off-load tap of each distribution transformer, percent (-5 .. 5 in 2.5 steps; positive raises the customer voltage). */
  tap: number[];
  /** A step voltage regulator in the trunk section that feeds node index `at` (0-based), regulating to vSetPu; null = none. */
  reg: { at: number; vSetPu: number } | null;
}
export type SwitchKind = 'none' | 'manual' | 'remote';
export interface L32Design { sect: Record<string, SwitchKind>; fuse: Record<string, boolean>; tie: boolean }
export interface L33Design { pickupA: number; fastTd: number; slowTd: number; fastShots: number; fuse: Record<string, number> }
export type TieKind = 'none' | 'manual' | 'remote';
export type DrKind = 'none' | 'small' | 'large';
export interface L34Design { sizeMva: number; third: boolean; bus: 'manual' | 'auto'; tie: TieKind; dr: DrKind }
export interface L35Design { feeder: FeederDesign; pvLimitKw: number; oltcSetPu: number; ldc: boolean; voltVar: boolean }
export interface L36Design { why: string | null }

export interface Ch8State {
  id: Ch8Id;
  /** Pack currency per US$ (the game prices of this chapter are US$; a region scales them). */
  money: number;
  /** The pack's high edge of the customer band, pu (global 1.10, in 1.06): the studies read it, they never look at a pack themselves. */
  vHiPu: number;
  l31?: FeederDesign; l32?: L32Design; l33?: L33Design; l34?: L34Design; l35?: L35Design; l36?: L36Design;
}
