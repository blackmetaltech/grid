// Storage: BESS and pumped hydro (DESIGN 3.10/3.11, S36). MW, MWh, SoC as a fraction of rated energy.
import { dmath } from '@core/numerics';

export interface StorageParams {
  /** Rated energy E (MWh). */
  energyMWh: number;
  /** Rated charge / discharge power (MW). */
  pChMaxMW: number; pDisMaxMW: number;
  /** Round-trip efficiency; eta_c = eta_d = sqrt(eta_rt). */
  etaRt: number;
  socMin?: number; socMax?: number;
  /** Fixed-speed pumping (S36): the charge power is either 0 or pChMaxMW (a duty fraction inside a block). */
  fixedSpeedPump?: boolean;
}

export interface StorageStep {
  soc: number;
  /** Delivered block-average powers after clamping (MW). */
  pChMW: number; pDisMW: number;
  clamped: boolean;
}

/** One-way efficiency eta = sqrt(eta_rt). */
export function oneWayEfficiency(etaRt: number): number { return dmath.pow(etaRt, 0.5); }

/** SoC_{t+1} = SoC_t + (eta_c P_ch - P_dis/eta_d) dt / E, clamped to [socMin, socMax] by trimming the power (MW, h). */
export function storageStep(sp: StorageParams, soc: number, pChReqMW: number, pDisReqMW: number, dtH = 0.25): StorageStep {
  const eta = oneWayEfficiency(sp.etaRt);
  const lo = sp.socMin ?? 0.1, hi = sp.socMax ?? 0.9;
  let pCh = Math.max(0, Math.min(pChReqMW, sp.pChMaxMW));
  let pDis = Math.max(0, Math.min(pDisReqMW, sp.pDisMaxMW));
  if (pCh > 0 && pDis > 0) { if (pCh >= pDis) { pCh -= pDis; pDis = 0; } else { pDis -= pCh; pCh = 0; } }
  const reqCh = pCh, reqDis = pDis;
  if (pCh > 0) {
    const room = Math.max(0, (hi - soc) * sp.energyMWh / (eta * dtH));
    if (sp.fixedSpeedPump) {
      // pump at rated power for the fraction of the block that fits (or not at all if requested power is below rated/2)
      const duty = pCh >= 0.5 * sp.pChMaxMW ? 1 : 0;
      pCh = Math.min(sp.pChMaxMW * duty, room);
    } else pCh = Math.min(pCh, room);
  }
  if (pDis > 0) pDis = Math.min(pDis, Math.max(0, (soc - lo) * sp.energyMWh * eta / dtH));
  const next = soc + (eta * pCh - pDis / eta) * dtH / sp.energyMWh;
  return { soc: next, pChMW: pCh, pDisMW: pDis, clamped: pCh < reqCh - 1e-12 || pDis < reqDis - 1e-12 };
}

/** Threshold strategy: charge at full power when lambda < lambdaLow, discharge when lambda > lambdaHigh (currency/MWh). */
export function thresholdRequest(sp: StorageParams, lambda: number, lambdaLow: number, lambdaHigh: number): { pChMW: number; pDisMW: number } {
  if (lambda < lambdaLow) return { pChMW: sp.pChMaxMW, pDisMW: 0 };
  if (lambda > lambdaHigh) return { pChMW: 0, pDisMW: sp.pDisMaxMW };
  return { pChMW: 0, pDisMW: 0 };
}

/** Typical BESS: eta_rt 0.86, SoC 10-90 %. */
export function bess(energyMWh: number, pMW: number, etaRt = 0.86): StorageParams {
  return { energyMWh, pChMaxMW: pMW, pDisMaxMW: pMW, etaRt, socMin: 0.1, socMax: 0.9 };
}

/** Pumped hydro: eta_rt 0.75, fixed-speed pumping (S36). */
export function pumpedHydro(energyMWh: number, pPumpMW: number, pTurbineMW: number, etaRt = 0.75): StorageParams {
  return { energyMWh, pChMaxMW: pPumpMW, pDisMaxMW: pTurbineMW, etaRt, socMin: 0.1, socMax: 0.9, fixedSpeedPump: true };
}
