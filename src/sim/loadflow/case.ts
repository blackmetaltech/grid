// Island-level load-flow case: the numbers Newton-Raphson, Gauss-Seidel and the DC flow share (pu, 100 MVA base).
import { buildYbus, cmpId, findIslands, type Island, type Net, type NetUnit, type Ybus } from '../network';

const BIG = 1e6; // "no limit" in pu (kept finite so no Infinity - Infinity can ever make a NaN)

export interface LFCase {
  /** Merged bus ids of the island, id-sorted; index = position here. */
  ids: string[];
  n: number;
  G: number[][];
  B: number[][];
  /** Off-diagonal neighbours of each bus (non-zero Y_ik, k != i). */
  adj: number[][];
  /** Index of the slack bus and its voltage set-point (pu). */
  slack: number;
  slackV: number;
  slackUnit: string;
  /** Scheduled generation P (pu) and fixed Q (unregulated inverter), already scaled by lamGen. */
  pg: number[]; qg: number[];
  /** Load coefficients P = pz V^2 + pi V + pp (and Q): scaled by lamLoad and (1 - shed). Positive = consumption. */
  lp: [number, number, number][]; lq: [number, number, number][];
  /** Voltage-regulating bus (a PV candidate, set-point vSet). */
  reg: boolean[]; vSet: number[];
  /** Q capability Qmax(V) = qMax0 + iMax V + bMax V^2, Qmin(V) = qMin0 - iMax V + bMin V^2 (pu). */
  qMin0: number[]; qMax0: number[]; iMax: number[]; bMin: number[]; bMax: number[];
  /** Unscaled base values for continuation (see setScale). */
  base: { pg: number[]; qg: number[]; lp: [number, number, number][]; lq: [number, number, number][] };
  /** Original loads per merged bus, for shedding bookkeeping: load ids at this merged bus. */
  loadIds: string[][];
  /** Map original bus id -> merged index (within this island). */
  indexOf: Map<string, number>;
  /** Original bus ids that were merged into each case bus (including itself). */
  members: string[][];
}

/** Rescale the case: loads by lamLoad x (1 - shed_i) and generation (non-slack P and fixed Q) by lamGen. */
export function setScale(c: LFCase, lamLoad: number, lamGen: number, shed?: ArrayLike<number>): void {
  for (let i = 0; i < c.n; i++) {
    const k = lamLoad * (1 - (shed ? shed[i] ?? 0 : 0));
    c.lp[i] = [c.base.lp[i][0] * k, c.base.lp[i][1] * k, c.base.lp[i][2] * k];
    c.lq[i] = [c.base.lq[i][0] * k, c.base.lq[i][1] * k, c.base.lq[i][2] * k];
    c.pg[i] = c.base.pg[i] * lamGen;
    c.qg[i] = c.base.qg[i] * lamGen;
  }
}

/** Load P(V), Q(V) at bus i (pu). */
export function loadAt(c: LFCase, i: number, V: number): [number, number] {
  const p = c.lp[i], q = c.lq[i];
  return [p[0] * V * V + p[1] * V + p[2], q[0] * V * V + q[1] * V + q[2]];
}

/** Qmax(V) and Qmin(V) of the regulating devices at bus i. */
export function qCap(c: LFCase, i: number, V: number): [number, number] {
  return [c.qMax0[i] + c.iMax[i] * V + c.bMax[i] * V * V, c.qMin0[i] - c.iMax[i] * V + c.bMin[i] * V * V];
}

function regulates(u: NetUnit): boolean {
  if (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'statcom' || u.kind === 'svc') return true;
  return u.vSet !== undefined; // inverter in V-control
}

export interface BuiltCases {
  ybus: Ybus;
  islands: Island[];
  /** One case per energised island, in island order (islandIndex gives the island). */
  cases: { island: Island; c: LFCase }[];
}

/** Build one case per energised island (de-energised islands get none). Merged buses and id-sorted order throughout. */
export function buildCases(net: Net): BuiltCases {
  const ybus = buildYbus(net);
  const islands = findIslands(net);
  const units = net.units.slice().sort((a, b) => cmpId(a.id, b.id));
  const cases: { island: Island; c: LFCase }[] = [];
  for (const isl of islands) {
    if (!isl.energised) continue;
    const ids = Array.from(new Set(isl.buses.map((b) => ybus.mergedInto[b]!))).sort(cmpId);
    const n = ids.length;
    const indexOf = new Map<string, number>();
    const members: string[][] = ids.map(() => []);
    const gidx = ids.map((id) => ybus.index.get(id)!);
    for (const b of isl.buses) { const k = ids.indexOf(ybus.mergedInto[b]!); indexOf.set(b, k); members[k]!.push(b); }
    const G = gidx.map((gi) => gidx.map((gj) => ybus.G[gi]![gj]!));
    const B = gidx.map((gi) => gidx.map((gj) => ybus.B[gi]![gj]!));
    const adj = Array.from({ length: n }, (_, i) => { const a: number[] = []; for (let k = 0; k < n; k++) if (k !== i && (G[i]![k] !== 0 || B[i]![k] !== 0)) a.push(k); return a; });
    const z = (): number[] => new Array<number>(n).fill(0);
    const pg = z(), qg = z(), qMin0 = z(), qMax0 = z(), iMax = z(), bMin = z(), bMax = z();
    const reg = new Array<boolean>(n).fill(false), vSet = new Array<number>(n).fill(1);
    const vSetSeen = new Array<boolean>(n).fill(false);
    const lp: [number, number, number][] = Array.from({ length: n }, () => [0, 0, 0]);
    const lq: [number, number, number][] = Array.from({ length: n }, () => [0, 0, 0]);
    const loadIds: string[][] = ids.map(() => []);
    const slackIdx = indexOf.get(isl.slackBus!)!;
    let slackV = 1;
    const sset = new Set(isl.buses);
    for (const u of units) {
      if (!u.online || !sset.has(u.bus)) continue;
      const k = indexOf.get(u.bus)!;
      const isSlackUnit = u.id === isl.slackUnit;
      if (!isSlackUnit && (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'inverter')) pg[k]! += u.p ?? 0;
      if (u.kind === 'inverter' && u.vSet === undefined) qg[k]! += u.q ?? 0;
      if (regulates(u)) {
        reg[k] = true;
        if (isSlackUnit) { slackV = u.vSet ?? 1; }
        if (!vSetSeen[k]) { vSet[k] = u.vSet ?? 1; vSetSeen[k] = true; }
        if (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'inverter') { qMin0[k]! += u.qMin ?? -BIG; qMax0[k]! += u.qMax ?? BIG; }
        if (u.kind === 'statcom') iMax[k]! += u.iMax ?? 0;
        if (u.kind === 'svc') { bMin[k]! += u.bMin ?? 0; bMax[k]! += u.bMax ?? 0; }
      }
    }
    vSet[slackIdx] = slackV;
    reg[slackIdx] = true;
    for (const l of net.loads) {
      if (!sset.has(l.bus)) continue;
      const k = indexOf.get(l.bus)!;
      const zz = l.zip ?? [0, 0, 1];
      for (let j = 0; j < 3; j++) { lp[k]![j]! += l.p * zz[j]!; lq[k]![j]! += l.q * zz[j]!; }
      loadIds[k]!.push(l.id);
    }
    const c: LFCase = {
      ids, n, G, B, adj, slack: slackIdx, slackV, slackUnit: isl.slackUnit!, pg, qg, lp, lq, reg, vSet, qMin0, qMax0, iMax, bMin, bMax,
      base: { pg: pg.slice(), qg: qg.slice(), lp: lp.map((x) => [...x] as [number, number, number]), lq: lq.map((x) => [...x] as [number, number, number]) },
      loadIds, indexOf, members,
    };
    cases.push({ island: isl, c });
  }
  return { ybus, islands, cases };
}
