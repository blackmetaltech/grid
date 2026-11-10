// Route module tests: oracles S-01..S-08 from tools/oracles/route_expected.json (independent script) plus properties.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ACSR_MECH } from '../../data/conductors';
import { SUPPORT_FAMILIES } from '../../data/supports';
import {
  conductorTempC, flatSpanMargin, groundAt, insulatorUnits, kindAt, parseTerrain, planRoute, sagCatenary, sagParabola, stateChange, tileIndexAt, umKv, weightNPerM,
  DISC_CREEPAGE_MM, FOG_DISC_CREEPAGE_MM, PIN_CREEPAGE_MM,
  type RouteRequest, type RouteRules, type Terrain,
} from './index';

const EXP = JSON.parse(readFileSync(fileURLToPath(new URL('../../../tools/oracles/route_expected.json', import.meta.url)), 'utf8'));
const cond = (id: string) => ACSR_MECH.find((c) => c.id === id)!;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const rules: RouteRules = {
  everydayFrac: 0.2, everydayC: 15, designC: 75, groundClearanceM: 6.0, waterClearanceM: 8, roadExtraM: 1, insulatorDropM: 0,
  noSupport: ['river', 'sea'], noOverhead: ['town'],
};
const flat = (rows: string[]): Terrain => parseTerrain(rows, 50, () => 0);
const field = (cols = 12, nrows = 4): Terrain => flat(Array.from({ length: nrows }, () => 'f'.repeat(cols)));
const req = (over: Partial<RouteRequest> = {}): RouteRequest => ({ waypoints: [[25, 100], [525, 100]], familyId: 'pcc-11', crossingFamilyId: null, conductorId: 'acsr-rabbit', kv: 11, spanM: 100, ...over });
const plan = (t: Terrain, r: RouteRequest, ru = rules) => planRoute(t, r, ru, SUPPORT_FAMILIES, ACSR_MECH);

describe('oracles', () => {
  const dog = cond('acsr-dog'), H = 0.2 * dog.utsN, w = weightNPerM(dog);
  it('S-01 parabolic sag', () => { expect(rel(sagParabola(w, 100, H), EXP['S-01'].sag_m)).toBeLessThan(1e-6); expect(rel(w, EXP['S-01'].w_N_per_m)).toBeLessThan(1e-6); });
  it('S-02 catenary vs parabola', () => {
    const c = sagCatenary(w, 100, H);
    expect(rel(c, EXP['S-02'].catenary_m)).toBeLessThan(1e-6);
    expect(Math.abs(c - sagParabola(w, 100, H)) / c).toBeLessThan(1e-3);
  });
  it('S-03 state change', () => {
    const H2 = stateChange(dog, 100, H, 15, 75);
    expect(rel(H2, EXP['S-03'].H2_N)).toBeLessThan(1e-6);
    expect(rel(sagParabola(w, 100, H2), EXP['S-03'].sag_hot_m)).toBeLessThan(1e-6);
  });
  it('S-04 Rabbit hot sag and margins (attach 9.0, required 6.0, drop 0)', () => {
    const rabbit = cond('acsr-rabbit');
    for (const L of [70, 100, 130]) {
      const e = EXP['S-04'][String(L)];
      const H2 = stateChange(rabbit, L, 0.2 * rabbit.utsN, 15, 75);
      expect(rel(H2, e.H2_N)).toBeLessThan(1e-6);
      expect(rel(sagParabola(weightNPerM(rabbit), L, H2), e.sag_hot_m)).toBeLessThan(1e-6);
      expect(Math.abs(flatSpanMargin(rabbit, rules, L, 9.0, 6.0) - e.margin_m)).toBeLessThan(1e-6);
    }
    // through the planner (pcc-11 attach 9.0): the span's midpoint is a sample
    for (const L of [70, 100]) {
      const r = plan(field(), req({ waypoints: [[25, 100], [25 + L, 100]], spanM: L }));
      if (!r.ok) throw new Error('refused');
      expect(Math.abs(r.worstMarginM - EXP['S-04'][String(L)].margin_m)).toBeLessThan(1e-6);
      expect(r.spans[0]!.requiredM).toBe(6);
    }
  });
  it('S-04b max flat wood span with Rabbit = 88 m', () => {
    const rabbit = cond('acsr-rabbit');
    const best = EXP['S-04b'].wood_rabbit_max_flat_span_m;
    expect(best).toBe(88);
    expect(flatSpanMargin(rabbit, rules, 88, 7.5, 6)).toBeGreaterThanOrEqual(0);
    expect(flatSpanMargin(rabbit, rules, 89, 7.5, 6)).toBeLessThan(0);
  });
  it('S-05 creepage counts', () => {
    expect(umKv(11) * 25).toBe(EXP['S-05'].classIII_25_mm);
    expect(PIN_CREEPAGE_MM >= umKv(11) * 25).toBe(EXP['S-05'].pin320_passes_III);
    expect(umKv(11) * 31).toBe(EXP['S-05'].classIV_31_mm);
    expect(insulatorUnits(11, 4, DISC_CREEPAGE_MM)).toBe(EXP['S-05'].discs295_for_IV);
    expect(insulatorUnits(11, 4, FOG_DISC_CREEPAGE_MM)).toBe(EXP['S-05'].fogdiscs430_for_IV);
    expect(insulatorUnits(11, 3, PIN_CREEPAGE_MM)).toBe(1);
    expect([umKv(33), umKv(66), umKv(132), umKv(22)]).toEqual([36, 72.5, 145, 22 * 1.1]);
  });
  it('S-06 angle classes', () => {
    const cls = (deg: number) => {
      const rad = (deg * Math.PI) / 180; // test-side geometry only; the planner uses dmath
      const t = field(30, 30);
      const r = plan(t, req({ waypoints: [[100, 500], [600, 500], [600 + 500 * Math.round(Math.cos(rad) * 1e9) / 1e9, 500 + 500 * Math.round(Math.sin(rad) * 1e9) / 1e9]], spanM: 100 }));
      if (!r.ok) throw new Error(JSON.stringify(r.refusal));
      return r.supports.find((s) => Math.abs(s.x - 600) < 1e-6 && Math.abs(s.y - 500) < 1e-6)!.angleClass;
    };
    expect(cls(25)).toBe(EXP['S-06']['25deg']);
    expect(cls(2.5)).toBe(EXP['S-06']['2.5deg']);
    expect(cls(45)).toBe(EXP['S-06']['45deg']);
    expect(cls(1)).toBe('suspension');
  });
  it('S-08 conductor temperature', () => { expect(Math.abs(conductorTempC(0.8, 1, 45, 75) - EXP['S-08'].T_c)).toBeLessThan(1e-9); });
});

describe('terrain', () => {
  const t = parseTerrain(['eeff', 'ffsf', 'ffff', 'ffff'], 10, (i, j) => i + 10 * j);
  it('kinds, lookup, off-map', () => {
    expect(kindAt(t, 5, 5)).toBe('sea'); expect(kindAt(t, 25, 15)).toBe('swamp');
    expect(tileIndexAt(t, 39.9, 39.9)).toBe(15); expect(tileIndexAt(t, -1, 5)).toBeNull(); expect(tileIndexAt(t, 40, 5)).toBeNull();
  });
  it('bilinear ground, clamped', () => {
    expect(groundAt(t, 5, 5)).toBe(0); expect(groundAt(t, 15, 5)).toBe(1); expect(groundAt(t, 10, 5)).toBeCloseTo(0.5, 12);
    expect(groundAt(t, 0, 0)).toBe(0); expect(groundAt(t, 40, 40)).toBe(33);
  });
  it('pollution from sea distance', () => {
    const big = parseTerrain(['e' + 'f'.repeat(9), ...Array.from({ length: 3 }, () => 'f'.repeat(10))], 10, () => 0);
    expect(big.pollution[0]).toBe(3); expect(big.pollution[2]).toBe(3); expect(big.pollution[3]).toBe(2); expect(big.pollution[6]).toBe(2); expect(big.pollution[7]).toBe(1);
    const sw = parseTerrain(['e' + 'f'.repeat(4) + 's'], 10, () => 0);
    expect(sw.pollution[5]).toBe(3);
  });
});

describe('sag properties', () => {
  const rb = cond('acsr-rabbit'), w = weightNPerM(rb), H1 = 0.2 * rb.utsN;
  it('sag grows with span and temperature', () => {
    let prev = 0;
    for (let L = 40; L <= 160; L += 20) { const d = sagParabola(w, L, stateChange(rb, L, H1, 15, 75)); expect(d).toBeGreaterThan(prev); prev = d; }
    let p2 = 0;
    for (let T = -10; T <= 90; T += 20) { const d = sagParabola(w, 100, stateChange(rb, 100, H1, 15, T)); expect(d).toBeGreaterThan(p2); p2 = d; }
    expect(stateChange(rb, 100, H1, 15, 15)).toBeCloseTo(H1, 6);
  });
});

describe('planRoute', () => {
  it('margin rises with attach height', () => {
    const m = (id: string) => { const r = plan(field(), req({ familyId: id, kv: 11, spanM: 70 })); if (!r.ok) throw new Error('x'); return r.worstMarginM; };
    expect(m('pcc-11')).toBeGreaterThan(m('wood-9') - 1e-9 + 0 * 1);
    expect(m('tubular-13')).toBeGreaterThan(m('pcc-11'));
  });
  it('straight route: length equals straight-line distance, equal spans', () => {
    const r = plan(field(), req({ waypoints: [[25, 25], [425, 25]], spanM: 90 }));
    if (!r.ok) throw new Error('x');
    expect(r.lengthM).toBeCloseTo(400, 9);
    expect(r.spans.length).toBe(5);
    expect(r.supports[0]!.angleClass).toBe('terminal');
    expect(r.supports[2]!.angleClass).toBe('suspension');
    expect(r.bom.supports['pcc-11']!.terminal).toBe(2);
  });
  it('bent route is longer than the chord', () => {
    const r = plan(field(), req({ waypoints: [[25, 25], [325, 25], [325, 175]], spanM: 100 }));
    if (!r.ok) throw new Error('x');
    expect(r.lengthM).toBeGreaterThanOrEqual(Math.sqrt(300 * 300 + 150 * 150));
  });
  const riverMap = flat(Array.from({ length: 4 }, () => 'ffff' + 'rrr' + 'ffff'));
  const across = [[25, 100], [525, 100]] as [number, number][];
  it('150 m river: refused with pcc-11, passes with crossing-h', () => {
    const a = plan(riverMap, req({ waypoints: across }));
    expect(a).toEqual({ ok: false, refusal: { key: 'route.noSupportGapTooLong', gapM: expect.any(Number), maxSpanM: 100, familyId: 'pcc-11' } });
    const b = plan(riverMap, req({ waypoints: across, crossingFamilyId: 'crossing-h' }));
    if (!b.ok) throw new Error(JSON.stringify(b.refusal));
    const gap = b.spans.find((s) => s.over.includes('river'))!;
    expect(gap.lengthM).toBeGreaterThan(150); expect(gap.lengthM).toBeLessThanOrEqual(300);
    expect(gap.ok).toBe(true);
    const banks = b.supports.filter((s) => s.familyId === 'crossing-h');
    expect(banks.length).toBe(2); expect(banks.every((s) => s.angleClass === 'large')).toBe(true);
    expect(b.bom.supports['crossing-h']!.large).toBe(2);
  });
  it('swamp: wood-9 refused (noFoundation), pcc-11 with pile', () => {
    const t = flat(Array.from({ length: 4 }, () => 'ffsfffffffff'));
    const a = plan(t, req({ familyId: 'wood-9', spanM: 70, waypoints: [[25, 100], [325, 100]] }));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.refusal).toMatchObject({ key: 'route.noFoundation', kind: 'swamp', familyId: 'wood-9', needs: 'pile' });
    const b = plan(t, req({ spanM: 75, waypoints: [[25, 100], [325, 100]] }));
    if (!b.ok) throw new Error(JSON.stringify(b.refusal));
    expect(b.bom.foundations.pile).toBeGreaterThan(0);
  });
  it('25 degree bend gives exactly one medium support', () => {
    const rad = (25 * Math.PI) / 180;
    const t = field(30, 30);
    const r = plan(t, req({ waypoints: [[100, 500], [600, 500], [600 + 400 * Math.cos(rad), 500 + 400 * Math.sin(rad)]], spanM: 100 }));
    if (!r.ok) throw new Error('x');
    expect(r.bom.supports['pcc-11']!.medium).toBe(1);
  });
  it('other refusals', () => {
    const t = flat(['ffffffff', 'fftttfff', 'ffffffff']);
    expect(plan(t, req({ waypoints: [[25, 75], [375, 75]] }))).toMatchObject({ ok: false, refusal: { key: 'route.noOverhead', kind: 'town' } });
    expect(plan(t, req({ familyId: 'zz' }))).toMatchObject({ refusal: { key: 'route.unknownFamily' } });
    expect(plan(t, req({ conductorId: 'zz' }))).toMatchObject({ refusal: { key: 'route.unknownConductor' } });
    expect(plan(t, req({ kv: 33, familyId: 'wood-9' }))).toMatchObject({ refusal: { key: 'route.kvTooHigh', kvMax: 11 } });
    expect(plan(t, req({ spanM: 150 }))).toMatchObject({ refusal: { key: 'route.spanTooLong', maxSpanM: 100 } });
    expect(plan(t, req({ waypoints: [[25, 25]] }))).toMatchObject({ refusal: { key: 'route.tooShort' } });
    expect(plan(t, req({ waypoints: [[25, 25], [999, 25]] }))).toMatchObject({ refusal: { key: 'route.offMap' } });
  });
  it('forest metres and road clearance', () => {
    const t = flat(['ffwwffffffff', 'ffwwffffffff']);
    const r = plan(t, req({ waypoints: [[25, 25], [575, 25]], spanM: 100 }));
    if (!r.ok) throw new Error('x');
    expect(Math.abs(r.bom.clearedForestM - 100)).toBeLessThan(10);
    const t2 = flat(['ffffdfffffff', 'ffffdfffffff']);
    const r2 = plan(t2, req({ waypoints: [[25, 25], [575, 25]], spanM: 100 }));
    if (!r2.ok) throw new Error('x');
    expect(r2.spans.some((s) => s.over.includes('road') && s.requiredM === 7)).toBe(true);
  });
  it('deterministic', () => {
    const a = plan(riverMap, req({ waypoints: across, crossingFamilyId: 'crossing-h' }));
    const b = plan(riverMap, req({ waypoints: across, crossingFamilyId: 'crossing-h' }));
    expect(a).toEqual(b);
  });
});
