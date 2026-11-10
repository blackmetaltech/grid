// L30 "Bring the Island Home" (DEPTH §4.5): 11 kV three-core XLPE armoured submarine cables, copper conductor, laid on the seabed (shared physics table; prices are per pack).
// R is the AC resistance at 90 C conductor temperature (DC resistance at 20 C x 1.275, armour and proximity effect rounded in), X the three-core reactance at 50 Hz, C the
// phase-to-earth capacitance per km of a 12/20 kV class screened cable (XLPE, eps_r about 2.5), ampacity is the continuous rating of an armoured cable in a seabed trench.
// `recall`: typical manufacturer-datasheet magnitudes from memory, no datasheet opened. The charging susceptance is NOT stored: it follows the pack's frequency, B = 2 pi f C.
import { weakest, type SourcedRow } from './types';

export interface SubmarineCable extends SourcedRow {
  kv: number; mm2: number;
  /** Ohm per km at 90 C (positive sequence), ohm per km at 50 Hz, capacitance uF per km, continuous rating A. */
  rOhmKm: number; xOhmKm: number; cUfKm: number; ampacityA: number;
}
const SRC = 'typical 12/20 kV three-core XLPE armoured submarine cable catalogue magnitudes, recalled (no datasheet opened); R = R20 x 1.275 for 90 C';
const c = (mm2: number, rOhmKm: number, xOhmKm: number, cUfKm: number, ampacityA: number): SubmarineCable =>
  ({ id: `sub-11-${mm2}`, kv: 11, mm2, rOhmKm, xOhmKm, cUfKm, ampacityA, source: SRC, confidence: weakest('recall') });

export const SUBMARINE_CABLES: SubmarineCable[] = [
  c(70, 0.32, 0.120, 0.25, 215),
  c(120, 0.19, 0.112, 0.30, 290),
  c(185, 0.12, 0.105, 0.35, 365),
];
export const submarineCable = (id: string): SubmarineCable | undefined => SUBMARINE_CABLES.find((x) => x.id === id);
/** Charging reactive power of a cable of `km` at `kv` and `f0` Hz (kvar): Q = V^2 w C l. */
export const chargingKvar = (cUfKm: number, km: number, kv: number, f0: number): number => (kv * 1000) * (kv * 1000) * 2 * Math.PI * f0 * cUfKm * 1e-6 * km / 1000;
