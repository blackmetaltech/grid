// Load growth: compound base rate per feeder, EV and rooftop-PV adoption, hourly net-load shapes.
import { dmath } from '@core/numerics';
import { GROWTH, SHAPES, WEATHER } from './data';
import type { CareerState, Feeder } from './state';

/** Quarterly growth factor for a yearly percentage: (1 + g/100)^(1/4). */
export const quarterFactor = (pct: number): number => dmath.pow(1 + pct / 100, 0.25);
/** Compound growth of a load over n quarters. */
export const grownLoad = (kw: number, pct: number, quarters: number): number => kw * dmath.pow(1 + pct / 100, quarters / 4);
export const evShare = (t: number, bias: number): number => Math.min(GROWTH.evMax, (GROWTH.evStart + (GROWTH.evPerYear * t) / 4) * bias);
export const pvShare = (t: number, bias: number): number => Math.min(GROWTH.pvMax, (GROWTH.pvStart + (GROWTH.pvPerYear * t) / 4) * bias);
/** EV charging load (kW, coincident at the evening peak) and rooftop PV (kWp installed) of a feeder at quarter t. */
export const evKw = (f: Feeder, t: number): number => f.customers * evShare(t, f.evBias) * GROWTH.evKwEach * GROWTH.evCoincidence;
export const pvKwp = (f: Feeder, t: number): number => f.customers * pvShare(t, f.pvBias) * GROWTH.pvKwpEach + f.solarKw;

export interface HourlyLoad { net: number[]; peakKw: number; peakHour: number; minKw: number; minHour: number }
/** Hourly net head load (kW) of a feeder in season (0..3): base x seasonal x shape + EV x shape - PV x shape (+ battery / demand response). */
export function hourlyLoad(f: Feeder, t: number, heat = false): HourlyLoad {
  const season = ((t % 4) + 4) % 4, sl = WEATHER.seasonLoad[season]! * (heat ? WEATHER.heatwaveLoadUp : 1), sp = WEATHER.seasonPv[season]!;
  const ev = evKw(f, t), pv = pvKwp(f, t) * 0.8; // 0.8: inverter and soiling derate at peak sun
  const net: number[] = [];
  for (let h = 0; h < 24; h++) {
    let p = f.baseKw * sl * SHAPES.base[h]! + ev * SHAPES.ev[h]! - pv * sp * SHAPES.pv[h]!;
    if (h >= 17 && h <= 21) p -= f.batteryKw * 0.85 + f.drKw;      // battery discharges, demand response sheds at the evening peak
    if (h >= 11 && h <= 14) p += f.batteryKw * 0.85;               // battery charges from the noon PV
    net.push(p);
  }
  let pk = -Infinity, mn = Infinity, ph = 0, mh = 0;
  net.forEach((p, h) => { if (p > pk) { pk = p; ph = h; } if (p < mn) { mn = p; mh = h; } });
  return { net, peakKw: pk, peakHour: ph, minKw: mn, minHour: mh };
}
/** Annual-peak forecast of the feeder n quarters ahead (winter evening), with its own growth, kW. */
export function forecastPeakKw(f: Feeder, t: number, ahead: number): number {
  const tt = t + ahead;
  const w = Math.max(t, tt - (((tt % 4) + 4) % 4)); // the winter quarter of that year (not before now)
  const g: Feeder = { ...f, baseKw: grownLoad(f.baseKw, f.growthPct, w - t) };
  return hourlyLoad(g, w, false).peakKw;
}
