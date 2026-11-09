// Turbine-governor and BESS state-derivative functions for the frequency window (DESIGN 3.6, REVIEW E4/E5).
// Pure scalar functions (no allocation) so the RK4 loop in frequency.ts stays fast. Power in MW, speed deviation in pu.

/** Governor/turbine families of DESIGN 3.6. 'none' = condenser / inverter-like element without a governor. */
export type GovKind = 'steam' | 'gas' | 'hydro' | 'none';

/** Optional time-constant overrides (seconds, F_HP dimensionless); defaults are the DESIGN 3.6 values (S25, S26). */
export interface GovParams {
  tG?: number;
  tRH?: number;
  fHP?: number;
  tW?: number;
}

/** Kundur 9.2 typical steam reheat time constants. */
export const STEAM_TG_S = 0.2;
export const STEAM_TRH_S = 7;
export const STEAM_FHP = 0.3;
/** Gas turbine governor time constant. */
export const GAS_TG_S = 0.5;
/** Hydro governor time constant and water starting time. */
export const HYDRO_TG_S = 0.5;
export const HYDRO_TW_S = 1.5;
/** BESS FFR time constants: grid-following 0.2 s, grid-forming 0.05 s. */
export const BESS_TB_FOLLOWING_S = 0.2;
export const BESS_TB_FORMING_S = 0.05;

/** Offset dead-zone (no jump): dw_e = sign(dw)·max(0, |dw| − db), pu. */
export function deadZone(dw: number, db: number): number {
  const a = Math.abs(dw) - db;
  if (!(a > 0)) return 0;
  return dw < 0 ? -a : a;
}

/** Governor valve time constant T_G (s) for a kind with optional override. */
export function govTG(kind: GovKind, p: GovParams = {}): number {
  if (p.tG !== undefined) return p.tG;
  return kind === 'steam' ? STEAM_TG_S : kind === 'hydro' ? HYDRO_TG_S : GAS_TG_S;
}

/** Valve derivative dv/dt = (−(S/R)·dw_e − v)/T_G  [MW/s]; sOverR in MW per pu speed (0 = no droop). */
export function govValveDot(tG: number, sOverR: number, dwE: number, v: number): number {
  return (-sOverR * dwE - v) / tG;
}

/** Second-state derivative: steam reheat dr/dt = (v − r)/T_RH; hydro dw/dt = (3v − w)/(0.5·T_W); gas/none 0  [MW/s]. */
export function govAuxDot(kind: GovKind, p: GovParams, v: number, z: number): number {
  if (kind === 'steam') return (v - z) / (p.tRH ?? STEAM_TRH_S);
  if (kind === 'hydro') return (3 * v - z) / (0.5 * (p.tW ?? HYDRO_TW_S));
  return 0;
}

/** Unclipped mechanical power deviation: steam F_HP·v + (1−F_HP)·r; gas v; hydro −2v + w; none 0  [MW]. */
export function govPm(kind: GovKind, p: GovParams, v: number, z: number): number {
  if (kind === 'steam') { const f = p.fHP ?? STEAM_FHP; return f * v + (1 - f) * z; }
  if (kind === 'gas') return v;
  if (kind === 'hydro') return -2 * v + z;
  return 0;
}

/** Headroom clip: dPm ∈ [P_min − P0, P_max − P0]  [MW]. */
export function clipHeadroom(dPm: number, lo: number, hi: number): number {
  return dPm < lo ? lo : dPm > hi ? hi : dPm;
}

/** Governor steady-state ΔPm = −(S/R)·dw_e (all three families reach the valve value)  [MW]. */
export function govSteadyPm(sOverR: number, dwE: number): number {
  return -sOverR * dwE;
}

/** BESS FFR derivative dP_b/dt = (−(P_rated/R_b)·dw_e − P_b)/T_B  [MW/s]. */
export function bessDot(ratedMW: number, droopPu: number, tB: number, dwE: number, pb: number): number {
  return (-(ratedMW / droopPu) * dwE - pb) / tB;
}

/** BESS output limit ±P_rated, and zero discharge when the energy budget is exhausted  [MW]. */
export function bessOutput(pb: number, ratedMW: number, dischargedMWh: number, energyMWh: number): number {
  let p = pb < -ratedMW ? -ratedMW : pb > ratedMW ? ratedMW : pb;
  if (p > 0 && dischargedMWh >= energyMWh) p = 0;
  return p;
}
