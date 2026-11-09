// The game's region registry. `global` ships; `in` is a draft that exercises the seam (regions.test.ts runs the whole game in
// every registered pack, drafts included, and checks that no regional token leaks across packs).
//
// Add a region:
//   1. src/regions/<id>/index.ts: `export const XX = defineRegion<GridRegionData>({...}, validateGridData)` (copy `in/`)
//   2. register it below and add its pin to pins.ts (regions.test.ts prints the line to paste).
//   3. run `pnpm test`: solvability, leak, schema, release-gate and ruleset-pin tests cover the new pack automatically.
// Bump a pack's `rulesetVersion` whenever a data change can change a level score (it is part of every solution code).
import { RegionRegistry } from '@core/regions';
import { validateGridData, type GridRegionData } from './data';
import { GLOBAL } from './global';
import { IN } from './in';

export const REGIONS = new RegionRegistry<GridRegionData>({ validateData: validateGridData, defaultId: 'global' })
  .register(GLOBAL)
  .register(IN);
