// The authored GRID levels (M2): the campaign specs and their core `Level`s.
import type { Level } from '@core/kit';
import type { GridState } from '../types';
import { makeLevel, type GridLevelSpec } from './spec';
import { P0 } from './levels/p0';
import { L01 } from './levels/l01';
import { L02 } from './levels/l02';
import { L03 } from './levels/l03';
import { L05 } from './levels/l05';
import { L29 } from './levels/l29';
import { L30 } from './levels/l30';
import { CH2_BEFORE_L05, CH2_AFTER_L05 } from './chapters/ch2';
import { CH3 } from './chapters/ch3';
import { CH4 } from './chapters/ch4';
import { CH5 } from './chapters/ch5';
import { CH6 } from './chapters/ch6';
import { CH7 } from './chapters/ch7';
import { CH8 } from './chapters/ch8';
import { CHF } from './chapters/chf';

/** In campaign order. */
export const LEVEL_SPECS: GridLevelSpec[] = [P0, L01, L02, L03, ...CH2_BEFORE_L05, L05, ...CH2_AFTER_L05, L29, L30, ...CH3, ...CH4, ...CH5, ...CH6, ...CH7, ...CH8, ...CHF];
export const specOf = (id: string): GridLevelSpec | undefined => LEVEL_SPECS.find((l) => l.id === id);
export const CAMPAIGN_LEVELS: Level<GridState>[] = LEVEL_SPECS.map(makeLevel);
