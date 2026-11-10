// The authored GRID levels (M2): the campaign specs and their core `Level`s.
import type { Level } from '@core/kit';
import type { GridState } from '../types';
import { makeLevel, type GridLevelSpec } from './spec';
import { P0 } from './levels/p0';
import { L01 } from './levels/l01';
import { L02 } from './levels/l02';
import { L03 } from './levels/l03';
import { L05 } from './levels/l05';
import { L07 } from './levels/l07';

/** In campaign order. */
export const LEVEL_SPECS: GridLevelSpec[] = [P0, L01, L02, L03, L05, L07];
export const specOf = (id: string): GridLevelSpec | undefined => LEVEL_SPECS.find((l) => l.id === id);
export const CAMPAIGN_LEVELS: Level<GridState>[] = LEVEL_SPECS.map(makeLevel);
