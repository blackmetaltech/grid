// Levels: the placeholder T00 plus the authored campaign (src/level: P0, L01, L02, L03, L07 in M2; the rest in M3).
import type { Level } from '@core/kit';
import type { GridState } from './types';
import { t } from './i18n';
import { CAMPAIGN_LEVELS } from './level';

/** Placeholder level: not idle-winnable (needs setSpeed), not a 2-move cheese (needs 8 blocks), solvable by its solver. */
const T00_BLOCKS = 8;

export const LEVELS: Level<GridState>[] = [
  // T00 stays as the clock-speed fixture (a dev level, not in the campaign); the authored campaign follows.
  {
    id: 'T00', title: t('level.T00.title'), brief: t('level.T00.brief'),
    setup: (s) => { s.clock.speed = 1; },
    goal: (s) => s.clock.day === 0 && s.clock.block === T00_BLOCKS && s.clock.speed === 4,
    fail: (s) => (s.clock.day > 0 || s.clock.block > T00_BLOCKS ? t('level.T00.late') : null),
    maxTicks: 12,
    // M2 replaces this solver together with the level.
    solver: () => (s) => (s.clock.speed !== 4 ? [{ name: 'setSpeed', args: [4] }] : []),
  },
  ...CAMPAIGN_LEVELS,
];
