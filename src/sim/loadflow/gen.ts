// Seeded random network generator for the property tests (DESIGN 9.2): 3-60 buses, connected or with deliberate islands,
// catalogue-like r/x, taps +-10 %, caps and reactors, PV/PQ mixes, loads 30-120 % of a feasible base. Never Math.random.
import { Rng } from '@core/kit/rng';
import { dmath as dm } from '@core/numerics';
import { emptyNet, findIslands, tapTau, type Net, type NetUnit } from '../network';
import { solveNetwork } from './solve';

export interface GenOptions {
  minBuses?: number;
  maxBuses?: number;
  /** Probability of cutting 1-2 corridors to make islands (default 0.15). */
  islandProb?: number;
  /** Load factor range applied to the feasible base (default [0.3, 1.2]). */
  loadFactor?: [number, number];
  /** Tight reactive limits (more PV -> PQ switches), default false. */
  tightQ?: boolean;
  /** Tree only (no loops), no charging, no shunts: for the radial monotonicity property (P14). */
  radial?: boolean;
}

const pad = (i: number): string => (i < 10 ? `b0${i}` : `b${i}`);

/** One random network from a seed. Base loads are first shrunk until Newton converges (the feasible base), then scaled by a factor in loadFactor. */
export function genNetwork(seed: number, o: GenOptions = {}): Net {
  const rng = new Rng((seed ^ 0x9e3779b1) >>> 0);
  const n = rng.int(o.minBuses ?? 3, o.maxBuses ?? 60);
  const net = emptyNet();
  for (let i = 0; i < n; i++) net.buses.push({ id: pad(i), kV: 138 });
  const addBranch = (id: string, a: number, b: number, forceLine = false): void => {
    if (!forceLine && !o.radial && rng.chance(0.25)) {
      const x = rng.range(0.05, 0.2);
      net.branches.push({ id, from: pad(a), to: pad(b), r: x / rng.range(8, 40), x, bc: 0, tau: tapTau(rng.int(-8, 8)), inService: true });
    } else {
      const x = rng.range(0.01, 0.2);
      net.branches.push({ id, from: pad(a), to: pad(b), r: x * rng.range(0.08, 0.5), x, bc: o.radial ? 0 : x * rng.range(0, 1.2), inService: true });
    }
  };
  for (let i = 1; i < n; i++) addBranch(`t${i}`, rng.chance(0.5) ? i - 1 : rng.int(0, i - 1), i);
  if (!o.radial) {
    const extra = Math.floor(n * rng.range(0, 0.5));
    for (let e = 0; e < extra; e++) { const a = rng.int(0, n - 1); let b = rng.int(0, n - 1); if (b === a) b = (a + 1) % n; addBranch(`x${e}`, a, b); }
    if (rng.chance(o.islandProb ?? 0.15)) {
      const cuts = rng.int(1, 2);
      for (let k = 0; k < cuts; k++) { const br = net.branches[rng.int(0, net.branches.length - 1)]!; br.inService = false; }
    }
    for (let i = 0; i < n; i++) if (rng.chance(0.12)) {
      const b = rng.range(0.02, 0.25) * (rng.chance(0.7) ? 1 : -1);
      net.shunts.push({ id: `s${i}`, bus: pad(i), b, g: 0, inService: true });
    }
  }
  // sources: a few synchronous plants, an occasional STATCOM/SVC and inverter plants
  const genBuses = new Set<number>();
  if (o.radial) genBuses.add(0);
  else { const ng = Math.max(1, Math.round(n * rng.range(0.15, 0.35))); while (genBuses.size < ng) genBuses.add(rng.int(0, n - 1)); }
  const tight = !!o.tightQ;
  for (const i of [...genBuses].sort((a, b) => a - b)) {
    const u: NetUnit = {
      id: `g${pad(i)}`, bus: pad(i), kind: 'sync', online: o.radial ? true : !rng.chance(0.1), p: 0, pMax: rng.range(0.5, 4),
      vSet: rng.range(1.0, 1.05), qMax: tight ? rng.range(0.05, 0.4) : rng.range(0.3, 1.2), qMin: -(tight ? rng.range(0.02, 0.2) : rng.range(0.1, 0.6)),
    };
    net.units.push(u);
  }
  const loadBuses: number[] = [];
  for (let i = 0; i < n; i++) {
    if (genBuses.has(i) && !rng.chance(0.3)) continue;
    if (!rng.chance(0.75)) continue;
    loadBuses.push(i);
  }
  if (loadBuses.length === 0) loadBuses.push(n - 1);
  if (!o.radial) {
    for (let i = 0; i < n; i++) if (!genBuses.has(i)) {
      const r = rng.next();
      if (r < 0.04) net.units.push({ id: `sc${pad(i)}`, bus: pad(i), kind: 'statcom', online: true, vSet: rng.range(0.98, 1.03), iMax: rng.range(0.1, 0.6) });
      else if (r < 0.07) net.units.push({ id: `svc${pad(i)}`, bus: pad(i), kind: 'svc', online: true, vSet: rng.range(0.98, 1.03), bMin: -rng.range(0.1, 0.5), bMax: rng.range(0.1, 0.5) });
      else if (r < 0.12) net.units.push({ id: `pv${pad(i)}`, bus: pad(i), kind: 'inverter', online: true, p: rng.range(0.05, 0.3), pMax: 0.4, q: rng.range(-0.05, 0.05) });
    }
  }
  const baseLoads = loadBuses.map((i) => {
    const p = rng.range(0.05, 0.5), tan = dm.tan(dm.acos(rng.range(0.85, 0.98)));
    const zip: [number, number, number] | undefined = !o.radial && rng.chance(0.15) ? [0.3, 0.3, 0.4] : undefined;
    return { bus: pad(i), p, q: o.radial ? p * tan : p * tan * (rng.chance(0.1) ? -0.3 : 1), zip };
  });
  const lf = o.loadFactor ?? [0.3, 1.2];
  const finalFactor = rng.range(lf[0], lf[1]);
  const fill = (k: number): void => {
    net.loads = baseLoads.map((l, j) => ({ id: `L${j}`, bus: l.bus, p: l.p * k, q: l.q * k, ...(l.zip ? { zip: l.zip } : {}) }));
    dispatch(net);
  };
  // feasible base: shrink until Newton converges without continuation
  let k = 1;
  for (let t = 0; t < 14; t++) { fill(k); if (solveNetwork(net, { continuation: false }).converged) break; k *= 0.75; }
  fill(k * finalFactor);
  return net;
}

/** Share each energised island's load (plus 3 % losses) among its non-slack synchronous units in proportion to P_max (<= 90 % of P_max); the slack picks up the rest. */
export function dispatch(net: Net): void {
  const isl = findIslands(net);
  const loadAt = new Map<string, number>();
  for (const l of net.loads) { const z = l.zip ?? [0, 0, 1]; loadAt.set(l.bus, (loadAt.get(l.bus) ?? 0) + l.p * (z[0]! + z[1]! + z[2]!)); }
  for (const u of net.units) if (u.kind === 'sync') u.p = 0;
  for (const is of isl) {
    if (!is.energised) continue;
    const set = new Set(is.buses);
    let need = 0;
    for (const b of is.buses) need += loadAt.get(b) ?? 0;
    for (const u of net.units) if (set.has(u.bus) && u.online && u.kind === 'inverter') need -= u.p ?? 0;
    need = Math.max(0, need * 1.03);
    const gens = net.units.filter((u) => set.has(u.bus) && u.online && u.kind === 'sync' && u.id !== is.slackUnit);
    const cap = gens.reduce((s, u) => s + 0.9 * (u.pMax ?? 0), 0);
    const f = cap > 0 ? Math.min(1, (need * 0.7) / cap) : 0; // the slack keeps about 30 % plus the losses
    for (const u of gens) u.p = f * 0.9 * (u.pMax ?? 0);
  }
}
