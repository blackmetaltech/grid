// L23 / L27: the 33 kV industrial board. Zbus fault by the engine's FaultStudy (src/sim/protection), breaker duties by branch and generator contributions,
// the breaker-failure backup by `clearFault`, and the N-1 voltage by the series-reactance load formula. Oracle: tools/oracles/ch7_oracles.py (numpy Zbus).
import { abs, cx, sub } from '@core/numerics';
import { S_BASE_MVA, type Net } from '../network';
import { FaultStudy, clearFault, type Breaker, type FaultBranchInfo, type FaultGen, type FaultModel } from '../protection';
import { SC } from './data';
import type { L23Design } from './state';

const BUS_KV: Record<string, number> = { H: 132, A: 33, B: 33 };

/** pu (100 MVA) fault model of the board: grid at H (132 kV), transformers YNd to A and B, bus-section branch A-B (the coupler or its reactor; null = open), captive generators. */
export function boardModel(ukPct: number, couplerX: number | null, extraGen = 0, extraXfmr = 0): FaultModel {
  const c = SC.l23, xt = (ukPct / 100) * (S_BASE_MVA / c.xfmr.mva), xg = c.gen.xdd * (S_BASE_MVA / c.gen.mva), xs = S_BASE_MVA / c.gridSscMVA;
  const br = (id: string, from: string, to: string, x: number) => ({ id, from, to, r: 0, x, bc: 0, inService: true });
  const branches = [br('T1', 'H', 'A', xt), br('T2', 'H', 'B', xt)];
  if (extraXfmr > 0) branches.push(br('T3', 'H', 'A', xt));
  if (couplerX !== null) branches.push(br('BC', 'A', 'B', couplerX));
  const net: Net = { buses: Object.entries(BUS_KV).map(([id, kV]) => ({ id, kV })), branches, shunts: [], loads: [], units: [] };
  const gens: FaultGen[] = [{ bus: 'H', x1: xs }, { bus: 'A', x1: xg }, { bus: 'B', x1: xg }];
  if (extraGen > 0) gens.push({ bus: 'B', x1: xg });
  const branchInfo: Record<string, FaultBranchInfo> = { T1: { kind: 'xfmr', group: 'YNd' }, T2: { kind: 'xfmr', group: 'YNd' }, T3: { kind: 'xfmr', group: 'YNd' }, BC: { kind: 'line' } };
  return { net, gens, branchInfo };
}

export interface BoardFault {
  /** Symmetrical 3-phase and single-line-to-ground fault current at the faulted 33 kV section, kA. */
  threePhKA: number; slgKA: number; mva: number;
  /** Thevenin impedance at the fault bus (pu). */
  zth: number;
  /** Current through each breaker of the board for a 3-phase fault on the feeder just beyond F1 (kA): the feeder sees all of it, each source breaker its own share. */
  duty: { id: string; kA: number; role: string }[];
}

export function boardFault(m: FaultModel): BoardFault {
  const st = new FaultStudy(m), kv = BUS_KV.A!, ib = S_BASE_MVA / (Math.sqrt(3) * kv);
  const f3 = st.fault('A', '3ph'), fg = st.fault('A', 'slg');
  const duty: BoardFault['duty'] = [{ id: 'F1', kA: f3.iFaultKA, role: 'feeder' }];
  for (const b of m.net.branches) {
    const r = f3.branch[b.id];
    if (!r) continue;
    duty.push({ id: b.id === 'T1' || b.id === 'T3' ? 'IN' + b.id.slice(1) : b.id === 'T2' ? 'IN2' : b.id, kA: r.iKA, role: b.id === 'BC' ? 'coupler' : 'incomer' });
  }
  // generator contribution: I = (V_pre - V_bus) / jX ; magnitude |1 - V1| / x
  m.gens.filter((g) => g.bus !== 'H').forEach((g, i) => {
    const v = f3.V1[g.bus] ?? cx(1, 0), d = sub(cx(1, 0), v);
    duty.push({ id: 'G' + (i + 1), kA: (abs(d) / g.x1) * ib, role: 'generator' });
  });
  return { threePhKA: f3.iFaultKA, slgKA: fg.iFaultKA, mva: f3.sMVA, zth: abs(f3.z1), duty };
}

/** x of a series reactance from v1 to a constant-PQ load: |V2|^4 + (2 q x - v1^2)|V2|^2 + x^2 (p^2 + q^2) = 0, larger root (lossless line). */
export function loadVoltage(v1: number, x: number, p: number, q: number): number {
  const b = 2 * q * x - v1 * v1, c = x * x * (p * p + q * q), d = b * b - 4 * c;
  return d < 0 ? 0 : Math.sqrt((-b + Math.sqrt(d)) / 2);
}

export interface L23Study {
  fault: BoardFault; rating: number; ok: boolean; dutyRatio: number;
  capexUSD: number; n1Secure: boolean; n1VPu: number;
  /** The breaker-failure sequence when F1 is under-rated: events with times (s) and which breakers opened; ENS in MWh. */
  sequence: { tS: number; id: string; what: 'fault' | 'relay' | 'opens' | 'fails' | 'backup' | 'dark' }[];
  failedBreakers: string[]; clearedAtS: number; ensMWh: number;
  preGensKA: number;
}

const RELAY_S = 0.02, INTERRUPT_CYCLES = 3, F0 = 50;

export function couplerX(d: Pick<L23Design, 'coupler' | 'reactor'>): number | null {
  return d.coupler === 'open' ? null : d.reactor > 0 ? d.reactor : SC.l23.couplerTieX;
}

export function studyL23(d: L23Design): L23Study {
  const c = SC.l23, cx_ = couplerX(d), m = boardModel(d.uk, cx_), f = boardFault(m);
  const ratingIdx = c.breakers.ratingsKA.indexOf(d.rating), ukIdx = c.xfmr.ukPct.indexOf(d.uk), reIdx = [0, ...c.reactorX.slice(1)].indexOf(d.reactor);
  const capex = c.breakers.count * c.breakers.price[Math.max(0, ratingIdx)]! + c.xfmr.extraPrice[Math.max(0, ukIdx)]! + c.reactorPrice[Math.max(0, reIdx)]!;
  // breaker-failure sequence, with the engine's clearFault (relay 20 ms, 3-cycle breakers, 200 ms breaker-failure delay)
  const brk: Breaker[] = f.duty.map((x) => ({ id: x.id, ratedKA: d.rating, cycles: INTERRUPT_CYCLES, adjacent: x.id === 'F1' ? f.duty.filter((y) => y.id !== 'F1').map((y) => y.id) : [] }));
  const cf = clearFault(brk, { F1: RELAY_S }, Object.fromEntries(f.duty.map((x) => [x.id, x.kA])), F0);
  const sequence: L23Study['sequence'] = [{ tS: 0, id: 'F1', what: 'fault' }, { tS: RELAY_S, id: 'F1', what: 'relay' }];
  for (const id of cf.failed) sequence.push({ tS: RELAY_S + INTERRUPT_CYCLES / F0, id, what: 'fails' });
  for (const e of cf.events) sequence.push({ tS: e.tS, id: e.breaker, what: e.cause.key === 'breaker.opened' ? 'opens' : 'backup' });
  const ok = f.threePhKA <= d.rating;
  const lastBackup = cf.events.reduce((mx, e) => Math.max(mx, e.tS), 0);
  if (!ok) sequence.push({ tS: Math.max(0.5, lastBackup), id: 'estate', what: 'dark' });
  sequence.sort((a, b) => a.tS - b.tS);
  // N-1 (one transformer out, generators off, whole estate on the other path): voltage at the load bus; an open coupler leaves a section dark.
  const xt = (d.uk / 100) * (S_BASE_MVA / c.xfmr.mva), xs = S_BASE_MVA / c.gridSscMVA, sa = c.estate.mva / S_BASE_MVA, p = sa * c.estate.pf, q = sa * Math.sqrt(1 - c.estate.pf * c.estate.pf);
  let n1VPu: number, n1Secure: boolean;
  if (cx_ === null) { n1VPu = loadVoltage(1, xs + xt, p / 2, q / 2); n1Secure = false; }
  else {
    const va = loadVoltage(1, xs + xt, p, q), vb = loadVoltage(va, cx_, p / 2, q / 2);
    n1VPu = Math.min(loadVoltage(va, 1e-9, p / 2, q / 2), vb); n1Secure = true;
  }
  return {
    fault: f, rating: d.rating, ok, dutyRatio: f.threePhKA / d.rating, capexUSD: capex, n1Secure, n1VPu, sequence, failedBreakers: cf.failed, clearedAtS: ok ? RELAY_S + INTERRUPT_CYCLES / F0 : Math.max(0.5, lastBackup),
    ensMWh: ok ? 0 : c.estate.mva * c.estate.pf * c.outageH, preGensKA: preGensKA(),
  };
}

/** The fault level before the new captive generators: the same board with only the grid behind it (the 21 kA the old 25 kA breakers were bought for). */
export function preGensKA(): number {
  const m = boardModel(SC.l23.xfmr.ukPct[0]!, SC.l23.couplerTieX);
  m.gens = m.gens.filter((g) => g.bus === 'H');
  return new FaultStudy(m).fault('A', '3ph').iFaultKA;
}

/** L27's grown board: one more captive generator and one more transformer, coupler closed (tie), standard 10 % transformers. */
export function grownBoard(): BoardFault {
  return boardFault(boardModel(SC.l23.xfmr.ukPct[0]!, SC.l23.couplerTieX, SC.l27.board.extraGen, SC.l27.board.extraXfmr));
}
