// Radial feeder load flow: backward-forward sweep (Shirmohammadi et al. 1988), balanced three-phase, solved per phase.
//
// Model. One nominal line-to-line kV for the whole tree. Each node (except the root = source bus) owns the section that joins it to its
// parent: series impedance Z = R + jX (ohm per phase) and an ideal ratio r (off-load tap and/or regulator). Loads are constant power.
//   backward:  J_k = I_k + sum_c r_c J_c,   I_k = conj( (P_k + jQ_k) 1000 / 3 / V_k )          (A per phase; J is on the child side of its section)
//   forward :  V_k = r_k V_parent - Z_k J_k
// Ideal ratio: V_child(open) = r V_parent, upstream current = r J_child (power conserved). Simplification: single voltage level, so an LV
// customer tree is a separate RadialFeeder at its own kV; per-unit values are relative to kV/sqrt(3).
// Regulator (step type, e.g. ANSI 32 steps of 0.625 %): after each sweep the tap is moved until the child-side voltage is inside
// vSetPu +/- bandPu/2, then the sweep is repeated (outer loop, at most 40 passes).
// Sources: Shirmohammadi, Hong, Semlyen, Luo, IEEE Trans. Power Systems 3(2) 1988; Kersting, Distribution System Modeling and Analysis, ch. 10.
import { dmath } from '@core/numerics';

export interface RegulatorSpec { vSetPu: number; bandPu: number; stepPct?: number; maxSteps?: number }

export interface RadialNode {
  id: string;
  /** null = the source bus (exactly one). */
  parent: string | null;
  /** Section from parent to this node (ohm per phase, total for the section). Ignored at the root. */
  rOhm: number;
  xOhm: number;
  /** Load at the node (kW, kvar, three-phase total); negative = injection (PV). */
  pKw: number;
  qKvar: number;
  /** Off-load tap of a distribution transformer at this node: multiplies the node voltage (default 0). */
  tapPct?: number;
  /** Step voltage regulator on the section parent -> this node. */
  regulator?: RegulatorSpec;
}

export interface RadialFeeder { kV: number; nodes: RadialNode[] }

export interface RadialOptions { vSourcePu?: number; loadScale?: number; tol?: number; maxIt?: number }

export interface RadialNodeResult { id: string; vPu: number; vLL: number; vPhase: number; angleDeg: number }
export interface RadialSectionResult {
  id: string; from: string; to: string;
  /** Magnitude of the current in the section on the child side (A per phase). */
  currentA: number; pLossKw: number; qLossKvar: number;
  /** Voltage drop |V_from r| - |V_to| expressed in pu (positive = voltage falls toward the child). */
  dropPu: number;
  /** Real power flowing into the section at the parent end (kW, negative = reverse flow). */
  pFlowKw: number; qFlowKvar: number;
}
export interface RadialResult {
  converged: boolean; iterations: number;
  nodes: RadialNodeResult[]; sections: RadialSectionResult[];
  byId: Record<string, RadialNodeResult>;
  lossKw: number; lossKvar: number; loadKw: number; sourceKw: number; sourceKvar: number;
  lossPct: number;
  minVPu: number; minNode: string; maxVPu: number; maxNode: string;
  /** Largest cumulative drop from the source: vSource - min V (pu). */
  maxDropPu: number;
  /** Tap step of each regulator after control (by node id). */
  regSteps: Record<string, number>;
}

interface Cx { re: number; im: number }
const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: Cx, b: Cx): Cx => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
const cabs = (a: Cx): number => dmath.sqrt(a.re * a.re + a.im * a.im);

const SQRT3 = dmath.sqrt(3);

/** Topological order (parents first), index of the parent, children lists. Throws on a malformed tree. */
export function treeOrder(nodes: RadialNode[]): { order: number[]; parent: number[]; children: number[][]; root: number } {
  const idx = new Map<string, number>();
  nodes.forEach((n, i) => { if (idx.has(n.id)) throw new Error('duplicate node ' + n.id); idx.set(n.id, i); });
  const parent = nodes.map((n) => (n.parent === null ? -1 : idx.get(n.parent) ?? -2));
  if (parent.includes(-2)) throw new Error('unknown parent');
  const roots = parent.flatMap((p, i) => (p === -1 ? [i] : []));
  if (roots.length !== 1) throw new Error('exactly one root (parent null) required');
  const children: number[][] = nodes.map(() => []);
  parent.forEach((p, i) => { if (p >= 0) children[p]!.push(i); });
  const order = [roots[0]!];
  for (let h = 0; h < order.length; h++) for (const c of children[order[h]!]!) order.push(c);
  if (order.length !== nodes.length) throw new Error('feeder is not a connected tree');
  return { order, parent, children, root: roots[0]! };
}

function sweep(f: RadialFeeder, tp: ReturnType<typeof treeOrder>, ratio: number[], vSrc: number, scale: number, tol: number, maxIt: number) {
  const n = f.nodes.length, vBase = (f.kV * 1000) / SQRT3;
  const V: Cx[] = f.nodes.map(() => ({ re: vSrc * vBase, im: 0 }));
  const J: Cx[] = f.nodes.map(() => ({ re: 0, im: 0 }));
  let it = 0, converged = false;
  for (; it < maxIt; it++) {
    for (let h = n - 1; h >= 0; h--) {
      const k = tp.order[h]!, nd = f.nodes[k]!;
      const s: Cx = { re: (nd.pKw * scale * 1000) / 3, im: (nd.qKvar * scale * 1000) / 3 };
      const i = div({ re: s.re, im: -s.im }, { re: V[k]!.re, im: -V[k]!.im }); // conj(S)/conj(V)
      let jr = i.re, ji = i.im;
      for (const c of tp.children[k]!) { jr += ratio[c]! * J[c]!.re; ji += ratio[c]! * J[c]!.im; }
      J[k] = { re: jr, im: ji };
    }
    let dmax = 0;
    for (let h = 1; h < n; h++) {
      const k = tp.order[h]!, nd = f.nodes[k]!, p = tp.parent[k]!;
      const zj = mul({ re: nd.rOhm, im: nd.xOhm }, J[k]!);
      const nv = { re: ratio[k]! * V[p]!.re - zj.re, im: ratio[k]! * V[p]!.im - zj.im };
      dmax = Math.max(dmax, dmath.abs(nv.re - V[k]!.re), dmath.abs(nv.im - V[k]!.im));
      V[k] = nv;
    }
    if (dmax / vBase < tol) { converged = true; it++; break; }
  }
  return { V, J, converged, it, vBase };
}

/** Solve the feeder. Voltages in pu of kV/sqrt(3); the source node is held at vSourcePu (default 1) at angle 0. */
export function solveRadial(f: RadialFeeder, opts: RadialOptions = {}): RadialResult {
  const tp = treeOrder(f.nodes), n = f.nodes.length;
  const vSrc = opts.vSourcePu ?? 1, scale = opts.loadScale ?? 1, tol = opts.tol ?? 1e-11, maxIt = opts.maxIt ?? 200;
  const tapN = f.nodes.map(() => 0);           // regulator step counts
  const ratioOf = (): number[] => f.nodes.map((nd, k) => (1 + (nd.tapPct ?? 0) / 100) * (1 + (tapN[k]! * (nd.regulator?.stepPct ?? 0.625)) / 100));
  let sw = sweep(f, tp, ratioOf(), vSrc, scale, tol, maxIt), totalIt = sw.it;
  const regs = f.nodes.flatMap((nd, k) => (nd.regulator ? [k] : []));
  for (let pass = 0; regs.length && pass < 40; pass++) {
    let moved = false;
    for (const k of regs) {
      const rg = f.nodes[k]!.regulator!, step = (rg.stepPct ?? 0.625) / 100, mx = rg.maxSteps ?? 16;
      const v = cabs(sw.V[k]!) / sw.vBase, err = rg.vSetPu - v;
      if (dmath.abs(err) <= rg.bandPu / 2) continue;
      let dn = dmath.round(err / (step * v));
      if (dn === 0) dn = err > 0 ? 1 : -1;
      const nn = Math.max(-mx, Math.min(mx, tapN[k]! + dn));
      if (nn !== tapN[k]) { tapN[k] = nn; moved = true; }
    }
    if (!moved) break;
    sw = sweep(f, tp, ratioOf(), vSrc, scale, tol, maxIt); totalIt += sw.it;
  }
  const ratio = ratioOf(), { V, J, vBase } = sw;
  const nodes: RadialNodeResult[] = f.nodes.map((nd, k) => {
    const m = cabs(V[k]!);
    return { id: nd.id, vPu: m / vBase, vLL: m * SQRT3, vPhase: m, angleDeg: (dmath.atan2(V[k]!.im, V[k]!.re) * 180) / Math.PI };
  });
  const byId: Record<string, RadialNodeResult> = {};
  nodes.forEach((r) => { byId[r.id] = r; });
  const sections: RadialSectionResult[] = [];
  let lossKw = 0, lossKvar = 0, loadKw = 0;
  for (let h = 1; h < n; h++) {
    const k = tp.order[h]!, nd = f.nodes[k]!, p = tp.parent[k]!;
    const i2 = J[k]!.re * J[k]!.re + J[k]!.im * J[k]!.im;
    const pl = (3 * nd.rOhm * i2) / 1000, ql = (3 * nd.xOhm * i2) / 1000;
    lossKw += pl; lossKvar += ql;
    // power at the parent end: S = 3 V_p conj(J_k r)... (parent-side current is r J)
    const sp = mul(V[p]!, { re: ratio[k]! * J[k]!.re, im: -ratio[k]! * J[k]!.im });
    sections.push({
      id: nd.id, from: f.nodes[p]!.id, to: nd.id, currentA: dmath.sqrt(i2), pLossKw: pl, qLossKvar: ql,
      dropPu: (ratio[k]! * cabs(V[p]!) - cabs(V[k]!)) / vBase, pFlowKw: (3 * sp.re) / 1000, qFlowKvar: (3 * sp.im) / 1000,
    });
  }
  for (const nd of f.nodes) loadKw += nd.pKw * scale;
  // source power: into the root's child sections
  let srcP = 0, srcQ = 0;
  for (const c of tp.children[tp.root]!) { const s = sections.find((x) => x.to === f.nodes[c]!.id)!; srcP += s.pFlowKw; srcQ += s.qFlowKvar; }
  let minV = Infinity, minNode = '', maxV = -Infinity, maxNode = '';
  for (const r of nodes) { if (r.vPu < minV) { minV = r.vPu; minNode = r.id; } if (r.vPu > maxV) { maxV = r.vPu; maxNode = r.id; } }
  const regSteps: Record<string, number> = {};
  for (const k of regs) regSteps[f.nodes[k]!.id] = tapN[k]!;
  return {
    converged: sw.converged, iterations: totalIt, nodes, sections, byId, lossKw, lossKvar, loadKw, sourceKw: srcP, sourceKvar: srcQ,
    lossPct: srcP > 0 ? (100 * lossKw) / srcP : 0, minVPu: minV, minNode, maxVPu: maxV, maxNode, maxDropPu: vSrc - minV, regSteps,
  };
}

/** Convenience: build a chain feeder (root, then nodes in series) from section data. */
export function chainFeeder(kV: number, secs: { id: string; rOhm: number; xOhm: number; pKw: number; qKvar: number; tapPct?: number }[]): RadialFeeder {
  const nodes: RadialNode[] = [{ id: 'src', parent: null, rOhm: 0, xOhm: 0, pKw: 0, qKvar: 0 }];
  secs.forEach((s, i) => nodes.push({ ...s, parent: i === 0 ? 'src' : secs[i - 1]!.id }));
  return { kV, nodes };
}
