// Chapter 4 levels in campaign order, owned by the chapter-4 builder (one file per chapter so parallel builders never edit index.ts).
import type { GridLevelSpec } from '../spec';
import { L10 } from '../levels/l10';
import { L11 } from '../levels/l11';
import { L12 } from '../levels/l12';
import { L13 } from '../levels/l13';

export const CH4: GridLevelSpec[] = [L10, L11, L12, L13];
