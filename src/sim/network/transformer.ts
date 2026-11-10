// Two-winding transformer in the unified pi form (DESIGN 3.3). HV is the from side and carries the tap.
import { S_BASE_MVA, type NetBranch, type NetShunt } from './types';

/** Tap ratio magnitude for tap position n in [-8, 8]: tau = 1 - 0.0125 n (so +n raises the LV voltage). */
export function tapTau(n: number): number {
  if (!Number.isInteger(n) || n < -8 || n > 8) throw new Error(`Tap position ${n} is outside -8..+8 (1.25 % steps); a transformer tap changer has 17 positions.`);
  return 1 - 0.0125 * n;
}

export interface TransformerSpec {
  id: string;
  hvBus: string;
  lvBus: string;
  /** Rated apparent power (MVA) and short-circuit impedance (% on own rating). */
  sRatedMVA: number;
  zPercent: number;
  /** X/R ratio of the short-circuit impedance. */
  xOverR: number;
  /** No-load (iron) loss, kW. */
  noLoadKW?: number;
  /** Tap position n in [-8, 8]. */
  tap?: number;
  rateMVA?: number;
  inService?: boolean;
}

export interface TransformerPu { r: number; x: number; gNoLoad: number }

/** x_t = (%Z/100)(S_base/S_rated), r_t = x_t/(X/R), G_nl = P_nl/S_base (pu; magnetising susceptance neglected, S18). */
export function transformerPu(s: Pick<TransformerSpec, 'sRatedMVA' | 'zPercent' | 'xOverR' | 'noLoadKW'>, sBaseMVA = S_BASE_MVA): TransformerPu {
  const zt = (s.zPercent / 100) * (sBaseMVA / s.sRatedMVA);
  // |z| = zt, x/r = X/R  =>  r = zt / sqrt(1 + (X/R)^2), x = r (X/R)
  const r = zt / Math.sqrt(1 + s.xOverR * s.xOverR);
  const x = r * s.xOverR;
  return { r, x, gNoLoad: ((s.noLoadKW ?? 0) / 1000) / sBaseMVA };
}

/** Branch + HV-side no-load shunt for a transformer spec. */
export function transformerElements(s: TransformerSpec, sBaseMVA = S_BASE_MVA): { branch: NetBranch; shunt: NetShunt | null } {
  const pu = transformerPu(s, sBaseMVA);
  const branch: NetBranch = {
    id: s.id, from: s.hvBus, to: s.lvBus, r: pu.r, x: pu.x, bc: 0,
    tau: tapTau(s.tap ?? 0), rateMVA: s.rateMVA ?? s.sRatedMVA, inService: s.inService ?? true,
  };
  const shunt: NetShunt | null = pu.gNoLoad > 0 ? { id: `${s.id}:nl`, bus: s.hvBus, g: pu.gNoLoad, b: 0, inService: s.inService ?? true } : null;
  return { branch, shunt };
}

/** Re-express a pu impedance given on (S_old, kV_old) on a new base (S_new, kV_new): z' = z (S_new/S_old)(kV_old/kV_new)^2. */
export function changeBase(zPu: number, sOldMVA: number, kVOld: number, sNewMVA: number, kVNew: number): number {
  const k = kVOld / kVNew;
  return zPu * (sNewMVA / sOldMVA) * k * k;
}
