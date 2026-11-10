// Gauss-Seidel load flow (with optional acceleration). Used only for the L18 bridge, the Codex lab and the oracle tests.
import { dmath as dm } from '@core/numerics';
import { loadAt, type LFCase } from './case';

export interface GsState { re: number[]; im: number[] }

export interface GsResult {
  converged: boolean;
  iterations: number;
  V: number[]; th: number[];
  /** Largest power mismatch at the end (pu). */
  mismatch: number;
}

/** Complex voltage vector from magnitudes and angles (rad). */
export function gsFrom(V: number[], th: number[]): GsState {
  const sc: [number, number] = [0, 0];
  const re: number[] = [], im: number[] = [];
  for (let i = 0; i < V.length; i++) { dm.sincos(th[i]!, sc); re.push(V[i]! * sc[1]); im.push(V[i]! * sc[0]); }
  return { re, im };
}

/**
 * One Gauss-Seidel sweep in bus order, each bus using the newest voltages: PQ: V_i <- (1/Y_ii)[(P - jQ)/conj(V_i) - sum_k Y_ik V_k];
 * PV: Q_i = -Im(conj(V_i) sum_k Y_ik V_k) first, then the same update with |V_i| rescaled to the set-point; V <- V + accel (V_new - V).
 * Returns Q at each PV bus visited (pu), by bus index.
 */
export function gsSweep(c: LFCase, st: GsState, accel = 1): Map<number, number> {
  const qpv = new Map<number, number>();
  for (let i = 0; i < c.n; i++) {
    if (i === c.slack) continue;
    const vr = st.re[i]!, vi = st.im[i]!;
    // Y_ik V_k for k != i
    let sr = 0, si = 0;
    for (const k of c.adj[i]!) {
      const g = c.G[i]![k]!, b = c.B[i]![k]!;
      sr += g * st.re[k]! - b * st.im[k]!; si += g * st.im[k]! + b * st.re[k]!;
    }
    const gii = c.G[i]![i]!, bii = c.B[i]![i]!;
    const mag = Math.sqrt(vr * vr + vi * vi);
    const [pl, ql] = loadAt(c, i, mag);
    const P = c.pg[i]! - pl;
    let Q: number;
    if (c.reg[i]) {
      // I_i = Y_ii V_i + sum ; S = V conj(I) ; Q = Im(S) (injection)
      const ir = gii * vr - bii * vi + sr, ii = gii * vi + bii * vr + si;
      Q = vi * ir - vr * ii; // Im(V conj(I))
      qpv.set(i, Q + ql - c.qg[i]!);
    } else Q = c.qg[i]! - ql;
    // numerator (P - jQ)/conj(V) = (P - jQ)(vr + j vi)/|V|^2
    const m2 = vr * vr + vi * vi;
    const nr = (P * vr + Q * vi) / m2, ni = (P * vi - Q * vr) / m2;
    const tr = nr - sr, ti = ni - si;
    const d = gii * gii + bii * bii;
    let wr = (tr * gii + ti * bii) / d, wi = (ti * gii - tr * bii) / d;
    wr = vr + accel * (wr - vr); wi = vi + accel * (wi - vi);
    if (c.reg[i]) { const m = Math.sqrt(wr * wr + wi * wi); wr *= c.vSet[i]! / m; wi *= c.vSet[i]! / m; }
    st.re[i] = wr; st.im[i] = wi;
  }
  return qpv;
}

function mismatchOf(c: LFCase, st: GsState): number {
  let worst = 0;
  for (let i = 0; i < c.n; i++) {
    if (i === c.slack) continue;
    let ir = 0, ii = 0;
    for (let k = 0; k < c.n; k++) { const g = c.G[i]![k]!, b = c.B[i]![k]!; if (g === 0 && b === 0) continue; ir += g * st.re[k]! - b * st.im[k]!; ii += g * st.im[k]! + b * st.re[k]!; }
    const vr = st.re[i]!, vi = st.im[i]!;
    const p = vr * ir + vi * ii, q = vi * ir - vr * ii;
    const mag = Math.sqrt(vr * vr + vi * vi);
    const [pl, ql] = loadAt(c, i, mag);
    worst = Math.max(worst, Math.abs(c.pg[i]! - pl - p));
    if (!c.reg[i]) worst = Math.max(worst, Math.abs(c.qg[i]! - ql - q));
  }
  return worst;
}

/** Iterate sweeps until the power mismatch < tol (default 1e-10 pu) or maxIter. Q limits are ignored (textbook GS). */
export function solveGS(c: LFCase, opts: { maxIter?: number; tol?: number; accel?: number; start?: { V: number[]; th: number[] } } = {}): GsResult {
  const maxIter = opts.maxIter ?? 5000, tol = opts.tol ?? 1e-10, accel = opts.accel ?? 1;
  const V0 = opts.start?.V ?? c.ids.map((_, i) => (c.reg[i] ? c.vSet[i]! : 1));
  const th0 = opts.start?.th ?? c.ids.map(() => 0);
  V0[c.slack] = c.slackV;
  const st = gsFrom(V0, th0);
  let it = 0, mm = mismatchOf(c, st);
  while (mm >= tol && it < maxIter) {
    gsSweep(c, st, accel); it++;
    mm = mismatchOf(c, st);
    if (!(mm < 1e12)) break;
  }
  const V = st.re.map((r, i) => Math.sqrt(r * r + st.im[i]! * st.im[i]!));
  const th = st.re.map((r, i) => dm.atan2(st.im[i]!, r));
  return { converged: mm < tol, iterations: it, V, th, mismatch: mm };
}
