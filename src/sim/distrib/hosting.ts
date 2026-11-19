// Rooftop-PV voltage rise, inverter volt-var, OLTC with line-drop compensation, and hosting capacity on a radial feeder.
//
// PV is injected as a negative load at its node(s): P_pv = share x total (kW), Q from a volt-var curve Q(V) (piecewise linear in per-unit of the
// inverter kVA, positive = injecting reactive power, IEEE 1547-2018 category B style default), limited by the inverter rating,
//   |Q| <= sqrt(S^2 - P^2). Volt-var is a fixed point V -> Q -> V solved with relaxation 0.5 around radial.ts.
// OLTC with line-drop compensation: the controller regulates Vcomp = | Vs - (Rc + jXc) I_head |  (Rc, Xc in pu of rated current) to the set
//   point within a band, one tap step (stepPct) per pass, 16 steps each way. Reverse flow (PV export) makes Vcomp higher, so the tap goes down.
// Hosting capacity: the largest total PV (kW) with every node voltage <= vMax (and optionally head current <= limit), found by bisection.
// Source: IEEE 1547-2018 clause 5.3.3 (volt-var), EPRI hosting-capacity method (Rylander et al.); simplified, single snapshot.
import { dmath } from '@core/numerics';
import { solveRadial, type RadialFeeder, type RadialResult } from './radial';

export interface VoltVarPoint { vPu: number; qPu: number }
/** IEEE 1547-2018 category B default volt-var: inject 0.44 pu below 0.92, deadband 0.98-1.02, absorb 0.44 pu above 1.08. */
export const VOLT_VAR_CAT_B: VoltVarPoint[] = [{ vPu: 0.92, qPu: 0.44 }, { vPu: 0.98, qPu: 0 }, { vPu: 1.02, qPu: 0 }, { vPu: 1.08, qPu: -0.44 }];
export const voltVarQPu = (curve: VoltVarPoint[], v: number): number => {
  if (v <= curve[0]!.vPu) return curve[0]!.qPu;
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1]!, b = curve[k]!;
    if (v <= b.vPu) return a.qPu + ((b.qPu - a.qPu) * (v - a.vPu)) / (b.vPu - a.vPu);
  }
  return curve[curve.length - 1]!.qPu;
};

export interface PvSite { node: string; /** Share of the total PV at this node (shares are normalised). */ share: number; /** Inverter kVA as a multiple of its kW (default 1.1). */ kvaPerKw?: number }
export interface OltcSpec {
  vSetPu: number; bandPu: number; stepPct?: number; maxSteps?: number;
  /** Line-drop compensation in pu of rated current at the head (0 = plain voltage control). */
  rLdcPu?: number; xLdcPu?: number; ratedA: number;
}
export interface PvScenario { sites: PvSite[]; voltVar?: VoltVarPoint[]; oltc?: OltcSpec; loadScale?: number; vSourcePu?: number }
export interface PvSolution extends RadialResult { pvKw: number; siteQkvar: Record<string, number>; oltcStep: number; vSourceUsed: number; vCompPu: number; headCurrentA: number }

export function solveWithPv(f: RadialFeeder, sc: PvScenario, totalPvKw: number): PvSolution {
  const shareSum = sc.sites.reduce((a, s) => a + s.share, 0);
  const pOf = (s: PvSite): number => (totalPvKw * s.share) / shareSum;
  const q: Record<string, number> = {};
  sc.sites.forEach((s) => { q[s.node] = 0; });
  const build = (): RadialFeeder => ({
    kV: f.kV,
    nodes: f.nodes.map((nd) => {
      const site = sc.sites.find((s) => s.node === nd.id);
      return site ? { ...nd, pKw: nd.pKw * (sc.loadScale ?? 1) - pOf(site), qKvar: nd.qKvar * (sc.loadScale ?? 1) - q[nd.id]! } : { ...nd, pKw: nd.pKw * (sc.loadScale ?? 1), qKvar: nd.qKvar * (sc.loadScale ?? 1) };
    }),
  });
  let n = 0, vs = sc.vSourcePu ?? 1, res!: RadialResult, vComp = vs, iHead = 0;
  const seen = new Set<number>();
  const solveVV = (): RadialResult => {
    let r = solveRadial(build(), { vSourcePu: vs });
    if (!sc.voltVar) return r;
    for (let it = 0; it < 200; it++) {
      let d = 0;
      for (const s of sc.sites) {
        const kva = pOf(s) * (s.kvaPerKw ?? 1.1), pk = pOf(s);
        const lim = dmath.sqrt(Math.max(0, kva * kva - pk * pk));
        const want = Math.max(-lim, Math.min(lim, voltVarQPu(sc.voltVar, r.byId[s.node]!.vPu) * kva));
        const nq = 0.5 * q[s.node]! + 0.5 * want;
        d = Math.max(d, dmath.abs(nq - q[s.node]!)); q[s.node] = nq;
      }
      r = solveRadial(build(), { vSourcePu: vs });
      if (d < 1e-7) break;
    }
    return r;
  };
  for (let pass = 0; pass < 40; pass++) {
    const o = sc.oltc;
    vs = (sc.vSourcePu ?? 1) + (n * (o?.stepPct ?? 0.625)) / 100;
    res = solveVV();
    if (!o) break;
    const sBase = dmath.sqrt(3) * f.kV * o.ratedA; // kVA
    const ip = { re: res.sourceKw / (sBase * vs), im: -res.sourceKvar / (sBase * vs) };
    const rc = o.rLdcPu ?? 0, xc = o.xLdcPu ?? 0;
    const vr = vs - (rc * ip.re - xc * ip.im), vi = -(rc * ip.im + xc * ip.re);
    vComp = dmath.sqrt(vr * vr + vi * vi); iHead = dmath.sqrt(ip.re * ip.re + ip.im * ip.im) * o.ratedA;
    const err = o.vSetPu - vComp;
    if (dmath.abs(err) <= o.bandPu / 2) break;
    const dn = err > 0 ? 1 : -1, nn = Math.max(-(o.maxSteps ?? 16), Math.min(o.maxSteps ?? 16, n + dn));
    if (nn === n || seen.has(nn)) break; // at a stop, or about to hunt between two taps: keep the last
    seen.add(n); n = nn;
  }
  if (!sc.oltc) { const sBase = dmath.sqrt(3) * f.kV; iHead = dmath.sqrt(res.sourceKw * res.sourceKw + res.sourceKvar * res.sourceKvar) / (sBase * vs); vComp = vs; }
  return { ...res, pvKw: totalPvKw, siteQkvar: { ...q }, oltcStep: n, vSourceUsed: vs, vCompPu: vComp, headCurrentA: iHead };
}

export interface HostingLimits { vMaxPu: number; maxHeadCurrentA?: number }
export interface HostingResult { hostingKw: number; limitedBy: 'voltage' | 'current' | 'none' | 'base-case'; node: string; atLimit: PvSolution }

/** Largest total PV (kW) in [0, upperKw] with all node voltages <= vMax (and head current <= limit). Bisection, tolerance tolKw. */
export function hostingCapacity(f: RadialFeeder, sc: PvScenario, lim: HostingLimits, upperKw = 50000, tolKw = 0.01): HostingResult {
  const ok = (p: number): { good: boolean; sol: PvSolution } => {
    const sol = solveWithPv(f, sc, p);
    return { good: sol.maxVPu <= lim.vMaxPu && (lim.maxHeadCurrentA === undefined || sol.headCurrentA <= lim.maxHeadCurrentA), sol };
  };
  const base = ok(0);
  if (!base.good) return { hostingKw: 0, limitedBy: 'base-case', node: base.sol.maxNode, atLimit: base.sol };
  const top = ok(upperKw);
  if (top.good) return { hostingKw: upperKw, limitedBy: 'none', node: '', atLimit: top.sol };
  let lo = 0, hi = upperKw, sol = base.sol;
  while (hi - lo > tolKw) { const mid = (lo + hi) / 2, r = ok(mid); if (r.good) { lo = mid; sol = r.sol; } else hi = mid; }
  const over = ok(hi).sol;
  return { hostingKw: lo, limitedBy: over.maxVPu > lim.vMaxPu ? 'voltage' : 'current', node: over.maxNode, atLimit: sol };
}
