import { describe, it, expect } from 'vitest';
import { rk4Step } from '@core/numerics';
import { oracleValue } from '../../oracles/expected';
import {
  deadZone, govPm, govAuxDot, govValveDot, govTG, clipHeadroom, bessDot, bessOutput, govSteadyPm,
  STEAM_TG_S, STEAM_TRH_S, STEAM_FHP, GAS_TG_S, HYDRO_TG_S, HYDRO_TW_S,
} from './governors';

describe('governors', () => {
  it('G-13 hydro inverse response: y(0+) = -2, y(1 s) = 1 - 3 e^-1 for T_W = 2 s unit step (RK4)', () => {
    const p = { tW: 2 };
    expect(govPm('hydro', p, 1, 0)).toBe(oracleValue('G-13', 'y0plus'));
    let w = [0];
    const h = 0.01;
    for (let i = 0; i < 100; i++) w = rk4Step((_t, y) => [govAuxDot('hydro', p, 1, y[0])], i * h, w, h);
    expect(Math.abs(govPm('hydro', p, 1, w[0]) - oracleValue('G-13', 'y_1s'))).toBeLessThan(1e-9);
  });
  it('defaults match DESIGN 3.6 (S25/S26)', () => {
    expect([STEAM_TG_S, STEAM_TRH_S, STEAM_FHP, GAS_TG_S, HYDRO_TG_S, HYDRO_TW_S]).toEqual([0.2, 7, 0.3, 0.5, 0.5, 1.5]);
    expect(govTG('steam')).toBe(0.2); expect(govTG('gas')).toBe(0.5); expect(govTG('hydro')).toBe(0.5); expect(govTG('gas', { tG: 0.9 })).toBe(0.9);
  });
  it('steam: HP fraction jumps immediately, reheat part follows with T_RH', () => {
    expect(govPm('steam', {}, 10, 0)).toBeCloseTo(3, 12);
    expect(govPm('steam', {}, 10, 10)).toBeCloseTo(10, 12);
    expect(govAuxDot('steam', {}, 7, 0)).toBeCloseTo(1, 12);
    expect(govAuxDot('gas', {}, 7, 0)).toBe(0);
  });
  it('valve follows -(S/R) dw_e with time constant T_G', () => {
    expect(govValveDot(0.5, 20000, -0.01, 0)).toBeCloseTo(400, 9);
    expect(govSteadyPm(20000, -0.01)).toBeCloseTo(200, 9);
  });
  it('offset dead-zone has no jump, is odd, and is zero inside the band', () => {
    const db = 0.0002;
    expect(deadZone(0.0001, db)).toBe(0); expect(deadZone(-0.0002, db)).toBe(0);
    expect(deadZone(0.0003, db)).toBeCloseTo(0.0001, 15);
    expect(deadZone(-0.0003, db)).toBeCloseTo(-0.0001, 15);
    expect(deadZone(0.00020001, db)).toBeLessThan(1e-7);
    expect(deadZone(-0.5, 0)).toBe(-0.5);
  });
  it('headroom limits: dPm in [Pmin - P0, Pmax - P0]; BESS +/-P_rated and energy budget', () => {
    expect(clipHeadroom(100, -50, 40)).toBe(40); expect(clipHeadroom(-100, -50, 40)).toBe(-50); expect(clipHeadroom(5, -50, 40)).toBe(5);
    expect(bessOutput(300, 200, 0, Infinity)).toBe(200); expect(bessOutput(-300, 200, 0, Infinity)).toBe(-200);
    expect(bessOutput(100, 200, 5, 5)).toBe(0); expect(bessOutput(-100, 200, 5, 5)).toBe(-100);
  });
  it('BESS FFR: steady output = -(P_rated/R_b) dw_e, T_B lag', () => {
    expect(bessDot(200, 0.01, 0.2, -0.001, 0)).toBeCloseTo(100, 9);
    expect(bessDot(200, 0.01, 0.2, -0.001, 20)).toBeCloseTo(0, 9);
  });
});
