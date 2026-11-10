// Running a design on the real engine (tests, the bot-population stub, the searcher): reset the level in a region, apply the actions,
// tick until the level resolves. Not imported by game.ts (it imports the game).
import { Env, TICK, type Action } from '@core/kit';
import { GAME } from '../game';
import type { GridState } from '../types';
import { makeLevel, type Frozen, type GridLevelSpec } from './spec';

export type FailKind = 'share' | 'nadir' | 'rocof' | 'freqBand' | 'brownout' | 'overvoltage' | 'collapse' | 'overload' | 'blackout' | 'budget' | 'timeout' | 'flashover' | 'saltFlashover' | 'islandDark' | 'machine' | 'capFuse' | 'thd' | 'pfPeak' | 'breakerFail';

export interface Outcome {
  status: 'won' | 'lost' | 'playing';
  reason: string;
  stars: number;
  /** Blocks played until the verdict. */
  ticks: number;
  /** Build cost (pack currency). */
  capex: number;
  track: Record<string, number>;
  ensMWh: number;
  failKind: FailKind | null;
  /** The first rejected action (message), or null. */
  rejected: string | null;
  state: GridState;
}

/** Why a lost level was lost, as a kind a test can name (DESIGN 9.4). */
export function failKindOf(s: Readonly<GridState>): FailKind | null {
  if (s.status !== 'lost') return null;
  const key = s.block.verdictKey;
  if (s.block.verdict === 'playing' || key === null) return 'timeout';
  if (key === 'level.lost.poorSupply' || key === 'level.lost.poorSupplyAny' || key === 'level.lost.lossOver' || key === 'level.lost.unpowered') return 'brownout';
  if (key.startsWith('level.lost.machine') || key === 'level.lost.townLoss') return 'brownout';   // chapter 2's benches
  if (key === 'level.lost.townOverload') return 'overload';
  if (key === 'level.lost.budget') return 'budget';
  if (key === 'level.lost.nadir') return 'nadir';
  if (key === 'level.lost.share') return 'share';
  if (key === 'level.lost.rocof') return 'rocof';
  if (key === 'level.lost.freqBand' || key === 'level.lost.inRange') return 'freqBand';
  if (key === 'level.lost.flashover') return 'flashover';
  if (key.startsWith('level.lost.b4.')) return 'machine';   // chapter 4's benches (L10-L13)
  if (key === 'level.lost.capFuse') return 'capFuse';
  if (key === 'level.lost.thd') return 'thd';
  if (key === 'level.lost.farVoltage') return 'brownout';
  if (key === 'level.lost.pfPeak') return 'pfPeak';
  if (key === 'level.lost.breakerFail') return 'breakerFail';
  if (key === 'level.lost.saltFlashover') return 'saltFlashover';
  if (key.startsWith('level.lost.island')) return 'islandDark';
  return (s.metrics.track.overloadTrips ?? 0) > 0 || s.events.log.some((e) => e.causeKey === 'cascade.overload-trip') ? 'overload' : 'blackout';
}

/** Play `actions` on `spec` in `region` (seed 1, learner mode unless given). `frozen` overrides the spec's targets (null: no budget, one star). */
export function runDesign(spec: GridLevelSpec, region: string, actions: Action[], o: { frozen?: Frozen | null; seed?: number; mode?: string; ticks?: number } = {}): Outcome {
  const use = o.frozen !== undefined ? { ...spec, frozen: o.frozen === null ? Object.fromEntries(['global', 'in'].map((r) => [r, { budget: 0, starA: 0, starB: 0 }])) : { [region]: o.frozen } } : spec;
  const level = makeLevel(use);
  const env = new Env({ ...GAME, levels: [level] });
  env.reset({ seed: o.seed ?? 1, level: spec.id, region, ...(o.mode ? { mode: o.mode } : {}) });
  let rejected: string | null = null;
  for (const a of actions) { const r = env.step(a); if (!r.info.ok) { rejected = r.info.message; break; } }
  const cap = o.ticks ?? spec.maxTicks + 2;
  for (let i = 0; i < cap && env.state.status === 'playing'; i++) env.step(TICK);
  const s = structuredClone(env.state) as GridState;
  return {
    status: s.status as Outcome['status'], reason: s.statusReason, stars: s.status === 'won' ? s.stars : 0, ticks: s.tick - s.levelStart, capex: s.budget.spent,
    track: { ...s.metrics.track }, ensMWh: s.metrics.ensMWh, failKind: failKindOf(s), rejected, state: s,
  };
}
