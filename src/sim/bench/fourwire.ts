// 4-wire unbalanced feeder (DESIGN 3.5, L10): poles a, b, c, n; EMFs behind a star point earthed through 1 ohm (S23).
import { cx, add, sub, abs, polarDeg, type Complex } from '@core/numerics';
import { GROUND, solveMna, type Elem, type BenchError } from './mna';

export interface FourWireSegment {
  /** Phase and neutral conductor impedance of this run (ohm, whole run). */
  zPhase: Complex; zNeutral: Complex;
}
export type PhaseLoad = { kind: 'Z'; z: Complex } | { kind: 'I'; i: Complex };
export interface FourWireLoad { /** Pole level (1 = after first segment). */ at: number; a: PhaseLoad; b: PhaseLoad; c: PhaseLoad }
export interface FourWireInput {
  /** Phase-to-neutral EMF (V rms); phases a, b, c at 0, -120, +120 degrees. */
  vPhase: number;
  segments: FourWireSegment[];
  loads: FourWireLoad[];
  /** Star-point earthing resistance (ohm), default 1. */
  earthR?: number;
  /** Angular frequency (default 0 = resistive only). */
  w?: number;
}
export interface FourWireResult {
  ok: true;
  /** Neutral current on the first segment toward the source, I_a + I_b + I_c (A). */
  iN: Complex;
  /** Phase-to-neutral voltage at every level (index 0 = source). */
  vPN: { a: Complex; b: Complex; c: Complex }[];
  /** Neutral shift V(n_end) - V(n_0) at each level (V). */
  neutralShift: Complex[];
  /** Raw node voltages. */
  V: Record<string, Complex>;
}

/** Solve the four-wire feeder: I_N = I_a + I_b + I_c, neutral shift = V_n(level) - V_n(source). Never throws. */
export function solveFourWire(inp: FourWireInput): FourWireResult | { ok: false; error: BenchError } {
  const ph = ['a', 'b', 'c'] as const; const ang = { a: 0, b: -120, c: 120 };
  const el: Elem[] = [];
  for (const p of ph) el.push({ kind: 'V', id: `E${p}`, a: `${p}0`, b: 'n0', e: polarDeg(inp.vPhase, ang[p]) });
  el.push({ kind: 'R', id: 'earth', a: 'n0', b: GROUND, r: inp.earthR ?? 1 });
  inp.segments.forEach((s, k) => {
    const L = k + 1;
    for (const p of ph) el.push({ kind: 'Z', id: `${p}seg${L}`, a: `${p}${L - 1}`, b: `${p}${L}`, z: s.zPhase });
    el.push({ kind: 'Z', id: `nseg${L}`, a: `n${L}`, b: `n${L - 1}`, z: s.zNeutral });
  });
  inp.loads.forEach((ld, k) => {
    for (const p of ph) {
      const l = ld[p]; const a = `${p}${ld.at}`, b = `n${ld.at}`;
      el.push(l.kind === 'Z' ? { kind: 'Z', id: `load${k}${p}`, a, b, z: l.z } : { kind: 'I', id: `load${k}${p}`, a, b, i: l.i });
    }
  });
  const r = solveMna(el, inp.w ?? 0);
  if (!r.ok) return r;
  const levels = inp.segments.length + 1;
  const vPN = Array.from({ length: levels }, (_, L) => ({ a: sub(r.V[`a${L}`], r.V[`n${L}`]), b: sub(r.V[`b${L}`], r.V[`n${L}`]), c: sub(r.V[`c${L}`], r.V[`n${L}`]) }));
  const neutralShift = Array.from({ length: levels }, (_, L) => sub(r.V[`n${L}`], r.V.n0));
  return { ok: true, iN: r.I.nseg1 ?? cx(0), vPN, neutralShift, V: r.V };
}

/** Phasor sum 1 + a + a^2 with a = 1 at 120 degrees (balanced three-phase, zero). */
export function balancedSum(): number {
  const a = polarDeg(1, 120), a2 = polarDeg(1, 240);
  return abs(add(add(cx(1), a), a2));
}
