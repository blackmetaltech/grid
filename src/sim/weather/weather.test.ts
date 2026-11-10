import { describe, it, expect } from 'vitest';
import { Rng } from '@core/kit';
import { expectOracle } from '../../oracles/expected';
import {
  demandProfile, demandFraction, demandPQ, irrigationProfile, HOURLY_RESIDENTIAL, HOURLY_COMMERCIAL, HOURLY_INDUSTRIAL,
  POWER_FACTOR, clearSkyIrradiance, dayLengthHours, pvDcPower, pvAcPower, pvPlantOutput, cellTemperature,
  windPower, windSpeedSeries, generateClouds, advectClouds, transmittance, type DemandClass,
} from './index';

const CLASSES: DemandClass[] = ['residential', 'commercial', 'irrigation', 'industrial', 'city', 'datacenter'];
const SEEDS = Number(process.env.GRID_FUZZ_N ?? 200);

describe('oracles', () => {
  it('G-08 wind curve 3 MW at 8 m/s', () => expectOracle('G-08', 'P_MW', windPower(3, 8)));
  it('G-14 PV model 100 MW_dc, 800 W/m2, 45 C', () => expectOracle('G-14', 'Pdc_MW', pvDcPower(100, 800, 45)));
});

describe('demand', () => {
  it('profiles have 96 blocks', () => { for (const c of CLASSES) expect(demandProfile(c)).toHaveLength(96); });
  it('residential peak 1.00 at 20:00 (block 80)', () => {
    const p = demandProfile('residential');
    expect(p[80]).toBe(1);
    expect(Math.max(...p)).toBe(1);
  });
  it('block 4h equals the hourly anchor for every class/hour', () => {
    const hourly: Partial<Record<DemandClass, readonly number[]>> = {
      residential: HOURLY_RESIDENTIAL, commercial: HOURLY_COMMERCIAL, industrial: HOURLY_INDUSTRIAL,
    };
    for (const c of ['residential', 'commercial', 'industrial'] as const) {
      const p = demandProfile(c);
      for (let h = 0; h < 24; h++) expect(p[4 * h]).toBeCloseTo(hourly[c]![h]!, 12);
    }
    const anchors: Record<number, number> = { 0: 0.3, 3: 0.28, 6: 0.35, 9: 0.85, 12: 1, 15: 0.98, 18: 0.7, 19: 0.6, 20: 0.5, 21: 0.42, 23: 0.33 };
    const com = demandProfile('commercial');
    for (const [h, v] of Object.entries(anchors)) expect(com[4 * Number(h)]).toBeCloseTo(v, 12);
    const city = demandProfile('city'), r = demandProfile('residential'), i = demandProfile('industrial');
    for (let h = 0; h < 24; h++) expect(city[4 * h]).toBeCloseTo(0.45 * r[4 * h]! + 0.3 * com[4 * h]! + 0.25 * i[4 * h]!, 12);
  });
  it('23 -> 24 wraps to hour 0 (linear)', () => {
    const p = demandProfile('commercial');
    expect(p[92 + 2]).toBeCloseTo((0.33 + 0.3) / 2, 12);
  });
  it('city mixed composition', () => {
    const c = demandProfile('city'), r = demandProfile('residential'), m = demandProfile('commercial'), i = demandProfile('industrial');
    for (let b = 0; b < 96; b++) expect(c[b]).toBeCloseTo(0.45 * r[b]! + 0.3 * m[b]! + 0.25 * i[b]!, 12);
  });
  it('datacenter flat 0.95, insensitive to temperature', () => {
    expect(new Set(demandProfile('datacenter'))).toEqual(new Set([0.95]));
    expect(demandFraction('datacenter', 40, 45)).toBe(0.95);
  });
  it('irrigation default schedule and shift', () => {
    const p = irrigationProfile();
    for (let b = 0; b < 96; b++) {
      const h = b / 4;
      expect(p[b]).toBe((h >= 0 && h < 5) || (h >= 10 && h < 14) ? 1 : 0.05);
    }
    const s = irrigationProfile(undefined, 2);
    expect(s[0]).toBe(0.05); expect(s[8]).toBe(1); expect(s[4 * 7 - 1]).toBe(1); expect(s[4 * 7]).toBe(0.05);
    expect(s.filter((v) => v === 1).length).toBe(p.filter((v) => v === 1).length);
    expect(demandProfile('irrigation', { irrigationShiftHours: 2 })).toEqual(s);
    const w = irrigationProfile([[22, 23]], 2); // wraps past midnight
    expect(w[0]).toBe(1); expect(w[7]).toBe(1); expect(w[8]).toBe(0.05);
  });
  it('temperature rule: res/com only, zero below 30 C, 1.5 %/C above', () => {
    expect(demandFraction('residential', 80, 30)).toBeCloseTo(1, 12);
    expect(demandFraction('residential', 80, 20)).toBeCloseTo(1, 12);
    expect(demandFraction('residential', 80, 40)).toBeCloseTo(1.15, 12);
    expect(demandFraction('commercial', 48, 40)).toBeCloseTo(1.15, 12);
    for (const c of ['industrial', 'irrigation', 'datacenter'] as const) expect(demandFraction(c, 10, 40)).toBeCloseTo(demandProfile(c)[10]!, 12);
    // city: pro rata through residential + commercial share
    const r = demandProfile('residential')[80]!, m = demandProfile('commercial')[80]!, i = demandProfile('industrial')[80]!;
    expect(demandFraction('city', 80, 40)).toBeCloseTo((0.45 * r + 0.3 * m) * 1.15 + 0.25 * i, 12);
  });
  it('P, Q, growth and surge hook', () => {
    const a = demandPQ({ cls: 'residential', peakMW: 100, block: 80, tempC: 25 });
    expect(a.pMW).toBeCloseTo(100, 10);
    expect(a.qMVAr).toBeCloseTo(100 * Math.tan(Math.acos(0.95)), 8);
    const b = demandPQ({ cls: 'residential', peakMW: 100, block: 80, tempC: 25, growth: 1.1, surge: (k) => (k === 80 ? 1.2 : 1) });
    expect(b.pMW).toBeCloseTo(132, 10);
    const arr = new Array(96).fill(1); arr[3] = 2;
    expect(demandPQ({ cls: 'datacenter', peakMW: 10, block: 3, tempC: 25, surge: arr }).pMW).toBeCloseTo(19, 10);
    expect(POWER_FACTOR.city).toBe(0.92);
  });
});

describe('solar', () => {
  const lat = 23, summer = 172, winter = 355;
  it('zero at night, positive at noon, < 1000 W/m2', () => {
    for (const n of [summer, winter]) {
      expect(clearSkyIrradiance(lat, n, 0)).toBe(0);
      expect(clearSkyIrradiance(lat, n, 95)).toBe(0);
      const peak = Math.max(...Array.from({ length: 96 }, (_, b) => clearSkyIrradiance(lat, n, b)));
      expect(peak).toBeGreaterThan(500); expect(peak).toBeLessThan(1000);
    }
  });
  it('symmetric about solar noon (block midpoints: b and 95-b)', () => {
    for (let b = 0; b < 48; b++) expect(clearSkyIrradiance(lat, summer, b)).toBeCloseTo(clearSkyIrradiance(lat, summer, 95 - b), 9);
  });
  it('day length plausible at 23 N', () => {
    const s = dayLengthHours(lat, summer), w = dayLengthHours(lat, winter);
    expect(s).toBeGreaterThan(13.2); expect(s).toBeLessThan(13.8);
    expect(w).toBeGreaterThan(10.2); expect(w).toBeLessThan(10.8);
    // sunlit blocks agree with analytic day length within a block
    const n = Array.from({ length: 96 }, (_, b) => clearSkyIrradiance(lat, summer, b)).filter((g) => g > 0).length;
    expect(Math.abs(n / 4 - s)).toBeLessThanOrEqual(0.5);
  });
  it('cell temperature, AC clip and DC/AC 1.25', () => {
    expect(cellTemperature(30, 800)).toBeCloseTo(55, 12);
    expect(pvAcPower(100, 90)).toBe(90);
    expect(pvAcPower(50, 90)).toBeCloseTo(48.5, 12);
    const noon = pvPlantOutput({ pAcRatedMW: 100, dayOfYear: summer, block: 48, tAmbC: 35 });
    expect(noon.pAcMW).toBeLessThanOrEqual(100);
    expect(noon.pDcMW).toBeGreaterThan(noon.pAcMW);
    const dim = pvPlantOutput({ pAcRatedMW: 100, dayOfYear: summer, block: 48, tAmbC: 35, transmittance: 0.5 });
    expect(dim.gWm2).toBeCloseTo(noon.gWm2 / 2, 9);
    expect(pvPlantOutput({ pAcRatedMW: 100, dayOfYear: summer, block: 0, tAmbC: 25 }).pAcMW).toBe(0);
  });
});

describe('wind', () => {
  it('curve regions', () => {
    expect(windPower(3, 2.99)).toBe(0); expect(windPower(3, 3)).toBe(0);
    expect(windPower(3, 12)).toBe(3); expect(windPower(3, 24.9)).toBe(3);
    expect(windPower(3, 25)).toBe(0); expect(windPower(3, 40)).toBe(0);
    expect(windPower(3, NaN)).toBe(0);
  });
  it('AR(1) stationary mean and sd within tolerance over many seeds', () => {
    let sum = 0, n = 0, ss = 0;
    for (let s = 1; s <= SEEDS; s++) {
      for (const v of windSpeedSeries(new Rng(s), 8, 96, 1.5, 0.9)) { sum += v; ss += (v - 8) * (v - 8); n++; }
    }
    expect(Math.abs(sum / n - 8)).toBeLessThan(0.1);
    expect(Math.sqrt(ss / n)).toBeGreaterThan(1.3); expect(Math.sqrt(ss / n)).toBeLessThan(1.7);
  });
  it('follows a mean profile; deterministic', () => {
    const prof = Array.from({ length: 96 }, (_, b) => (b < 48 ? 5 : 11));
    const a = windSpeedSeries(new Rng(7), prof), b = windSpeedSeries(new Rng(7), prof), c = windSpeedSeries(new Rng(8), prof);
    expect(a).toEqual(b); expect(a).not.toEqual(c);
    expect(a.every((v) => v >= 0 && Number.isFinite(v))).toBe(true);
  });
});

describe('clouds', () => {
  const o = { width: 100, height: 100, count: 12 };
  it('deterministic and advection pure/deterministic', () => {
    const a = generateClouds(new Rng(3), o), b = generateClouds(new Rng(3), o);
    expect(a).toEqual(b);
    expect(generateClouds(new Rng(4), o)).not.toEqual(a);
    const snap = JSON.stringify(a);
    expect(advectClouds(a, 10, 100, 100)).toEqual(advectClouds(b, 10, 100, 100));
    expect(JSON.stringify(a)).toBe(snap);
  });
  it('transmittance bounded [0,1]; 1 with no clouds; dims under a blob', () => {
    expect(transmittance([], 5, 5)).toBe(1);
    expect(transmittance([{ x: 5, y: 5, radius: 3, opacity: 0.6, vx: 0, vy: 0 }], 5, 5)).toBeCloseTo(0.4, 12);
    expect(transmittance([{ x: 5, y: 5, radius: 3, opacity: 0.6, vx: 0, vy: 0 }], 90, 90)).toBe(1);
    for (let s = 1; s <= SEEDS; s++) {
      const rng = new Rng(s);
      let cl = generateClouds(rng, { ...o, count: 30 });
      for (let k = 0; k < 5; k++) {
        cl = advectClouds(cl, 7, 100, 100);
        const t = transmittance(cl, rng.range(0, 100), rng.range(0, 100));
        expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1);
      }
    }
  });
  it('advection moves blobs by v*blocks and wraps', () => {
    const c = advectClouds([{ x: 99, y: 1, radius: 1, opacity: 0.5, vx: 2, vy: -2 }], 1, 100, 100)[0]!;
    expect(c.x).toBeCloseTo(1, 12); expect(c.y).toBeCloseTo(99, 12);
  });
});
