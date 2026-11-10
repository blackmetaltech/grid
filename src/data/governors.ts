// DESIGN §4.1 governor constants (S25/S26) and sub-transient / transient reactances on own MVA base. Kundur-typical / textbook-typical,
// `recall` (oracles PS-17/18 use their own stated values). Deadband, activation time and droop range are pack grid-code values.
import type { SourcedRow } from './types';

export interface GovernorRow extends SourcedRow {
  /** governor time constant, s */ tG: number | null; /** reheater time constant (steam), s */ tRH: number | null; /** HP-turbine fraction (steam) */ fHP: number | null;
  /** water-starting time (hydro), s */ tW: number | null;
  xdpp: number; xdp: number; /** X2 = X''d */ x2: number; x0: number;
}
const GOV = 'DESIGN §4.1 governor data (Kundur-typical, recall)';
const XD = 'DESIGN §4.1 sub-transient/transient reactances (textbook-typical, recall; X2 = X\'\'d, X0 = 0.08)';
export const GOVERNORS: GovernorRow[] = [
  { id: 'steam', tG: 0.2, tRH: 7, fHP: 0.3, tW: null, xdpp: 0.20, xdp: 0.30, x2: 0.20, x0: 0.08, source: `${GOV}; ${XD}`, confidence: 'recall' },
  { id: 'hydro', tG: 0.5, tRH: null, fHP: null, tW: 1.5, xdpp: 0.25, xdp: 0.35, x2: 0.25, x0: 0.08, source: `${GOV}; ${XD}`, confidence: 'recall' },
  { id: 'gas', tG: 0.5, tRH: null, fHP: null, tW: null, xdpp: 0.15, xdp: 0.25, x2: 0.15, x0: 0.08, source: `${GOV}; ${XD}`, confidence: 'recall' },
  { id: 'diesel', tG: null, tRH: null, fHP: null, tW: null, xdpp: 0.15, xdp: 0.25, x2: 0.15, x0: 0.08, source: XD, confidence: 'recall', note: 'DESIGN prints no governor time constants for diesel' },
];
