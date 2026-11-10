// L11: a 400 V industrial estate at pf 0.70, a capacitor bank wired Y or delta, and a 75 kW pump started DOL, star-delta or soft (DESIGN 2.6 L11, oracle PS-05).
// The estate is constant-impedance (a motor's reactive demand scales with V^2, so does a capacitor's output: the power factor at the bus does not depend on
// the bus voltage). The pump's start is its locked-rotor admittance in parallel behind the supply's Thevenin impedance.
import { abs, cx, mul, dmath, type Complex } from '@core/numerics';
import { CAN_TOLERANCE, EST, PUMP, STARTERS, VL, Z_SUPPLY, type Starter } from './data';

export type Conn = 'Y' | 'D';
export interface Bank { unitUF: number; count: number; conn: Conn; ratedV: number }

const W = (f0: number): number => 2 * Math.PI * f0;
/** Reactive power the motors take, var. */
export const motorsQvar = (): number => EST.kw * 1000 * dmath.tan(dmath.acos(EST.pf));
/** Capacitor bank output at the bus voltage `vl` (line-to-line): Y: omega C V_L^2, delta: 3 omega C V_L^2 (C per phase). */
export const bankQvar = (b: Bank, f0: number, vl = VL): number => W(f0) * b.unitUF * 1e-6 * b.count * vl * vl * (b.conn === 'Y' ? 1 : 3);
/** The voltage across one can: the phase voltage in Y, the line voltage in delta. */
export const canVolts = (conn: Conn, vl = VL): number => (conn === 'Y' ? vl / Math.sqrt(3) : vl);
export const bankBursts = (b: Bank): boolean => canVolts(b.conn) > b.ratedV * CAN_TOLERANCE;
/** Reactive power needed to lift pf from `from` to `to` for P (PS-05 rule), var. */
export const qcNeeded = (pKw: number, from: number, to: number): number => pKw * 1000 * (dmath.tan(dmath.acos(from)) - dmath.tan(dmath.acos(to)));
/** Capacitance per phase for a reactive power at the line voltage, uF: Y and delta (C_delta = C_Y / 3). */
export const cPerPhaseUF = (q: number, f0: number, conn: Conn, vl = VL): number => (q / (W(f0) * vl * vl * (conn === 'Y' ? 1 : 3))) * 1e6;

export interface PfcResult {
  qBankKvar: number; qNetKvar: number; pf: number;
  /** Bus voltage before the pump starts, pu of nominal. */
  vBusPu: number;
  /** Voltage dip at the bus when the pump starts, percent of the pre-start voltage; the starting current, A; full-load current, A. */
  dipPct: number; iStartA: number; iFullA: number;
}
const inv = (z: Complex): Complex => { const d = z.re * z.re + z.im * z.im; return cx(z.re / d, -z.im / d); };
export function solvePfc(bank: Bank | null, starter: Starter, f0: number): PfcResult {
  const qc = bank ? bankQvar(bank, f0) : 0, qm = motorsQvar(), p = EST.kw * 1000, vph = VL / Math.sqrt(3);
  const yEst = cx(p / (3 * vph * vph), -(qm - qc) / (3 * vph * vph));
  const zs = cx(Z_SUPPLY.re, Z_SUPPLY.im);
  const vOf = (y: Complex): number => { const zy = mul(zs, y); return abs(mul(cx(vph, 0), inv(cx(1 + zy.re, zy.im)))); };
  const iFull = (PUMP.kw * 1000) / (Math.sqrt(3) * VL * PUMP.pf * PUMP.eta), iSt = STARTERS[starter].mult * iFull;
  const a = dmath.acos(PUMP.startPf), yst = cx((iSt / vph) * dmath.cos(a), -(iSt / vph) * dmath.sin(a));
  const v0 = vOf(yEst), v1 = vOf(cx(yEst.re + yst.re, yEst.im + yst.im));
  const qnet = qm - qc;
  return { qBankKvar: qc / 1000, qNetKvar: qnet / 1000, pf: p / dmath.hypot(p, qnet), vBusPu: v0 / vph, dipPct: 100 * (1 - v1 / v0), iStartA: iSt, iFullA: iFull };
}
