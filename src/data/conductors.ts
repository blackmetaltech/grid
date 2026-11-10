// DESIGN §4.2 conductors and cables (physics data shared by all packs). ACSR per [APAR] BS 215 Part 2 unless noted; R is DC at
// 20 C; ampacity at 75 / 85 C conductor, 45 C ambient, 0.56 m/s wind, 1045 W/m2 sun. Copper per IEC 60228 class 2.
import { weakest, type Confidence, type SourcedRow } from './types';

export interface AcsrRow extends SourcedRow {
  stranding: string; alMm2: number; totalMm2: number; diaMm: number; r20OhmPerKm: number;
  amp75: number; /** null where DESIGN prints a single value */ amp85: number | null; kgPerKm: number;
  /** 'bs215' ratings are comparable; 'us' (Drake, 907 A) is a US rating basis and is not */ ampBasis: 'bs215' | 'us';
  /** IS 398 Part II alternative row (printed in Appendix A.3 for the `in` pack) */ is398?: { r20OhmPerKm: number; amp75: number; amp85: number };
}
const APAR = 'Apar ACSR datasheet (BS 215 Part 2 table), https://apar.com/wp-content/uploads/2021/02/1.-ACSR.pdf; DESIGN §4.2';
const acsr = (id: string, stranding: string, alMm2: number, totalMm2: number, diaMm: number, r20OhmPerKm: number, amp75: number, amp85: number, kgPerKm: number, extra: Partial<AcsrRow> = {}): AcsrRow =>
  ({ id, stranding, alMm2, totalMm2, diaMm, r20OhmPerKm, amp75, amp85, kgPerKm, ampBasis: 'bs215', source: APAR, confidence: 'datasheet', ...extra });

export const ACSR: AcsrRow[] = [
  acsr('acsr-weasel', '6/2.59 + 1/2.59', 30, 36.88, 7.77, 0.9077, 115, 137, 128),
  acsr('acsr-rabbit', '6/3.35 + 1/3.35', 50, 61.70, 10.05, 0.5426, 156, 188, 214),
  acsr('acsr-dog', '6/4.72 + 7/1.57', 100, 118.5, 14.15, 0.2733, 234, 285, 394, { is398: { r20OhmPerKm: 0.2792, amp75: 231, amp85: 282 } }),
  acsr('acsr-wolf', '30/2.59 + 7/2.59', 150, 194.9, 18.13, 0.1828, 319, 393, 726),
  acsr('acsr-panther', '30/3.00 + 7/3.00', 200, 261.5, 21.00, 0.1363, 377, 470, 974, { is398: { r20OhmPerKm: 0.1390, amp75: 374, amp85: 465 } }),
  acsr('acsr-zebra', '54/3.18 + 7/3.18', 400, 484.5, 28.62, 0.0674, 551, 700, 1621, { is398: { r20OhmPerKm: 0.06868, amp75: 546, amp85: 693 } }),
  acsr('acsr-moose', '54/3.53 + 7/3.53', 520, 597.0, 31.77, 0.05595, 612, 783, 1998, { note: 'datasheet row matched by stranding; the code name is not printed -> confirm' }),
  {
    id: 'acsr-drake', stranding: '26/4.44 + 7/3.45 (795 kcmil)', alMm2: 403, totalMm2: 468, diaMm: 28.1, r20OhmPerKm: 0.0702, amp75: 907, amp85: null, kgPerKm: 1628, ampBasis: 'us',
    source: 'DC R: Southwire spec 80100, https://cabletechsupport.southwire.com/tile/23/spec/80100/?country=US; ampacity 907 A (US rating basis, not comparable; sandbox only); DESIGN §4.2',
    fieldConfidence: { r20OhmPerKm: 'datasheet', amp75: 'secondary' }, confidence: weakest('datasheet', 'secondary'),
    note: 'ampacity is on the US rating basis, not comparable with the BS 215 rows; the DESIGN row prints one value',
  },
];

export interface CopperRow extends SourcedRow { areaMm2: number; r20OhmPerKm: number; ampacityAirA: number }
const IEC = 'IEC 60228:2023 class-2 copper max R20 (DESIGN §4.2, `standard`); ampacity in air: game. The figures match the PVC, two-loaded-conductor, reference-method-C column of IEC 60364-5-52 (Table B.52-2 in the 2005 edition; the DESIGN label B.52-4 looks wrong) as commonly reproduced, but no copy of the table could be opened in M1.9';
const cu = (areaMm2: number, r20OhmPerKm: number, ampacityAirA: number): CopperRow => ({
  id: `cu-${areaMm2}`, areaMm2, r20OhmPerKm, ampacityAirA, source: IEC,
  fieldConfidence: { r20OhmPerKm: 'standard', ampacityAirA: 'game' }, confidence: weakest('standard', 'game'),
});
export const COPPER: CopperRow[] = [
  cu(2.5, 7.41, 27), cu(4, 4.61, 36), cu(6, 3.08, 46), cu(10, 1.83, 63), cu(16, 1.15, 85), cu(25, 0.727, 112), cu(35, 0.524, 138), cu(50, 0.387, 168),
];
export type { Confidence };

// DEPTH §4.1 mechanical columns: UTS/mass BS 215-2 (Lumino reprint, `datasheet`); E and alpha by stranding (WBSEDCL ACSR spec §6, `datasheet`);
// zebra E/alpha for 54/7 are `recall` (DEPTH §4.1, §10). kgPerKm/areaMm2/ampA(amp75)/diaMm come from the ACSR rows above.
import type { ConductorMech } from '../sim/route/types';
export type AcsrMech = ConductorMech & SourcedRow;
const MECH_SRC = 'BS 215-2 table (Lumino Industries reprint) UTS and mass; E/alpha by stranding from WBSEDCL ACSR spec §6; DEPTH §4.1, §10';
const mech = (id: string, utsKN: number, eGPa: number, alphaE6: number, conf: Confidence = 'datasheet', note?: string): AcsrMech => {
  const r = ACSR.find((a) => a.id === id)!;
  return {
    id, utsN: utsKN * 1000, kgPerKm: r.kgPerKm, areaMm2: r.totalMm2, eGPa, alphaPerC: alphaE6 * 1e-6, ampA: r.amp75, diaMm: r.diaMm,
    source: MECH_SRC, confidence: conf, ...(note ? { note } : {}),
  };
};
export const ACSR_MECH: AcsrMech[] = [
  mech('acsr-weasel', 11.5, 79, 19.1), mech('acsr-rabbit', 18.4, 79, 19.1), mech('acsr-dog', 32.7, 75, 19.8),
  mech('acsr-wolf', 69.2, 80, 17.8), mech('acsr-panther', 92.3, 80, 17.8),
  mech('acsr-zebra', 131.9, 69, 19.3, 'recall', 'E and alpha for 54/7 stranding are recall (DEPTH §4.1)'),
];
