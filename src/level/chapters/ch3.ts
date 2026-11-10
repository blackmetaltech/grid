// Chapter 3 levels in campaign order, owned by the chapter-3 builder (one file per chapter so parallel builders never edit index.ts).
import type { GridLevelSpec } from '../spec';
import { L07 } from '../levels/l07';
import { L08 } from '../levels/l08';
import { L09 } from '../levels/l09';

export const CH3: GridLevelSpec[] = [L07, L08, L09];
