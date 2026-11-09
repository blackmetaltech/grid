// Textbook-oracle tests for the sample rule module. Real games need ≥ 40 worked problems from standard texts (PROGRAM.md).
import { describe, expect, it } from 'vitest';
import { RIG } from '../state';
import { advance, dhdt, outflow, steadyDepth, valveFor } from './hydraulics';

describe('Torricelli tank', () => {
  it('efflux speed √(2gh): h = 1.1 m → 4.645 m/s (hand calculation)', () => {
    expect(outflow(1.1) / (RIG.Cd * RIG.a)).toBeCloseTo(Math.sqrt(2 * 9.80665 * 1.1), 10);
    expect(outflow(1.1) / (RIG.Cd * RIG.a)).toBeCloseTo(4.6448, 3);
  });
  it('an empty tank has no outflow', () => { expect(outflow(0)).toBe(0); expect(outflow(-1)).toBe(0); });
  it('steady depth balances inflow and outflow', () => {
    for (const v of [0.1, 0.4, 0.63, 0.9]) expect(dhdt(steadyDepth(v), v)).toBeCloseTo(0, 12);
  });
  it('valveFor inverts steadyDepth', () => { for (const h of [0.2, 1.1, 1.9]) expect(steadyDepth(valveFor(h))).toBeCloseTo(h, 10); });
  it('a fixed valve converges to the steady depth', () => {
    let h = 0.3; for (let i = 0; i < 400; i++) h = advance(h, 0.63, RIG.dt);
    expect(h).toBeCloseTo(steadyDepth(0.63), 4);
  });
  it('draining matches the closed form √h(t) = √h0 − (Cd a/A)√(g/2) t', () => {
    const h0 = 1.5, t = 200; const k = (RIG.Cd * RIG.a / RIG.A) * Math.sqrt(RIG.g / 2);
    const exact = (Math.sqrt(h0) - k * t) ** 2;
    expect(advance(h0, 0, t, RIG, 400)).toBeCloseTo(exact, 6);
  });
  it('mass is conserved over a step: A·Δh = ∫(q_in − q_out) dt (trapezoid estimate within 0.5 %)', () => {
    const h0 = 0.5, v = 0.8, dt = 10; const h1 = advance(h0, v, dt);
    const net = (v * RIG.qMax - (outflow(h0) + outflow(h1)) / 2) * dt;
    expect(RIG.A * (h1 - h0)).toBeCloseTo(net, 4);
  });
});
