// Derived quantities of a solution: branch flows, losses, slack P/Q, Q at regulating buses. Pure; recomputed on demand
// (flows are never stored in game state).
import { dmath as dm } from '@core/numerics';
import { S_BASE_MVA, branchY, buildYbus, cmpId, type Net } from '../network';
import type { NetSolution } from './solve';

export interface BranchFlow {
  /** Complex power entering the branch at each end (pu); S_ij leaves bus i. */
  pFrom: number; qFrom: number; pTo: number; qTo: number;
  /** Current magnitude at each end (pu) and the larger of the two in kA. */
  iFromPu: number; iToPu: number; iKA: number;
  /** max(|S_from|, |S_to|) / rating; 0 when unrated. */
  loading: number;
  /** Branch loss S_from + S_to (pu). */
  lossP: number; lossQ: number;
  /** True for a merged bus tie (flow through a zero-impedance coupler is not defined by the model; reported 0). */
  tie: boolean;
}

export interface BusBalance {
  /** Loads at the merged bus (pu) at the solved voltage. */
  pLoad: number; qLoad: number;
  /** Generation (pu): P scheduled (slack: from the balance), Q from the regulating devices or the schedule. */
  pGen: number; qGen: number;
  /** Power drawn by fixed shunts (and no-load G) at the bus (pu): P = g V^2, Q = -b V^2 (negative = delivering). */
  shuntP: number; shuntQ: number;
}

export interface Flows {
  branch: Record<string, BranchFlow>;
  bus: Record<string, BusBalance>;
  /** Sum of branch losses (pu). */
  lossP: number; lossQ: number;
  /** Fixed-shunt P draw (no-load transformer G), pu, and Q draw (negative = charging by shunts). */
  shuntP: number; shuntQ: number;
  /** lossP + shuntP: everything the sources must cover beyond the load. */
  totalLossP: number;
  /** Slack generation (pu) per slack bus. */
  slack: Record<string, { p: number; q: number }>;
  /** Q generated at every regulating bus (pu): PV units, slack, limited devices. */
  qAtPv: Record<string, number>;
  totalGenP: number; totalLoadP: number; totalGenQ: number; totalLoadQ: number;
}

/** S_from = V_f conj(Y_ff V_f + Y_ft V_t), S_to likewise; losses S_from + S_to; kA = I_pu S_base/(sqrt3 kV) (pu, kA). */
export function flows(net: Net, sol: Pick<NetSolution, 'V' | 'theta' | 'energised' | 'kind'>): Flows {
  const yb = buildYbus(net);
  const kV = new Map(net.buses.map((b) => [b.id, b.kV]));
  const out: Flows = { branch: {}, bus: {}, lossP: 0, lossQ: 0, shuntP: 0, shuntQ: 0, totalLossP: 0, slack: {}, qAtPv: {}, totalGenP: 0, totalLoadP: 0, totalGenQ: 0, totalLoadQ: 0 };
  const sc: [number, number] = [0, 0];
  const volt = (id: string): { re: number; im: number; m: number } => {
    const v = sol.V[id] ?? 0, t = sol.theta[id] ?? 0;
    dm.sincos(t, sc);
    return { re: v * sc[1], im: v * sc[0], m: v };
  };
  for (const br of net.branches.slice().sort((a, b) => cmpId(a.id, b.id))) {
    const zero: BranchFlow = { pFrom: 0, qFrom: 0, pTo: 0, qTo: 0, iFromPu: 0, iToPu: 0, iKA: 0, loading: 0, lossP: 0, lossQ: 0, tie: false };
    if (!br.inService) { out.branch[br.id] = zero; continue; }
    if (yb.ties.includes(br.id)) { out.branch[br.id] = { ...zero, tie: true }; continue; }
    const vf = volt(br.from), vt = volt(br.to);
    const y = branchY(br);
    const iFr = y.ffRe * vf.re - y.ffIm * vf.im + y.ftRe * vt.re - y.ftIm * vt.im;
    const iFi = y.ffRe * vf.im + y.ffIm * vf.re + y.ftRe * vt.im + y.ftIm * vt.re;
    const iTr = y.tfRe * vf.re - y.tfIm * vf.im + y.ttRe * vt.re - y.ttIm * vt.im;
    const iTi = y.tfRe * vf.im + y.tfIm * vf.re + y.ttRe * vt.im + y.ttIm * vt.re;
    const pF = vf.re * iFr + vf.im * iFi, qF = vf.im * iFr - vf.re * iFi;
    const pT = vt.re * iTr + vt.im * iTi, qT = vt.im * iTr - vt.re * iTi;
    const iF = Math.sqrt(iFr * iFr + iFi * iFi), iT = Math.sqrt(iTr * iTr + iTi * iTi);
    const sF = Math.sqrt(pF * pF + qF * qF), sT = Math.sqrt(pT * pT + qT * qT);
    const ikaF = (iF * S_BASE_MVA) / (Math.sqrt(3) * (kV.get(br.from) ?? 1));
    const ikaT = (iT * S_BASE_MVA) / (Math.sqrt(3) * (kV.get(br.to) ?? 1));
    const rate = br.rateMVA && br.rateMVA > 0 ? br.rateMVA / S_BASE_MVA : 0;
    out.branch[br.id] = {
      pFrom: pF, qFrom: qF, pTo: pT, qTo: qT, iFromPu: iF, iToPu: iT, iKA: Math.max(ikaF, ikaT),
      loading: rate > 0 ? Math.max(sF, sT) / rate : 0, lossP: pF + pT, lossQ: qF + qT, tie: false,
    };
    out.lossP += pF + pT; out.lossQ += qF + qT;
  }
  // bus balances at merged buses
  const busOf = (id: string): string => yb.mergedInto[id] ?? id;
  const ensure = (id: string): BusBalance => (out.bus[id] ??= { pLoad: 0, qLoad: 0, pGen: 0, qGen: 0, shuntP: 0, shuntQ: 0 });
  for (const id of yb.ids) ensure(id);
  for (const l of net.loads) {
    const m = busOf(l.bus), v = sol.V[l.bus] ?? 0; if (!sol.energised[l.bus]) continue;
    const z = l.zip ?? [0, 0, 1], k = z[0]! * v * v + z[1]! * v + z[2]!;
    const b = ensure(m); b.pLoad += l.p * k; b.qLoad += l.q * k;
  }
  for (const sh of net.shunts) {
    if (!sh.inService || !sol.energised[sh.bus]) continue;
    const v = sol.V[sh.bus] ?? 0, b = ensure(busOf(sh.bus));
    b.shuntP += (sh.g ?? 0) * v * v; b.shuntQ += -sh.b * v * v;
  }
  for (const m of yb.ids) { out.shuntP += out.bus[m]!.shuntP; out.shuntQ += out.bus[m]!.shuntQ; }
  out.totalLossP = out.lossP + out.shuntP;
  // network injection per merged bus from Y_bus
  const n = yb.ids.length;
  const Vr = new Array<number>(n), Vi = new Array<number>(n);
  for (let i = 0; i < n; i++) { const v = volt(yb.ids[i]!); Vr[i] = v.re; Vi[i] = v.im; }
  for (let i = 0; i < n; i++) {
    const id = yb.ids[i]!;
    if (!sol.energised[id]) continue;
    let Ir = 0, Ii = 0;
    for (let k = 0; k < n; k++) {
      const g = yb.G[i]![k]!, b = yb.B[i]![k]!;
      if (g === 0 && b === 0) continue;
      Ir += g * Vr[k]! - b * Vi[k]!; Ii += g * Vi[k]! + b * Vr[k]!;
    }
    const pInj = Vr[i]! * Ir + Vi[i]! * Ii, qInj = Vi[i]! * Ir - Vr[i]! * Ii;
    const bb = out.bus[id]!;
    const kind = sol.kind[id] ?? 'pq';
    // scheduled generation at this merged bus
    let pg = 0, qgFix = 0;
    const isl = new Set([...(net.units)].filter((u) => u.online && busOf(u.bus) === id).map((u) => u.id));
    for (const u of net.units) if (isl.has(u.id)) { if (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'inverter') pg += u.p ?? 0; if (u.kind === 'inverter' && u.vSet === undefined) qgFix += u.q ?? 0; }
    if (kind === 'slack') {
      // slack unit's P is free: generation = injection + load - other scheduled units (all P of slack-bus units are replaced by the balance)
      bb.pGen = pInj + bb.pLoad; bb.qGen = qInj + bb.qLoad;
      out.slack[id] = { p: bb.pGen, q: bb.qGen };
      out.qAtPv[id] = bb.qGen - qgFix;
    } else {
      bb.pGen = pg;
      if (kind === 'pv' || kind === 'pq-max' || kind === 'pq-min') { bb.qGen = qInj + bb.qLoad; out.qAtPv[id] = bb.qGen - qgFix; }
      else bb.qGen = qgFix;
    }
  }
  for (const id of yb.ids) { const b = out.bus[id]!; out.totalGenP += b.pGen; out.totalGenQ += b.qGen; out.totalLoadP += b.pLoad; out.totalLoadQ += b.qLoad; }
  return out;
}
