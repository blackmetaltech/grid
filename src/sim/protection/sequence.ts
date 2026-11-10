// Sequence networks for fault studies (DESIGN 3.8): Z1 = Z2 except generators' X2, Z0 by transformer vector group (S6).
import { cx, type Complex } from '@core/numerics';
import { branchY, buildYbus, cmpId, type Net, type Ybus } from '../network';

/** Transformer winding connection, HV ("from") side first: YNyn passes Z0; YNd = YN on from; Dyn = YN on to; Yy and Dd are open. */
export type VectorGroup = 'YNyn' | 'YNd' | 'Dyn' | 'Yy' | 'Dd';

/** Generator in the fault network: sub-transient X''d (pu) in Z1, X2 (default X''d), X0 (default 0.5 X''d), neutral impedance Zn (pu; null = ungrounded). */
export interface FaultGen {
  bus: string;
  x1: number;
  x2?: number;
  x0?: number;
  zn?: { r: number; x: number } | null;
  online?: boolean;
}

/** Branch kind for the zero-sequence model; branches without an entry are lines with Z0 = 3 Z1. */
export interface FaultBranchInfo {
  kind: 'line' | 'xfmr';
  group?: VectorGroup;
  /** Catalogue Z0 (pu); defaults to 3 Z1 for lines and Z1 for transformers (X0 = X1, PS conventions). */
  z0?: { r: number; x: number };
}

export interface FaultModel {
  net: Net;
  gens: FaultGen[];
  branchInfo?: Record<string, FaultBranchInfo>;
}

export interface SeqMatrices {
  yb: Ybus;
  Y1: Complex[][];
  Y2: Complex[][];
  Y0: Complex[][];
  /** Merged-bus flags: has an in-service generator (anchor for Z1/Z2). */
  hasGen: boolean[];
}

/** Zero-sequence series impedance (pu) of a branch (3 Z1 for lines by default, S6). */
export function branchZ0(model: FaultModel, id: string): { r: number; x: number } {
  const br = model.net.branches.find((b) => b.id === id)!;
  const info = model.branchInfo?.[id];
  if (info?.z0) return info.z0;
  return info?.kind === 'xfmr' ? { r: br.r, x: br.x } : { r: 3 * br.r, x: 3 * br.x };
}

const cinv = (r: number, x: number): Complex => { const d = r * r + x * x; return d > 0 ? cx(r / d, -x / d) : cx(0, 0); };

/** Y1 = Y2 = Y_bus + sum 1/(jX) at generator buses; Y0 from line 3Z1 and vector-group rules; gen X0 through 3 Zn. Loads neglected (S5). */
export function sequenceMatrices(model: FaultModel): SeqMatrices {
  const yb = buildYbus(model.net);
  const n = yb.ids.length;
  const mk = (): Complex[][] => Array.from({ length: n }, () => Array.from({ length: n }, () => cx(0, 0)));
  const Y1 = mk(), Y2 = mk(), Y0 = mk();
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { Y1[i]![k] = cx(yb.G[i]![k]!, yb.B[i]![k]!); Y2[i]![k] = cx(yb.G[i]![k]!, yb.B[i]![k]!); }
  const hasGen = new Array<boolean>(n).fill(false);
  const add = (M: Complex[][], i: number, k: number, y: Complex): void => { M[i]![k] = cx(M[i]![k]!.re + y.re, M[i]![k]!.im + y.im); };
  for (const g of model.gens) {
    if (g.online === false) continue;
    const i = yb.index.get(yb.mergedInto[g.bus] ?? '');
    if (i === undefined || !(g.x1 > 0)) continue;
    hasGen[i] = true;
    add(Y1, i, i, cinv(0, g.x1));
    add(Y2, i, i, cinv(0, g.x2 ?? g.x1));
    if (g.zn !== null) { // grounded: Z0 = jX0 + 3 Zn
      const zn = g.zn ?? { r: 0, x: 0 };
      add(Y0, i, i, cinv(3 * zn.r, (g.x0 ?? 0.5 * g.x1) + 3 * zn.x));
    }
  }
  for (const br of model.net.branches.slice().sort((a, b) => cmpId(a.id, b.id))) {
    if (!br.inService || yb.ties.includes(br.id)) continue;
    const f = yb.index.get(yb.mergedInto[br.from]!)!, t = yb.index.get(yb.mergedInto[br.to]!)!;
    const info = model.branchInfo?.[br.id];
    const z0 = branchZ0(model, br.id);
    const y0 = cinv(z0.r, z0.x);
    const neg = cx(-y0.re, -y0.im);
    if (info?.kind === 'xfmr') {
      const grp = info.group ?? 'YNyn';
      if (grp === 'YNyn') { add(Y0, f, f, y0); add(Y0, t, t, y0); add(Y0, f, t, neg); add(Y0, t, f, neg); }
      else if (grp === 'YNd') add(Y0, f, f, y0);
      else if (grp === 'Dyn') add(Y0, t, t, y0);
    } else { add(Y0, f, f, y0); add(Y0, t, t, y0); add(Y0, f, t, neg); add(Y0, t, f, neg); }
  }
  return { yb, Y1, Y2, Y0, hasGen };
}

/** Zero-sequence current into a branch end (complex pu) for end voltages v0f, v0t: line/YNyn y0 (V_f - V_t); YNd only at from; Dyn only at to. */
export function branchI0(model: FaultModel, id: string, v0f: Complex, v0t: Complex): { from: Complex; to: Complex } {
  const info = model.branchInfo?.[id];
  const z0 = branchZ0(model, id), y = cinv(z0.r, z0.x);
  const mulc = (a: Complex, b: Complex): Complex => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const d = mulc(y, cx(v0f.re - v0t.re, v0f.im - v0t.im));
  const grp = info?.kind === 'xfmr' ? (info.group ?? 'YNyn') : 'line';
  if (grp === 'line' || grp === 'YNyn') return { from: d, to: cx(-d.re, -d.im) };
  if (grp === 'YNd') return { from: mulc(y, v0f), to: cx(0, 0) };
  if (grp === 'Dyn') return { from: cx(0, 0), to: mulc(y, v0t) };
  return { from: cx(0, 0), to: cx(0, 0) };
}

/** Pi-model positive/negative-sequence end currents for end voltages: I_f = Y_ff V_f + Y_ft V_t, I_t = Y_tf V_f + Y_tt V_t (pu). */
export function branchI12(br: Parameters<typeof branchY>[0], vf: Complex, vt: Complex): { from: Complex; to: Complex } {
  const y = branchY(br);
  return {
    from: cx(y.ffRe * vf.re - y.ffIm * vf.im + y.ftRe * vt.re - y.ftIm * vt.im, y.ffRe * vf.im + y.ffIm * vf.re + y.ftRe * vt.im + y.ftIm * vt.re),
    to: cx(y.tfRe * vf.re - y.tfIm * vf.im + y.ttRe * vt.re - y.ttIm * vt.im, y.tfRe * vf.im + y.tfIm * vf.re + y.ttRe * vt.im + y.ttIm * vt.re),
  };
}
