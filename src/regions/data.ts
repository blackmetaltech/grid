// Game-specific regional parameters. Physics is region-independent: a pack may change prices, names, currency and standards,
// never the laws or constants of the rig (the `g` field exists so that tests can prove no pack tampers with it).
import { RIG } from '../state';

export interface TankRegionData {
  /** Standard gravity, m/s². Must equal RIG.g in every pack. */
  g: number;
  /** Price of supply water in the pack's currency per m³. */
  supplyPricePerM3: number;
}

export function validateTankData(d: TankRegionData): string[] {
  const e: string[] = [];
  if (!d || typeof d !== 'object') return ['must be an object'];
  if (d.g !== RIG.g) e.push(`g must be ${RIG.g} (physics does not depend on the region; got ${String(d.g)})`);
  if (typeof d.supplyPricePerM3 !== 'number' || !Number.isFinite(d.supplyPricePerM3) || d.supplyPricePerM3 <= 0) e.push('supplyPricePerM3 must be a positive number');
  return e;
}
