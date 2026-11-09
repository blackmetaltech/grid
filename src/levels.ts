// Levels: a setup, a goal, a failure rule and a solver bot that proves the level can be passed.
import type { Level } from '@core/kit';
import { RIG, type TankState } from './state';
import { valveFor } from './sim/hydraulics';
import { t } from './i18n';

/** Expert: fill at full flow until near the band, then set the exact valve that balances Torricelli outflow at mid-band. */
const expert = () => (s: Readonly<TankState>) => {
  const mid = (s.band[0] + s.band[1]) / 2;
  const want = s.h < mid - 0.05 ? 100 : Math.round(valveFor(mid) * 1000) / 10;
  return Math.abs(want - s.valve * 100) > 0.05 ? [{ name: 'setValve', args: [want] }] : [];
};

export const LEVELS: Level<TankState>[] = [
  {
    id: 'steady', title: t('level.steady.title'), concepts: ['torricelli', 'mass-balance'],
    brief: t('level.steady.brief'),
    setup: (s) => { s.band = [1.0, 1.2]; s.holdTicks = 10; s.valve = 0; },
    goal: (s) => s.held >= s.holdTicks,
    fail: (s) => (s.h >= RIG.H ? t('level.steady.overflow') : null),
    maxTicks: 120,
    solver: expert,
  },
];
