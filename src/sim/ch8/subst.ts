// L34 Firm Capacity: the loss of the largest primary transformer at the evening peak. The survivors carry what they may (protection holds them to kMaxShed x rating), the rest of the
// load is shed until a bus-section close, a tie transfer or demand response brings it back. Each survivor's hot-spot follows IEC 60076-7 (src/sim/distrib/thermal-tx.ts); a hot-spot
// over the emergency limit trips the transformer on its own protection and darkens the substation.
import { runCycle } from '../distrib';
import { L34 } from './data';
import type { L34Design } from './state';

export const defaultL34 = (): L34Design => ({ sizeMva: L34.baseMva, third: false, bus: 'manual', tie: 'none', dr: 'none' });

const STEP_MIN = 15, STEPS = 96;
export interface L34Study {
  n: number; firmMva: number; totalMva: number; shortfallMva: number; hotPeakC: number; hotPeakAtH: number; lolDays: number; restoredAtH: number; unservedMWh: number;
  overheat: boolean; notRestored: boolean; capexUSD: number;
  /** Per 15 min step of the day: load, served by the survivors, hot-spot of a survivor, relative ageing rate. */
  loadMva: number[]; servedMva: number[]; hot: number[]; topOil: number[]; ageing: number[]; tripStep: number;
}
export function studyL34(d: L34Design): L34Study {
  const n = (d.third ? 3 : 2), S = d.sizeMva, survivors = n - 1, tie = L34.ties[d.tie], dr = L34.dr[d.dr];
  const peak = L34.peakMva, tripStep = (L34.tripHour * 60) / STEP_MIN;
  const load = Array.from({ length: STEPS }, (_, i) => peak * L34.shape[Math.floor((i * STEP_MIN) / 60)]!);
  // the lost section of a split bus (2 x 1 + manual close) is dark until the bus-section breaker is closed; with 3 transformers the tripped one's bay load goes to the other two at once
  const served: number[] = [], K: number[] = [];
  let unserved = 0, restoredAt = 0;
  for (let i = 0; i < STEPS; i++) {
    const tH = (i - tripStep) * (STEP_MIN / 60);   // hours since the trip (negative before)
    if (tH < 0) { served.push(load[i]!); K.push(load[i]! / (n * S)); continue; }
    const relief = (tH >= tie.h && tie.mva > 0 ? tie.mva : 0) + (tH >= L34.drLeadH ? dr.mva : 0);
    let carry = Math.min(load[i]! - relief, survivors * S * L34.kMaxShed);
    if (d.bus === 'manual' && !d.third && tH < L34.busSection.manualH) carry = Math.min(carry, load[i]! / 2);   // split bus: half the load waits for the breaker
    carry = Math.max(0, carry);
    const short = Math.max(0, load[i]! - relief - carry);
    if (short > 1e-6) { unserved += short * (STEP_MIN / 60); restoredAt = tH + STEP_MIN / 60; }
    served.push(carry); K.push(carry / (survivors * S));
  }
  // one survivor's hot-spot over the day (a survivor's K before the trip is that of an n-transformer station)
  const cyc = runCycle(K, L34.ambientC, { stepMin: STEP_MIN });
  const after = cyc.thetaHot.slice(tripStep), peakAfter = Math.max(...after), at = after.indexOf(peakAfter);
  const overheat = peakAfter > L34.hotSpotLimitC;
  const notRestored = restoredAt > L34.restoreWithinH + 1e-9;
  const price = (d.third ? L34.sizePrice[d.sizeMva]! + L34.thirdBay : 0) + 2 * (L34.sizePrice[d.sizeMva]! - L34.sizePrice[L34.baseMva]!)
    + (d.bus === 'auto' ? L34.busSection.price : 0) + tie.price + dr.price;
  return {
    n, firmMva: survivors * S, totalMva: n * S, shortfallMva: Math.max(0, peak - survivors * S), hotPeakC: peakAfter, hotPeakAtH: (at * STEP_MIN) / 60, lolDays: cyc.lossOfLifeDays,
    restoredAtH: restoredAt, unservedMWh: unserved, overheat, notRestored, capexUSD: price, loadMva: load, servedMva: served, hot: cyc.thetaHot, topOil: cyc.thetaTopOil, ageing: cyc.V, tripStep,
  };
}
