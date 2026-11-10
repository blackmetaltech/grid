// Textbook closed forms (per-unit bases, 3-phase delta load, PF correction, SIL, I^2R loss, round-rotor generator phasor).
// Used by the PS-01..05/09/10/27/28 oracle tests and available to Codex labs.
import { dmath as dm, cx, add, mul, abs, arg, type Complex } from '@core/numerics';

const S3 = Math.sqrt(3);

/** Base impedance (ohm) = kV^2 / MVA; base current (A) = MVA / (sqrt3 kV). */
export const zBaseOhm = (sBaseMVA: number, kVLL: number): number => (kVLL * kVLL) / sBaseMVA;
export const iBaseA = (sBaseMVA: number, kVLL: number): number => (sBaseMVA * 1e3) / (S3 * kVLL);

/** Balanced delta load: line-to-line V, per-phase Z = |Z| angle phi. */
export function deltaLoad(vLL: number, zOhm: number, phiDeg: number): { Iph: number; IL: number; P_kW: number; Q_kvar: number } {
  const Iph = vLL / zOhm;
  const phi = (phiDeg * Math.PI) / 180;
  return { Iph, IL: S3 * Iph, P_kW: (3 * Iph * Iph * zOhm * dm.cos(phi)) / 1e3, Q_kvar: (3 * Iph * Iph * zOhm * dm.sin(phi)) / 1e3 };
}

/** Capacitor bank raising pf1 -> pf2 at P kW, V line-to-line, f Hz. CY: per phase (star); CD = CY/3 per phase (delta), in F. */
export function pfCapacitor(pKW: number, v: number, fHz: number, pf1: number, pf2: number): { Qc_kvar: number; CY: number; CD: number } {
  const Qc = pKW * 1e3 * (dm.tan(dm.acos(pf1)) - dm.tan(dm.acos(pf2)));
  const CY = Qc / (2 * Math.PI * fHz * v * v);
  return { Qc_kvar: Qc / 1e3, CY, CD: CY / 3 };
}

/** Lossless-line surge impedance sqrt(L/C) (ohm) and SIL = kV^2 / Zc (MW). */
export const surgeImpedance = (LH: number, CF: number): number => Math.sqrt(LH / CF);
export const silMW = (kVLL: number, zc: number): number => (kVLL * kVLL) / zc;

/** Three-phase I^2R loss for P MW at unity-ish pf: returns line current (A) and loss (MW). */
export function lineLoss(pMW: number, kVLL: number, rOhmPhase: number, pf = 1): { I: number; lossMW: number } {
  const I = (pMW * 1e3) / (S3 * kVLL * pf);
  return { I, lossMW: (3 * I * I * rOhmPhase) / 1e6 };
}

/** Round-rotor generator at terminal V, current magnitude I, lagging pf: E = V + jXs I. */
export function excitationEmf(vt: number, i: number, xs: number, pf: number): { E: Complex; Emag: number; deltaDeg: number } {
  const I = cx(i * pf, -i * Math.sqrt(1 - pf * pf));
  const E = add(cx(vt, 0), mul(cx(0, xs), I));
  return { E, Emag: abs(E), deltaDeg: (arg(E) * 180) / Math.PI };
}

/** Power-angle: P = E V sin(delta) / X. */
export const powerAngle = (E: number, V: number, X: number, deltaDeg: number): number => ((E * V) / X) * dm.sin((deltaDeg * Math.PI) / 180);
