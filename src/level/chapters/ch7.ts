// Chapter 7 levels in campaign order, owned by the chapter-7 builder (one file per chapter so parallel builders never edit index.ts).
import type { GridLevelSpec } from '../spec';
import { L23 } from '../levels/l23';
import { L24 } from '../levels/l24';
import { L25 } from '../levels/l25';
import { L26 } from '../levels/l26';
import { L27 } from '../levels/l27';

export const CH7: GridLevelSpec[] = [L23, L24, L25, L26, L27];
