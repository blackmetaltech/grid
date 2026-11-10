// Network-level load flow: islands -> slack -> per-island Newton (+ continuation on double failure) -> V, theta per bus.
import { cmpId, islandLoadPu, type Island, type Msg, type Net } from '../network';
import { buildCases, type LFCase } from './case';
import { continuationCase, type ShedStep } from './continuation';
import { solveCase, type BusKind, type CaseSolution, type NrState } from './nr';

export interface IslandReport {
  index: number;
  buses: string[];
  energised: boolean;
  slackUnit: string | null;
  converged: boolean;
  iterations: number;
  /** Why not ok / why dark (null = fine). */
  reason: Msg | null;
  /** Voltage collapse details when continuation ran. */
  collapse: null | { lambdaStar: number; sheds: ShedStep[]; shedPu: number; log: Msg[]; genScale: number };
  /** Energy not served rate in this island (pu): all load when dark, the shed load after a collapse. */
  ensPu: number;
}

/** Plain JSON-able solution: what the game may keep in state (V and theta only; flows are recomputed). */
export interface NetSolution {
  /** |V| (pu) and angle (rad) per original bus id; 0 / 0 when de-energised. */
  V: Record<string, number>;
  theta: Record<string, number>;
  energised: Record<string, boolean>;
  kind: Record<string, BusKind | 'off'>;
  /** True when every energised island converged (after continuation if it was needed). */
  converged: boolean;
  iterations: number;
  reason: Msg | null;
  islands: IslandReport[];
  /** Fraction of each load shed by the collapse sheds (id -> 0..1); empty if none. */
  shed: Record<string, number>;
  /** Dispatch run-back of non-slack units (unit id -> scale 0..1) when a collapse could only be resolved by backing generation down with the shed; empty normally. */
  genScale: Record<string, number>;
  /** Total energy-not-served rate (pu): dark islands + collapse sheds. */
  ensPu: number;
  /** Regulating buses whose Q is still outside its capability after the Q-limit passes (normally empty). */
  qUnsettled: string[];
}

export interface SolveOptions {
  warm?: (Pick<NetSolution, 'V' | 'theta'> & Partial<Pick<NetSolution, 'kind'>>) | null;
  qLimits?: boolean;
  /** Also start from the previous bus kinds (limited units stay limited): ~1 pass per re-solve, but the result then depends on history (hysteresis). Default false. */
  keepKinds?: boolean;
  /** Run the load-scaling continuation when Newton fails twice (default true). */
  continuation?: boolean;
  bisections?: number;
}

function warmFor(c: LFCase, w: Pick<NetSolution, 'V' | 'theta'> | null | undefined): NrState | null {
  if (!w) return null;
  const V: number[] = [], th: number[] = [];
  for (const id of c.ids) {
    const v = w.V[id], t = w.theta[id];
    if (v === undefined || t === undefined || !(v > 0)) return null;
    V.push(v); th.push(t);
  }
  return { V, th };
}

function kindsFor(c: LFCase, w: SolveOptions['warm']): BusKind[] | null {
  if (!w || !w.kind) return null;
  return c.ids.map((id) => { const k = w.kind![id]; return k === undefined || k === 'off' ? 'pq' : k; });
}

/** Net as solved: the collapse sheds applied (loads scaled by 1 - shed), for flows() and the sensitivities. */
export function effectiveNet(net: Net, sol: Pick<NetSolution, 'shed'> & Partial<Pick<NetSolution, 'genScale'>>): Net {
  const gs = sol.genScale ?? {};
  if (Object.keys(sol.shed).length === 0 && Object.keys(gs).length === 0) return net;
  return {
    ...net,
    loads: net.loads.map((l) => { const f = sol.shed[l.id] ?? 0; return f ? { ...l, p: l.p * (1 - f), q: l.q * (1 - f) } : l; }),
    units: net.units.map((u) => { const g = gs[u.id]; return g === undefined ? u : { ...u, p: (u.p ?? 0) * g, ...(u.kind === 'inverter' && u.vSet === undefined && u.q !== undefined ? { q: u.q * g } : {}) }; }),
  };
}

/** Solve every energised island; dark islands get V = 0 and all their load as ENS. Divergence becomes a collapse result, never a throw. */
export function solveNetwork(net: Net, opts: SolveOptions = {}): NetSolution {
  const built = buildCases(net);
  const sol: NetSolution = { V: {}, theta: {}, energised: {}, kind: {}, converged: true, iterations: 0, reason: null, islands: [], shed: {}, genScale: {}, ensPu: 0, qUnsettled: [] };
  for (const b of net.buses.map((x) => x.id).sort(cmpId)) { sol.V[b] = 0; sol.theta[b] = 0; sol.energised[b] = false; sol.kind[b] = 'off'; }
  const byIsland = new Map(built.cases.map((x) => [x.island.index, x.c]));
  for (const isl of built.islands) {
    const rep: IslandReport = { index: isl.index, buses: isl.buses, energised: isl.energised, slackUnit: isl.slackUnit, converged: true, iterations: 0, reason: isl.reason, collapse: null, ensPu: 0 };
    const c = byIsland.get(isl.index);
    if (!c) { rep.ensPu = islandLoadPu(net, isl); sol.ensPu += rep.ensPu; sol.islands.push(rep); continue; }
    let cs: CaseSolution = solveCase(c, { warm: warmFor(c, opts.warm), warmKinds: opts.keepKinds ? kindsFor(c, opts.warm) : null, qLimits: opts.qLimits });
    rep.iterations = cs.iterations;
    if (!cs.converged && opts.continuation !== false) {
      const co = continuationCase(c, { qLimits: opts.qLimits, bisections: opts.bisections });
      rep.iterations += co.solves;
      rep.collapse = { lambdaStar: co.lambdaStar, sheds: co.sheds, shedPu: co.shedPu, log: co.log, genScale: co.genScale };
      rep.ensPu = co.shedPu;
      if (co.solution) {
        cs = co.solution; rep.reason = co.log[0] ?? null;
        for (let i = 0; i < c.n; i++) if (co.shedFraction[i]!) for (const lid of c.loadIds[i]!) sol.shed[lid] = co.shedFraction[i]!;
        if (co.genScale < 1) {
          const isle = new Set(isl.buses);
          for (const u of net.units) if (u.online && isle.has(u.bus) && u.id !== isl.slackUnit && (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'inverter')) sol.genScale[u.id] = co.genScale;
        }
      } else { rep.converged = false; rep.reason = co.log[co.log.length - 1] ?? cs.message; }
    }
    if (!cs.converged && !rep.collapse?.sheds.length && rep.converged) { rep.converged = false; rep.reason = cs.message; }
    if (rep.converged && !cs.converged) rep.converged = false;
    sol.iterations += rep.iterations;
    for (const i of cs.qViolations) sol.qUnsettled.push(c.ids[i]!);
    sol.ensPu += rep.ensPu;
    if (rep.converged) {
      for (let i = 0; i < c.n; i++) for (const m of c.members[i]!) { sol.V[m] = cs.V[i]!; sol.theta[m] = cs.th[i]!; sol.energised[m] = true; sol.kind[m] = cs.kinds[i]!; }
    } else { sol.converged = false; sol.reason = rep.reason; }
    sol.islands.push(rep);
  }
  return sol;
}
