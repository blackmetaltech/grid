// Harmonic bench (DESIGN 3.5, L08): superposition at h x omega0 with reactances scaled explicitly (X_L -> h X_L,
// X_C -> X_C / h) as plain Z/Y elements, so the h = 1 case (P21) is an independent path from direct MNA at omega0.
import { cx, abs, dmath, ZERO, type Complex } from '@core/numerics';
import { GROUND, solveMna, type Elem, type BenchError } from './mna';

const TWO_PI = 2 * Math.PI;

/** Rewrite a network at harmonic h of w0 (rad/s): L -> Z = j h w0 L, C -> Y = j h w0 C, independent V -> 0, I -> 0 (unless keepSources). */
export function atHarmonic(net: Elem[], w0: number, h: number, keepSources = false): Elem[] {
  return net.map((e): Elem => {
    switch (e.kind) {
      case 'L': return { kind: 'Z', id: e.id, a: e.a, b: e.b, z: cx(0, h * w0 * e.h) };
      case 'C': return { kind: 'Y', id: e.id, a: e.a, b: e.b, y: cx(0, h * w0 * e.f) };
      case 'V': return keepSources ? e : { ...e, e: ZERO };
      case 'I': return keepSources ? e : { ...e, i: ZERO };
      default: return e;
    }
  });
}

/** THD = sqrt(sum V_h^2) / V_1 (same units in and out; returns a ratio). */
export function thd(fundamental: number, harmonics: number[]): number {
  let s = 0; for (const v of harmonics) s += v * v;
  return dmath.sqrt(s) / fundamental;
}

export interface HarmonicStudy {
  ok: true;
  /** Fundamental node voltage magnitude (V) and per-order magnitudes (V). */
  v1: number; vh: Record<number, number>;
  /** THD_V = sqrt(sum V_h^2)/V_1 (ratio). */
  thdV: number;
  /** Capacitor rms current including the fundamental, sqrt(I_1^2 + sum I_h^2) (A), and per-order magnitudes. */
  capRms: number; capH: Record<number, number>;
}

/** Superposition study: harmonic current I_h = I1/h injected at `node` (A); V_h there; capacitor `capId` currents. */
export function harmonicStudy(net: Elem[], w0: number, node: string, I1: number, capId: string, orders = [5, 7, 11, 13]): HarmonicStudy | { ok: false; error: BenchError } {
  const f = solveMna(net, w0);
  if (!f.ok) return f;
  const vh: Record<number, number> = {}; const capH: Record<number, number> = {};
  const i1 = abs(f.I[capId]);
  let ic2 = i1 * i1;
  for (const h of orders) {
    const hn = [...atHarmonic(net, w0, h), { kind: 'I', id: '__drive', a: GROUND, b: node, i: cx(I1 / h) } as Elem];
    const r = solveMna(hn, w0);
    if (!r.ok) return r;
    vh[h] = abs(r.V[node]); capH[h] = abs(r.I[capId]); ic2 += capH[h] * capH[h];
  }
  const v1 = abs(f.V[node]);
  return { ok: true, v1, vh, thdV: thd(v1, Object.values(vh)), capRms: dmath.sqrt(ic2), capH };
}

/** Driving-point impedance |Z(jw)| at `node` (ohm): 1 A probe with all sources zeroed. */
export function impedanceAt(net: Elem[], w: number, node: string): Complex | null {
  const probe: Elem[] = [...atHarmonic(net, w, 1), { kind: 'I', id: '__probe', a: GROUND, b: node, i: cx(1) }];
  const r = solveMna(probe, w);
  return r.ok ? r.V[node] : null;
}

export interface SweepPoint { f: number; z: number }
/** Impedance vs frequency 50..1000 Hz in 5 Hz steps (default) at `node`, with the largest-|Z| point (parallel resonance). */
export function impedanceSweep(net: Elem[], node: string, fMin = 50, fMax = 1000, step = 5): { points: SweepPoint[]; peak: SweepPoint } {
  const points: SweepPoint[] = [];
  for (let f = fMin; f <= fMax + 1e-9; f += step) {
    const z = impedanceAt(net, TWO_PI * f, node);
    points.push({ f, z: z ? abs(z) : Infinity });
  }
  let peak = points[0];
  for (const p of points) if (p.z > peak.z) peak = p;
  return { points, peak };
}

/** Parallel-resonance order of a plain capacitor bank, h_r = sqrt(S_sc / Q_c). */
export const hResonance = (sscMVA: number, qcMVAr: number): number => dmath.sqrt(sscMVA / qcMVAr);
/** Detuned bank (reactor fraction p of X_C): parallel resonance h_p = sqrt(1 / (Q_c/S_sc + p)). */
export const hParallelDetuned = (sscMVA: number, qcMVAr: number, p: number): number => dmath.sqrt(1 / (qcMVAr / sscMVA + p));
/** Series (tuning) order of the reactor-capacitor branch, h_s = 1 / sqrt(p). */
export const hSeries = (p: number): number => 1 / dmath.sqrt(p);
/** Effective reactive power of a detuned bank at fundamental, Q_eff = Q_c / (1 - p) (MVAr). */
export const qEffective = (qcMVAr: number, p: number): number => qcMVAr / (1 - p);

export interface BankParams { sscMVA: number; vkV: number; qcMVAr: number; p?: number; xOverR?: number }
/** Bench network: ideal source, grid R+L (X = kV^2/Ssc), detuned LC bank at node 'pcc' (X_C = kV^2/Q_c, X_L = p X_C), load drawing `loadI` A. */
export function capacitorBankNet(b: BankParams, f0: number, loadI = 0): Elem[] {
  const w0 = TWO_PI * f0;
  const xs = (b.vkV * b.vkV) / b.sscMVA, xc = (b.vkV * b.vkV) / b.qcMVAr, p = b.p ?? 0;
  const net: Elem[] = [
    { kind: 'V', id: 'grid', a: 'src', b: GROUND, e: cx(b.vkV * 1000) },
    { kind: 'R', id: 'Rs', a: 'src', b: 'x', r: xs / (b.xOverR ?? 20) },
    { kind: 'L', id: 'Ls', a: 'x', b: 'pcc', h: xs / w0 },
    { kind: 'C', id: 'Cb', a: 'pcc', b: p > 0 ? 'm' : GROUND, f: 1 / (w0 * xc) },
    { kind: 'I', id: 'load', a: 'pcc', b: GROUND, i: cx(loadI) },
  ];
  if (p > 0) net.push({ kind: 'L', id: 'Lr', a: 'm', b: GROUND, h: (p * xc) / w0 });
  return net;
}
