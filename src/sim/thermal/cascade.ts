// Cascade loop (DESIGN 3.9): trip -> islands -> load flow (+ collapse) -> overloads / voltage relays -> next trip at the earliest
// timer, in quasi-static sub-steps, until stable or dark. Pure: the input net and state are never mutated.
import { cmpId, islandLoadPu, findIslands, type Msg, type Net } from '../network';
import { effectiveNet, flows as computeFlows, solveNetwork, type Flows, type NetSolution, type SolveOptions } from '../loadflow';
import { OV_STAGES, UV_STAGE } from '../protection/relays';
import { stepOverload, tripTimeS, type ElementKind, type OverloadState } from './overload';

/** Cascade countdown state as plain JSON. */
export interface CascadeState {
  /** Seconds since the start of the event. */
  tS: number;
  overload: OverloadState;
  /** Voltage-relay dwell (s) per relay key `ov1:bus`, `ov2:bus`, `uv:bus`. */
  volt: Record<string, number>;
  /** Buses whose motor share was already lost to the under-voltage trip. */
  uvDone: string[];
}

export interface CascadeOptions {
  /** Element ids (branches or units) tripped at t = 0. */
  trips?: string[];
  /** Branch kind for the timer constant (default line, 600 s; transformer 1800 s). */
  kinds?: Record<string, ElementKind>;
  /** Quasi-static sub-step (s), default 10. */
  subStepS?: number;
  /** Give up (outcome 'horizon') after this many seconds, default 7200. */
  horizonS?: number;
  /** Fraction of a load lost when its bus trips on under-voltage (default 0.5). */
  motorShare?: number;
  /** Frequency-window threshold: change of the generation/load imbalance as a fraction of total load (default 0.01). */
  freqThreshold?: number;
  maxEvents?: number;
  solve?: SolveOptions;
}

export interface ReplayEntry {
  tS: number;
  element: string;
  elementKind: 'branch' | 'unit' | 'load' | 'system';
  /** cascade.initial-trip | cascade.overload-trip | cascade.overvoltage-trip | cascade.undervoltage-load-trip | cascade.collapse-shed */
  cause: Msg;
  /** The numbers that caused it (loading, V, timer, ...), plus the energy not served after the step. */
  quantities: Record<string, number>;
  /** True when this trip changed the island generation/load balance by more than the threshold (event layer opens a frequency window). */
  freqWindow: boolean;
}

export interface CascadeResult {
  net: Net;
  solution: NetSolution;
  flows: Flows;
  state: CascadeState;
  replay: ReplayEntry[];
  outcome: 'stable' | 'dark' | 'horizon' | 'event-limit';
  endS: number;
  /** Energy-not-served rate at the end (pu) and ids of every element opened. */
  ensPu: number;
  tripped: string[];
}

export function emptyCascadeState(): CascadeState { return { tS: 0, overload: {}, volt: {}, uvDone: [] }; }

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Generation (scheduled P of online sources) minus load (nominal) summed as |m| over islands, pu. */
export function islandImbalancePu(net: Net): number {
  let s = 0;
  for (const isl of findIslands(net)) {
    const set = new Set(isl.buses);
    let gen = 0;
    for (const u of net.units) if (u.online && set.has(u.bus) && (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'inverter')) gen += u.p ?? 0;
    s += Math.abs(gen - islandLoadPu(net, isl));
  }
  return s;
}

function totalLoadPu(net: Net): number { return net.loads.reduce((a, l) => a + Math.abs(l.p), 0); }

interface Cond { loadings: Record<string, { loading: number; kind: ElementKind }>; volt: Record<string, number> }

function conditions(net: Net, sol: NetSolution, fl: Flows, kinds: Record<string, ElementKind>, uvDone: Set<string>): Cond {
  const loadings: Cond['loadings'] = {}, volt: Record<string, number> = {};
  for (const b of net.branches) {
    const f = fl.branch[b.id];
    if (b.inService && f && f.loading > 1) loadings[b.id] = { loading: f.loading, kind: kinds[b.id] ?? 'line' };
  }
  const loadBus = new Set(net.loads.filter((l) => Math.abs(l.p) > 0).map((l) => l.bus));
  for (const id of Object.keys(sol.V).sort(cmpId)) {
    if (!sol.energised[id]) continue;
    const v = sol.V[id]!;
    if (v >= OV_STAGES[1]!.thresholdPu) volt[`ov2:${id}`] = OV_STAGES[1]!.delayS;
    else if (v >= OV_STAGES[0]!.thresholdPu) volt[`ov1:${id}`] = OV_STAGES[0]!.delayS;
    if (v < UV_STAGE.thresholdPu && loadBus.has(id) && !uvDone.has(id)) volt[`uv:${id}`] = UV_STAGE.delayS;
  }
  return { loadings, volt };
}

/**
 * Run the cascade from the (possibly pre-loaded) state. Timers advance in sub-steps; a trip inside a sub-step happens at its exact time
 * (earliest timer first, one trip at a time), the load flow is re-solved and the loop continues until nothing is overloaded or stressed
 * (stable), nothing is energised (dark), or the horizon is reached. Every trip is appended to the replay list.
 */
export function runCascade(netIn: Net, stateIn: CascadeState, opts: CascadeOptions = {}): CascadeResult {
  const net: Net = clone(netIn);
  const st: CascadeState = clone(stateIn);
  const sub = opts.subStepS ?? 10, horizon = opts.horizonS ?? 7200, share = opts.motorShare ?? 0.5, thr = opts.freqThreshold ?? 0.01;
  const maxEv = opts.maxEvents ?? 200, kinds = opts.kinds ?? {};
  const replay: ReplayEntry[] = [];
  const tripped: string[] = [];
  const tEnd = st.tS + horizon;
  let sol = solveNetwork(net, opts.solve);
  const resolve = (): void => { sol = solveNetwork(net, { ...opts.solve, warm: sol.converged ? sol : null }); };
  let fl = computeFlows(effectiveNet(net, sol), sol);
  const record = (element: string, elementKind: ReplayEntry['elementKind'], cause: Msg, quantities: Record<string, number>, imbBefore: number, loadBefore: number): void => {
    resolve();
    fl = computeFlows(effectiveNet(net, sol), sol);
    const freqWindow = Math.abs(islandImbalancePu(net) - imbBefore) > thr * Math.max(loadBefore, 1e-9);
    replay.push({ tS: st.tS, element, elementKind, cause, quantities: { ...quantities, ensPu: sol.ensPu }, freqWindow });
    if (sol.ensPu > 0 && Object.keys(sol.shed).length) replay.push({ tS: st.tS, element: 'system', elementKind: 'system', cause: { key: 'cascade.collapse-shed' }, quantities: { ensPu: sol.ensPu, shedLoads: Object.keys(sol.shed).length }, freqWindow: false });
  };
  const open = (id: string): boolean => {
    const b = net.branches.find((x) => x.id === id);
    if (b && b.inService) { b.inService = false; tripped.push(id); return true; }
    const u = net.units.find((x) => x.id === id);
    if (u && u.online) { u.online = false; tripped.push(id); return true; }
    return false;
  };
  const kindOf = (id: string): 'branch' | 'unit' => (net.units.some((u) => u.id === id) ? 'unit' : 'branch');
  // initial trips, one entry each
  for (const id of opts.trips ?? []) {
    const imb = islandImbalancePu(net), ld = totalLoadPu(net);
    if (open(id)) record(id, kindOf(id), { key: 'cascade.initial-trip', params: { id } }, {}, imb, ld);
  }
  const dark = (): boolean => !Object.values(sol.energised).some(Boolean) || (totalLoadPu(net) > 0 && !net.loads.some((l) => sol.energised[l.bus]));
  let outcome: CascadeResult['outcome'] = 'stable';
  let events = 0;
  const uvDone = new Set(st.uvDone);
  for (;;) {
    if (dark()) { outcome = 'dark'; break; }
    const cond = conditions(net, sol, fl, kinds, uvDone);
    // drop voltage dwell of relays that reset
    for (const k of Object.keys(st.volt)) if (!(k in cond.volt)) delete st.volt[k];
    if (Object.keys(cond.loadings).length === 0 && Object.keys(cond.volt).length === 0) break;
    if (st.tS >= tEnd) { outcome = 'horizon'; break; }
    if (events >= maxEv) { outcome = 'event-limit'; break; }
    const dt = Math.min(sub, tEnd - st.tS);
    const r = stepOverload(st.overload, cond.loadings, dt);
    type Cand = { id: string; atS: number; cause: Msg; q: Record<string, number> };
    const cands: Cand[] = r.trips.map((t) => ({ id: t.id, atS: t.atS, cause: { key: 'cascade.overload-trip', params: { id: t.id } }, q: { loading: t.loading, tripTimeS: tripTimeS(t.loading, kinds[t.id] ?? 'line') } }));
    for (const key of Object.keys(cond.volt).sort()) {
      const need = cond.volt[key]! - (st.volt[key] ?? 0);
      if (need <= dt) {
        const [kind, bus] = key.split(':') as [string, string];
        cands.push({ id: key, atS: Math.max(0, need), cause: { key: kind === 'uv' ? 'cascade.undervoltage-load-trip' : 'cascade.overvoltage-trip', params: { bus } }, q: { vPu: sol.V[bus] ?? 0, delayS: cond.volt[key]! } });
      }
    }
    if (cands.length === 0) {
      st.overload = r.state;
      for (const key of Object.keys(cond.volt)) st.volt[key] = (st.volt[key] ?? 0) + dt;
      st.tS += dt;
      continue;
    }
    cands.sort((a, b) => a.atS - b.atS || cmpId(a.id, b.id));
    const first = cands[0]!;
    const r2 = stepOverload(st.overload, cond.loadings, first.atS);
    st.overload = r2.state;
    for (const t of r2.trips) if (t.id !== first.id) st.overload[t.id] = { frac: 1, belowS: 0 };
    for (const key of Object.keys(cond.volt)) st.volt[key] = (st.volt[key] ?? 0) + first.atS;
    st.tS += first.atS;
    events++;
    const imb = islandImbalancePu(net), ld = totalLoadPu(net);
    if (first.id.includes(':')) { // voltage relay
      const [kind, bus] = first.id.split(':') as [string, string];
      delete st.volt[first.id];
      if (kind === 'uv') {
        uvDone.add(bus);
        for (const l of net.loads) if (l.bus === bus) { l.p *= 1 - share; l.q *= 1 - share; }
        record(bus, 'load', first.cause, first.q, imb, ld);
      } else {
        const cand = net.branches.filter((b) => b.inService && (b.from === bus || b.to === bus)).sort((a, b) => b.bc - a.bc || cmpId(a.id, b.id))[0];
        if (cand) { open(cand.id); record(cand.id, 'branch', first.cause, first.q, imb, ld); }
        else { st.volt = {}; }
      }
    } else {
      open(first.id);
      record(first.id, 'branch', first.cause, first.q, imb, ld);
    }
  }
  st.uvDone = [...uvDone].sort(cmpId);
  return { net, solution: sol, flows: fl, state: st, replay, outcome, endS: st.tS, ensPu: sol.ensPu, tripped };
}
