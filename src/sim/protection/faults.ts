// Fault studies by Zbus columns (DESIGN 3.8): 3-phase, single line-to-ground, line-to-line. Loads neglected (S5, S30).
import { abs, add, cLuDecompose, cLuSolve, cx, div, mul, polar, scale, sub, type Complex, type CLuDecomposition } from '@core/numerics';
import { S_BASE_MVA, cmpId } from '../network';
import type { Msg } from '../network';
import { branchI0, branchI12, sequenceMatrices, type FaultModel, type SeqMatrices } from './sequence';

export type FaultType = '3ph' | 'slg' | 'll';

export interface FaultOptions {
  /** Fault impedance Z_f (pu, complex); default 0. */
  zf?: Complex;
  /** Pre-fault voltage: 'flat' = 1.0 at angle 0 (exam mode) or a load-flow solution (V pu, theta rad per bus id). */
  vPre?: 'flat' | { V: Record<string, number>; theta: Record<string, number> };
}

export interface FaultBranchResult {
  /** Phase-current magnitudes (a, b, c; pu) at each end, and the largest in kA. */
  iFromPhase: [number, number, number];
  iToPhase: [number, number, number];
  /** Positive-sequence end currents (pu). */
  i1From: Complex; i1To: Complex;
  iKA: number;
}

export interface FaultResult {
  ok: boolean;
  msg: Msg | null;
  bus: string;
  type: FaultType;
  vPre: Complex;
  /** Thevenin sequence impedances at the fault bus (pu); z0 null when there is no zero-sequence path. */
  z1: Complex; z2: Complex; z0: Complex | null;
  i1: Complex; i2: Complex; i0: Complex;
  /** Fault current magnitude (pu): |I_a| for 3ph and SLG, |I_b| for LL; with kA and MVA = |I| |V_pre| S_base. */
  iFaultPu: number; iFaultKA: number; sMVA: number;
  /** Post-fault sequence voltages per original bus id: V1 = V_pre - Z1 I1, V2 = -Z2 I2, V0 = -Z0 I0. */
  V1: Record<string, Complex>; V2: Record<string, Complex>; V0: Record<string, Complex>;
  branch: Record<string, FaultBranchResult>;
}

/** Single-line-to-ground: I_a = 3 V / (Z1 + Z2 + Z0 + 3 Z_f) (pu). */
export function slgCurrent(v: Complex, z1: Complex, z2: Complex, z0: Complex, zf: Complex): Complex {
  return div(scale(v, 3), add(add(add(z1, z2), z0), scale(zf, 3)));
}
/** Line-to-line (b-c): |I_b| = sqrt3 |V| / |Z1 + Z2 + Z_f| (pu). */
export function llCurrent(v: Complex, z1: Complex, z2: Complex, zf: Complex): number {
  return Math.sqrt(3) * abs(v) / abs(add(add(z1, z2), zf));
}

interface Comp { members: number[]; dec: CLuDecomposition | null }

/** Zbus column provider: per connected component one complex LU of Y, columns by Y z = e_k (no full inverse). null = floating / singular. */
export class ZSolver {
  private comp: number[];
  private comps: Comp[] = [];
  constructor(private Y: Complex[][], anchor?: boolean[]) {
    const n = Y.length;
    this.comp = new Array<number>(n).fill(-1);
    for (let s = 0; s < n; s++) {
      if (this.comp[s] !== -1) continue;
      const id = this.comps.length, members: number[] = [s];
      this.comp[s] = id;
      for (let q = 0; q < members.length; q++) {
        const i = members[q]!;
        for (let k = 0; k < n; k++) if (this.comp[k] === -1 && (Y[i]![k]!.re !== 0 || Y[i]![k]!.im !== 0 || Y[k]![i]!.re !== 0 || Y[k]![i]!.im !== 0)) { this.comp[k] = id; members.push(k); }
      }
      members.sort((a, b) => a - b);
      let dec: CLuDecomposition | null = null;
      const grounded = anchor ? members.some((m) => anchor[m]) : true;
      if (grounded) {
        const sub_ = members.map((i) => members.map((k) => Y[i]![k]!));
        // a component with no path to reference has (numerically) zero row sums
        let maxDiag = 0, maxRow = 0;
        for (let a = 0; a < members.length; a++) {
          let sr = 0, si = 0;
          for (let b = 0; b < members.length; b++) { sr += sub_[a]![b]!.re; si += sub_[a]![b]!.im; }
          maxRow = Math.max(maxRow, abs(cx(sr, si))); maxDiag = Math.max(maxDiag, abs(sub_[a]![a]!));
        }
        if (maxRow > 1e-12 * Math.max(maxDiag, 1e-300)) { try { dec = cLuDecompose(sub_); } catch { dec = null; } }
      }
      this.comps.push({ members, dec });
    }
  }
  /** Column k of Z (length n, zeros outside the component), or null when there is no path to a source/ground. */
  column(k: number): Complex[] | null {
    const c = this.comps[this.comp[k]!]!;
    if (!c.dec) return null;
    const li = c.members.indexOf(k);
    const e = c.members.map((_, i) => cx(i === li ? 1 : 0, 0));
    const z = cLuSolve(c.dec, e);
    const out = Array.from({ length: this.Y.length }, () => cx(0, 0));
    c.members.forEach((m, i) => { out[m] = z[i]!; });
    return out.some((v) => !Number.isFinite(v.re) || !Number.isFinite(v.im)) ? null : out;
  }
}

/** Prepared fault study: sequence matrices and lazy Zbus solvers for one model. */
export class FaultStudy {
  readonly seq: SeqMatrices;
  private s1: ZSolver | null = null; private s2: ZSolver | null = null; private s0: ZSolver | null = null;
  constructor(readonly model: FaultModel) { this.seq = sequenceMatrices(model); }

  /** Solve one fault at original bus id (V_post_i = V_pre_i - Z_ik I_f; branch currents from the post-fault voltages). */
  fault(bus: string, type: FaultType, opts: FaultOptions = {}): FaultResult {
    const { yb } = this.seq, net = this.model.net;
    const zf = opts.zf ?? cx(0, 0);
    const zero = cx(0, 0);
    const m = yb.mergedInto[bus];
    const k = m === undefined ? undefined : yb.index.get(m);
    const base: FaultResult = { ok: false, msg: null, bus, type, vPre: zero, z1: zero, z2: zero, z0: null, i1: zero, i2: zero, i0: zero, iFaultPu: 0, iFaultKA: 0, sMVA: 0, V1: {}, V2: {}, V0: {}, branch: {} };
    if (k === undefined) return { ...base, msg: { key: 'fault.unknown-bus', params: { bus } } };
    this.s1 ??= new ZSolver(this.seq.Y1, this.seq.hasGen);
    this.s2 ??= new ZSolver(this.seq.Y2, this.seq.hasGen);
    this.s0 ??= new ZSolver(this.seq.Y0);
    const c1 = this.s1.column(k), c2 = this.s2.column(k);
    if (!c1 || !c2 || abs(c1[k]!) < 1e-12) return { ...base, msg: { key: 'fault.no-source', params: { bus } } };
    const c0 = this.s0.column(k);
    const pre = (id: string): Complex => {
      const p = opts.vPre;
      if (!p || p === 'flat') return cx(1, 0);
      const v = p.V[id] ?? 0;
      return v > 0 ? polar(v, p.theta[id] ?? 0) : cx(0, 0);
    };
    const vk = pre(yb.ids[k]!);
    const z1 = c1[k]!, z2 = c2[k]!, z0 = c0 ? c0[k]! : null;
    let i1 = zero, i2 = zero, i0 = zero, msg: Msg | null = null;
    let iFault = 0;
    if (type === '3ph') { i1 = div(vk, add(z1, zf)); iFault = abs(i1); }
    else if (type === 'slg') {
      if (!z0) { msg = { key: 'fault.no-zero-sequence-path', params: { bus } }; }
      else { const ia = slgCurrent(vk, z1, z2, z0, zf); i1 = i2 = i0 = scale(ia, 1 / 3); iFault = abs(ia); }
    } else { i1 = div(vk, add(add(z1, z2), zf)); i2 = scale(i1, -1); iFault = Math.sqrt(3) * abs(i1); }
    const kV = net.buses.find((b) => b.id === bus)?.kV ?? 1;
    const V1: Record<string, Complex> = {}, V2: Record<string, Complex> = {}, V0: Record<string, Complex> = {};
    const mv1 = new Map<string, Complex>(), mv2 = new Map<string, Complex>(), mv0 = new Map<string, Complex>();
    yb.ids.forEach((id, i) => {
      mv1.set(id, sub(pre(id), mul(c1[i]!, i1)));
      mv2.set(id, scale(mul(c2[i]!, i2), -1));
      mv0.set(id, c0 ? scale(mul(c0[i]!, i0), -1) : zero);
    });
    for (const b of net.buses.map((x) => x.id).sort(cmpId)) { const mid = yb.mergedInto[b]!; V1[b] = mv1.get(mid)!; V2[b] = mv2.get(mid)!; V0[b] = mv0.get(mid)!; }
    const kvOf = new Map(net.buses.map((b) => [b.id, b.kV]));
    const a = cx(-0.5, Math.sqrt(3) / 2), a2 = cx(-0.5, -Math.sqrt(3) / 2);
    const phases = (s1: Complex, s2: Complex, s0: Complex): [number, number, number] => [
      abs(add(add(s0, s1), s2)), abs(add(add(s0, mul(a2, s1)), mul(a, s2))), abs(add(add(s0, mul(a, s1)), mul(a2, s2))),
    ];
    const branch: Record<string, FaultBranchResult> = {};
    for (const br of net.branches.slice().sort((x, y) => cmpId(x.id, y.id))) {
      if (!br.inService || yb.ties.includes(br.id)) continue;
      const vf = (mp: Map<string, Complex>) => mp.get(yb.mergedInto[br.from]!)!, vt = (mp: Map<string, Complex>) => mp.get(yb.mergedInto[br.to]!)!;
      const e1 = branchI12(br, vf(mv1), vt(mv1)), e2 = branchI12({ ...br, bc: 0, gc: 0 }, vf(mv2), vt(mv2));
      const e0 = branchI0(this.model, br.id, vf(mv0), vt(mv0));
      const pf = phases(e1.from, e2.from, e0.from), pt = phases(e1.to, e2.to, e0.to);
      const ka = (p: number[], id: string) => (Math.max(...p) * S_BASE_MVA) / (Math.sqrt(3) * (kvOf.get(id) ?? 1));
      branch[br.id] = { iFromPhase: pf, iToPhase: pt, i1From: e1.from, i1To: e1.to, iKA: Math.max(ka(pf, br.from), ka(pt, br.to)) };
    }
    return {
      ...base, ok: true, msg, vPre: vk, z1, z2, z0, i1, i2, i0, iFaultPu: iFault,
      iFaultKA: (iFault * S_BASE_MVA) / (Math.sqrt(3) * kV), sMVA: iFault * abs(vk) * S_BASE_MVA, V1, V2, V0, branch,
    };
  }
}

/** Three-phase fault: I_f = V_k / (Z_kk + Z_f); V_i = V_i^pre - Z_ik I_f (pu, kA = I S_base / (sqrt3 kV)). */
export function threePhaseFault(model: FaultModel, bus: string, opts: FaultOptions = {}): FaultResult { return new FaultStudy(model).fault(bus, '3ph', opts); }
/** Single line-to-ground fault: I_a = 3 V / (Z1 + Z2 + Z0 + 3 Z_f) (pu). */
export function slgFault(model: FaultModel, bus: string, opts: FaultOptions = {}): FaultResult { return new FaultStudy(model).fault(bus, 'slg', opts); }
/** Line-to-line fault: |I_b| = sqrt3 |V| / |Z1 + Z2 + Z_f| (pu). */
export function llFault(model: FaultModel, bus: string, opts: FaultOptions = {}): FaultResult { return new FaultStudy(model).fault(bus, 'll', opts); }
