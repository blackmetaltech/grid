// Levels. The real campaign (P0, L01…L28) is authored in M2; until then there is ONE placeholder so core's solvability,
// solution-code, verify and region tests stay meaningful.
import type { Level } from '@core/kit';
import type { GridState } from './types';
import { t } from './i18n';

/** Placeholder level: not idle-winnable (needs setSpeed), not a 2-move cheese (needs 8 blocks), solvable by its solver. */
const T00_BLOCKS = 8;

export const LEVELS: Level<GridState>[] = [
  // M2 replaces this: T00 is a placeholder until M2 authors P0/L01.
  {
    id: 'T00', title: t('level.T00.title'), brief: t('level.T00.brief'),
    setup: (s) => { s.clock.speed = 1; },
    goal: (s) => s.clock.day === 0 && s.clock.block === T00_BLOCKS && s.clock.speed === 4,
    fail: (s) => (s.clock.day > 0 || s.clock.block > T00_BLOCKS ? t('level.T00.late') : null),
    maxTicks: 12,
    // M2 replaces this solver together with the level.
    solver: () => (s) => (s.clock.speed !== 4 ? [{ name: 'setSpeed', args: [4] }] : []),
  },
];
