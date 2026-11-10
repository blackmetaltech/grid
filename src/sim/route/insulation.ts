// Insulation sizing by specific creepage (DEPTH §4.4). IEC 60815 (1986) classes; Um per IEC 60038.
import type { PollutionClass } from './types';

export const SPECIFIC_CREEPAGE: Record<PollutionClass, number> = { 1: 16, 2: 20, 3: 25, 4: 31 };
export const PIN_CREEPAGE_MM = 320, DISC_CREEPAGE_MM = 295, FOG_DISC_CREEPAGE_MM = 430;

/** Highest system voltage Um (kV) for a nominal kV. */
export function umKv(kvNom: number): number {
  return kvNom === 11 ? 12 : kvNom === 33 ? 36 : kvNom === 66 ? 72.5 : kvNom === 132 ? 145 : kvNom * 1.1;
}
export const requiredCreepageMm = (kvNom: number, cls: PollutionClass): number => umKv(kvNom) * SPECIFIC_CREEPAGE[cls];
/** Units of `unitCreepageMm` needed (>= 1 when anything is required). */
export function insulatorUnits(kvNom: number, cls: PollutionClass, unitCreepageMm: number): number {
  return Math.ceil(requiredCreepageMm(kvNom, cls) / unitCreepageMm - 1e-9);
}

/** Insulator-table lookup shared by the planner and the pricing: the fallback string is the plain pin insulator. */
export const PIN_ID = 'pin';
