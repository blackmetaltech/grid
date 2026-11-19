import { describe, expect, it } from 'vitest';
import { steadyState, hotSpot, runCycle, ageingRate, emergencyK } from './thermal-tx';

describe('IEC 60076-7 ONAN', () => {
  it('rated load gives a 98 C hot spot at 20 C and ageing rate 1', () => {
    const s = steadyState(1);
    expect(hotSpot(s, 20)).toBeCloseTo(98, 9);
    expect(ageingRate(98)).toBeCloseTo(1, 12);
    expect(ageingRate(104)).toBeCloseTo(2, 12);
    expect(ageingRate(92)).toBeCloseTo(0.5, 12);
  });
  it('constant rated load for 24 h consumes 24 h of life', () => {
    const r = runCycle(new Array(96).fill(1), 20);
    expect(r.lossOfLifeH).toBeCloseTo(24, 6);
  });
  it('overload ages faster than it relieves; peak lags the load peak', () => {
    const K = [...new Array(48).fill(0.5), ...new Array(16).fill(1.4), ...new Array(32).fill(0.5)];
    const r = runCycle(K, 20);
    expect(r.peakHotC).toBeGreaterThan(110);
    expect(r.lossOfLifeDays).toBeGreaterThan(1 / 24);
    expect(r.peakIndex).toBeGreaterThanOrEqual(48);
  });
  it('emergency K rises as the duration shortens', () => {
    expect(emergencyK(0.7, 20, 140, 1)).toBeGreaterThan(emergencyK(0.7, 20, 140, 4));
  });
});
