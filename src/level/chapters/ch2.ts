// Chapter 2 levels owned by the chapter-2 builder (L04 before L05, L06 after it). L05/L29/L30 stay in ../levels and index.ts.
import type { GridLevelSpec } from '../spec';
import { L04 } from '../levels/l04';
import { L06 } from '../levels/l06';

export const CH2_BEFORE_L05: GridLevelSpec[] = [L04];
export const CH2_AFTER_L05: GridLevelSpec[] = [L06];
