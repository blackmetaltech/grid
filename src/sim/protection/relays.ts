// Protection relays (DESIGN 3.8): IEC 60255-151 IDMT overcurrent, simplified mho distance zones (S20), voltage relays.
import { abs, add, cx, dmath as dm, scale, sub, type Complex } from '@core/numerics';

export type IdmtCurve = 'SI' | 'VI' | 'EI' | 'LTI';
/** IEC 60255-151 constants (k, alpha). */
export const IDMT_CURVES: Record<IdmtCurve, { k: number; alpha: number }> = {
  SI: { k: 0.14, alpha: 0.02 }, VI: { k: 13.5, alpha: 1 }, EI: { k: 80, alpha: 2 }, LTI: { k: 120, alpha: 1 },
};
/** Relay pick-up multiple: the IDMT element operates only above this times I_s. */
export const PICKUP_FACTOR = 1.1;

export interface OvercurrentSetting {
  curve: IdmtCurve;
  /** Time multiplier setting. */
  tms: number;
  /** Plug setting I_s (same unit as the measured current). */
  is: number;
  /** Optional instantaneous element: pick-up current (same unit) and operating time (s, default 0.02). */
  inst?: { pickup: number; timeS?: number };
}

/** IDMT operating time t = TMS k / ((I/I_s)^alpha - 1) (s); Infinity at or below 1.1 I_s (does not operate). */
export function idmtTime(curve: IdmtCurve, tms: number, i: number, is: number): number {
  if (!(i > PICKUP_FACTOR * is) || !(is > 0)) return Infinity;
  const { k, alpha } = IDMT_CURVES[curve];
  const d = dm.pow(i / is, alpha) - 1;
  return d > 0 ? (tms * k) / d : Infinity;
}

/** Relay operating time (s): the faster of the IDMT and the optional instantaneous element; Infinity = no operation. */
export function overcurrentTime(s: OvercurrentSetting, i: number): number {
  const t = idmtTime(s.curve, s.tms, i, s.is);
  if (s.inst && i >= s.inst.pickup) return Math.min(t, s.inst.timeS ?? 0.02);
  return t;
}

/** Grading: TMS_2 = (t_down + CTI) ((I/I_s2)^alpha - 1) / k so the upstream relay trips CTI after the downstream one at the same fault current. */
export function gradingTms(curve: IdmtCurve, tDownS: number, ctiS: number, iFault: number, isUp: number): number {
  const { k, alpha } = IDMT_CURVES[curve];
  return ((tDownS + ctiS) * (dm.pow(iFault / isUp, alpha) - 1)) / k;
}

/** Apparent impedance Z_app = V_relay / I_relay (pu); open circuit (no current) gives Infinity real part. */
export function apparentZ(v: Complex, i: Complex): Complex {
  const d = i.re * i.re + i.im * i.im;
  if (d === 0) return cx(Infinity, 0);
  return cx((v.re * i.re + v.im * i.im) / d, (v.im * i.re - v.re * i.im) / d);
}

export interface DistanceZone { zone: 1 | 2 | 3; reach: Complex; delayS: number }

/** Mho zones (S20): Z1 = 0.8 Z_L, 30 ms; Z2 = 1.2 Z_L, 350 ms; Z3 = Z_L + 1.2 Z_adjacent (longest), 1.0 s. */
export function distanceZones(zLine: Complex, zLongestAdjacent: Complex = cx(0, 0)): DistanceZone[] {
  return [
    { zone: 1, reach: scale(zLine, 0.8), delayS: 0.03 },
    { zone: 2, reach: scale(zLine, 1.2), delayS: 0.35 },
    { zone: 3, reach: add(zLine, scale(zLongestAdjacent, 1.2)), delayS: 1.0 },
  ];
}

/** Circular mho characteristic through the origin with the reach as diameter: picks up when |Z_app - Z_r/2| < |Z_r|/2. */
export function mhoPicksUp(zApp: Complex, reach: Complex): boolean {
  if (!Number.isFinite(zApp.re) || !Number.isFinite(zApp.im)) return false;
  return abs(sub(zApp, scale(reach, 0.5))) < abs(reach) / 2;
}

/** Fastest distance zone that picks up for Z_app, or null. */
export function distanceTrip(zApp: Complex, zLine: Complex, zLongestAdjacent?: Complex): DistanceZone | null {
  for (const z of distanceZones(zLine, zLongestAdjacent)) if (mhoPicksUp(zApp, z.reach)) return z;
  return null;
}

export interface VoltageStage { thresholdPu: number; delayS: number }
/** Over-voltage stages: 110 % for 5 s, 140 % for 100 ms. */
export const OV_STAGES: VoltageStage[] = [{ thresholdPu: 1.1, delayS: 5 }, { thresholdPu: 1.4, delayS: 0.1 }];
/** Under-voltage load trip: below 0.85 pu for 2 s. */
export const UV_STAGE: VoltageStage = { thresholdPu: 0.85, delayS: 2 };

/** Shortest over-voltage trip delay (s) for |V| (pu) held constant: min delay over stages with V >= threshold; Infinity when none. */
export function overVoltageDelay(vPu: number, stages: VoltageStage[] = OV_STAGES): number {
  let t = Infinity;
  for (const s of stages) if (vPu >= s.thresholdPu) t = Math.min(t, s.delayS);
  return t;
}
/** Under-voltage load-trip delay (s) for |V| (pu) held constant: 2 s when 0 < V < 0.85, else Infinity (a dead bus has nothing to trip). */
export function underVoltageDelay(vPu: number, stage: VoltageStage = UV_STAGE): number {
  return vPu > 0 && vPu < stage.thresholdPu ? stage.delayS : Infinity;
}
