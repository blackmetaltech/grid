// Typical distribution data for the chapter 8 engine. Every row has a `source` string; `recall: true` means the numbers come from the
// author's memory of typical values, NOT checked against a datasheet or standard text (to be verified before any "real" claim).

export interface Sourced { source: string; recall: boolean }

/** ACSR overhead conductors, 11 kV class. R at 20 C, X at typical 11 kV flat/delta spacing; ampacity in still air, 45 C ambient. */
export interface ConductorRow extends Sourced { id: string; mm2: number; rOhmKm: number; xOhmKm: number; ampacityA: number; costPerKm: number }
export const CONDUCTORS: ConductorRow[] = [
  { id: 'Weasel', mm2: 30, rOhmKm: 0.929, xOhmKm: 0.40, ampacityA: 130, costPerKm: 1, source: 'Indian ACSR designations (IS 398 pt 2) typical values', recall: true },
  { id: 'Rabbit', mm2: 50, rOhmKm: 0.552, xOhmKm: 0.39, ampacityA: 190, costPerKm: 1.4, source: 'Indian ACSR designations (IS 398 pt 2) typical values', recall: true },
  { id: 'Dog', mm2: 100, rOhmKm: 0.279, xOhmKm: 0.37, ampacityA: 300, costPerKm: 2.1, source: 'Indian ACSR designations (IS 398 pt 2) typical values', recall: true },
  { id: 'Hyena', mm2: 150, rOhmKm: 0.187, xOhmKm: 0.36, ampacityA: 380, costPerKm: 2.9, source: 'Indian ACSR designations (IS 398 pt 2) typical values', recall: true },
];

/** 11 kV underground cable (three single-core aluminium XLPE in trefoil, direct buried), for Career cable feeders. Cost in the same
 * relative units as the overhead rows: a buried cable costs several times an overhead line per km (trenching, reinstatement). */
export const CABLES_11KV: ConductorRow[] = [
  { id: '70 Al XLPE', mm2: 70, rOhmKm: 0.443, xOhmKm: 0.12, ampacityA: 190, costPerKm: 3.5, source: 'IEC 60502-2 11 kV Al XLPE single-core trefoil, buried, 20 C ground (typical datasheet values)', recall: true },
  { id: '95 Al XLPE', mm2: 95, rOhmKm: 0.320, xOhmKm: 0.11, ampacityA: 225, costPerKm: 4.2, source: 'IEC 60502-2 11 kV Al XLPE single-core trefoil, buried, 20 C ground (typical datasheet values)', recall: true },
  { id: '185 Al XLPE', mm2: 185, rOhmKm: 0.164, xOhmKm: 0.10, ampacityA: 330, costPerKm: 5.4, source: 'IEC 60502-2 11 kV Al XLPE single-core trefoil, buried, 20 C ground (typical datasheet values)', recall: true },
  { id: '300 Al XLPE', mm2: 300, rOhmKm: 0.100, xOhmKm: 0.095, ampacityA: 430, costPerKm: 6.6, source: 'IEC 60502-2 11 kV Al XLPE single-core trefoil, buried, 20 C ground (typical datasheet values)', recall: true },
];
/** The cable a Career cable feeder lays where the overhead pattern names a conductor (the same step in the size ladder). */
export const CABLE_FOR: Record<string, string> = { Weasel: '70 Al XLPE', Rabbit: '95 Al XLPE', Dog: '185 Al XLPE', Hyena: '300 Al XLPE' };

/** Reliability parameters (Billinton and Allan style typical ranges). */
export interface RelRow extends Sourced { id: string; lambdaPerKmYr: number; repairH: number }
export const RELIABILITY_DATA: RelRow[] = [
  { id: 'overhead-11kV', lambdaPerKmYr: 0.15, repairH: 4, source: 'typical 11 kV overhead 0.1-0.2 faults/km/yr, repair 3-8 h (DESIGN-1.1 B2)', recall: true },
  { id: 'underground-11kV', lambdaPerKmYr: 0.05, repairH: 8, source: 'typical 11 kV cable 0.03-0.07 faults/km/yr (DESIGN-1.1 B2)', recall: true },
];
export const SWITCHING_H = { manual: 1, remote: 0.05, fuse: 1, tie: 0.25 };

/** IEEE C37.112 inverse-time constants: t = TD (A / (M^p - 1) + B), M = I / Ipickup. */
export interface IeeeCurveRow extends Sourced { id: 'MI' | 'VI' | 'EI'; A: number; B: number; p: number }
export const IEEE_CURVES: IeeeCurveRow[] = [
  { id: 'MI', A: 0.0104, B: 0.0226, p: 0.02, source: 'IEEE C37.112-2018 table (moderately inverse, US)', recall: true },
  { id: 'VI', A: 3.922, B: 0.0982, p: 2, source: 'IEEE C37.112-2018 table (very inverse, US)', recall: true },
  { id: 'EI', A: 5.64, B: 0.0243, p: 2, source: 'IEEE C37.112-2018 table (extremely inverse, US)', recall: true },
];

/** Fuse links, K speed ratio. Shapes are (multiple of rated current, seconds); amps = multiple x rating. Total clearing = melting time x clearMult + arc. */
export interface FuseShapeRow extends Sourced { type: 'K'; minMelt: [number, number][]; clearMult: number; arcS: number }
export const FUSE_SHAPE: FuseShapeRow = {
  type: 'K',
  minMelt: [[2.2, 300], [3, 60], [4, 14], [6, 2.6], [10, 0.5], [20, 0.15], [50, 0.05], [100, 0.025]],
  clearMult: 1.2, arcS: 0.01,
  source: 'shape approximating ANSI C37.42 K-link time-current curves (min melt at 300 s about 2.2 x rating)', recall: true,
};
export const FUSE_LINKS_K = [6, 10, 15, 25, 40, 65, 100];

/** Recloser curves: IEEE form with time dial; fast (curve A style) and slow (curve C style). */
export interface RecloserRow extends Sourced { id: string; curve: 'MI' | 'VI' | 'EI'; td: number; minTimeS: number }
export const RECLOSER_CURVES: RecloserRow[] = [
  { id: 'fast', curve: 'VI', td: 0.25, minTimeS: 0.03, source: 'time-dial scaled IEEE VI (modelled on recloser A curve)', recall: true },
  { id: 'slow', curve: 'VI', td: 3, minTimeS: 0.06, source: 'time-dial scaled IEEE VI (modelled on recloser C curve)', recall: true },
];

/** IEC 60076-7 ONAN parameters (clause 7.2 / 7.3, table of thermal characteristics; 2005 ed. table 2 and rated rises). */
export interface TxThermalRow extends Sourced {
  id: string; x: number; y: number; k11: number; k21: number; k22: number; tauOilMin: number; tauWindMin: number;
  dThetaOilR: number; hgr: number; R: number; hotSpotRefC: number;
}
export const TX_ONAN: TxThermalRow = {
  id: 'ONAN', x: 0.8, y: 1.3, k11: 0.5, k21: 2.0, k22: 2.0, tauOilMin: 210, tauWindMin: 10, dThetaOilR: 55, hgr: 23, R: 5, hotSpotRefC: 98,
  source: 'IEC 60076-7:2005 table 2 (ONAN), rated top-oil rise 55 K and Hgr 23 K for 78 K hot-spot rise; R = 5 typical', recall: true,
};
