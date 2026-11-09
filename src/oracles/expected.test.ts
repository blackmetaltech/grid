import { describe, expect, it } from 'vitest';
import { expected, expectOracle, level, oracle, oracleIds, oracleValue } from './expected';

const ids = [
  ...Array.from({ length: 22 }, (_, i) => `AC-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 28 }, (_, i) => `PS-${String(i + 1).padStart(2, '0')}`),
  'G-01', 'G-01b',
  ...Array.from({ length: 19 }, (_, i) => `G-${String(i + 2).padStart(2, '0')}`),
];

const sigDigits = (x: number) => (x === 0 ? 0 : String(x).replace(/^-/, '').replace(/e.*$/, '').replace('.', '').replace(/^0+/, '').length);

describe('oracle expected.json', () => {
  it('has exactly the 71 oracle ids', () => {
    expect(ids).toHaveLength(71);
    expect(oracleIds().sort()).toEqual([...ids].sort());
  });

  it('every row is complete and every value is finite', () => {
    for (const id of ids) {
      const o = oracle(id);
      expect(o.title).toBeTruthy();
      expect(o.source).toBeTruthy();
      expect(Object.keys(o.values).length).toBeGreaterThan(0);
      expect(Object.keys(o.units).sort()).toEqual(Object.keys(o.values).sort());
      for (const [k, v] of Object.entries(o.values)) expect(Number.isFinite(v), `${id}.${k}`).toBe(true);
      for (const k of Object.keys(o.printed)) expect(o.values, `${id}.${k}`).toHaveProperty(k);
      expect(['rel', 'abs']).toContain(o.tolKind);
    }
  });

  it('stores unrounded values (not the printed digits)', () => {
    // irrational results must carry full double precision
    for (const [id, k] of [['AC-02', 'Vrms_V'], ['AC-03', 'XL_ohm'], ['PS-15', 'V2_pu'], ['PS-24', 't_cr_s'], ['G-12', 'df_1s_Hz'], ['PS-16', 'slackP_MW']]) {
      expect(sigDigits(oracleValue(id, k)), `${id}.${k}`).toBeGreaterThanOrEqual(12);
    }
    // rounding-limited rows: stored value differs from the printed digits by more than the row tolerance
    for (const [id, k] of [['AC-02', 'Vrms_V'], ['AC-03', 'I_A'], ['PS-01', 'Zb_ohm'], ['PS-26', 'df_Hz'], ['G-06', 't_s']]) {
      const o = oracle(id);
      const e = oracleValue(id, k);
      const err = Math.abs(e - o.printed[k]) / Math.abs(o.printed[k]);
      expect(err, `${id}.${k}`).toBeGreaterThan(o.tol);
      expect(Math.abs(e - o.printed[k]), `${id}.${k}`).toBeLessThanOrEqual(o.printedHalfUlp[k] * (1 + 1e-9));
    }
  });

  it('printed values agree with stored values to printed precision (no wrong rows)', () => {
    for (const id of ids) {
      const o = oracle(id);
      for (const [k, p] of Object.entries(o.printed)) {
        expect(Math.abs(o.values[k] - p), `${id}.${k}`).toBeLessThanOrEqual(o.printedHalfUlp[k] * (1 + 1e-9));
      }
    }
  });

  it('helpers throw clear errors and check tolerances', () => {
    expect(() => oracle('XX-99')).toThrow(/unknown id/);
    expect(() => oracleValue('AC-01', 'nope')).toThrow(/unknown value/);
    expect(() => expectOracle('AC-01', 'I_A', 2.2)).not.toThrow();
    expect(() => expectOracle('AC-01', 'I_A', 2.3)).toThrow(/tol/);
  });

  it('has the five level tables, consistent with the DESIGN level cards', () => {
    expect(expected.meta.note).toMatch(/Naming/);
    for (const l of ['L03', 'L07', 'L15', 'L17', 'L19']) expect(level(l)).toBeTruthy();
    const l03 = level('L03').cables;
    expect(l03['25mm2'].V_far_V).toBeCloseTo(359.1, 1);
    expect(l03['35mm2'].loss_pct_exact).toBeCloseTo(4.05, 2);
    expect(l03['50mm2'].loss_pct_exact).toBeCloseTo(2.93, 2);
    expect(l03['25mm2'].loss_pct_naive).toBeCloseTo(5.03, 2);
    expect(level('L07').nocap.I_A).toBeCloseTo(122, 0);
    expect(level('L07').cap900.V_pu).toBeCloseTo(0.957, 3);
    expect(level('L15').A_mag).toBeCloseTo(0.932, 3);
    expect(level('L15').VR0_kV).toBeCloseTo(429.14, 2);
    const l17 = level('L17');
    expect(Math.round(l17.none_N1.Pmax_grid_MW)).toBe(266);
    expect(Math.round(l17.caps80_N1.Pmax_grid_MW)).toBe(290);
    expect(Math.round(l17.statcom100_N1.Pmax_grid_MW)).toBe(316);
    expect(Math.round(l17.statcom200_N1.Pmax_grid_MW)).toBe(368);
    expect(Math.round(l17.none_both.Pmax_grid_MW)).toBe(456);
    const l19 = level('L19');
    expect(l19.naive_12coal.nadir_Hz).toBeCloseTo(48.94, 2);
    expect(l19.coal13.nadir_Hz).toBeCloseTo(49.59, 2);
    expect(l19.coal13_bess200.nadir_Hz).toBeCloseTo(49.67, 2);
    expect(l19.naive_12coal.shed_MW).toBe(345);
    expect(l19.naive_bess200.nadir_Hz).toBeCloseTo(49.03, 2);
  });
});
