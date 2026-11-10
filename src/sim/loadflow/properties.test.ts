// Property tests P1, P2, P4, P9-P13 on seeded random networks (DESIGN 9.2). N = 2000 (GRID_FUZZ_N overrides).
import { beforeAll, describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import { dmath as dm } from '@core/numerics';
import { cmpId, findIslands, islandLoadPu, type Net } from '../network';
import { buildCases, effectiveNet, flows, solveCase, solveGS, solveNetwork, type Flows, type NetSolution } from './index';
import { genNetwork } from './gen';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);
const SEED0 = 20260101;

interface Rec { seed: number; net: Net; sol: NetSolution; eff: Net; f: Flows | null }
const recs: Rec[] = [];
const stats = { total: 0, converged: 0, collapsed: 0, failed: 0, withIslands: 0, dark: 0, qLimited: 0, maxBuses: 0 };
const tag = (r: Rec) => `seed ${r.seed}`;

beforeAll(() => {
  for (let k = 0; k < N; k++) {
    const seed = SEED0 + k;
    const net = genNetwork(seed);
    const sol = solveNetwork(net);
    stats.total++;
    stats.maxBuses = Math.max(stats.maxBuses, net.buses.length);
    if (sol.islands.length > 1) stats.withIslands++;
    if (sol.islands.some((i) => !i.energised)) stats.dark++;
    if (Object.values(sol.kind).some((x) => x === 'pq-max' || x === 'pq-min')) stats.qLimited++;
    if (!sol.converged) { stats.failed++; recs.push({ seed, net, sol, eff: net, f: null }); continue; }
    stats.converged++;
    if (sol.islands.some((i) => i.collapse)) stats.collapsed++;
    const eff = effectiveNet(net, sol);
    recs.push({ seed, net, sol, eff, f: flows(eff, sol) });
  }
}, 120000);

const ok = (): Rec[] => recs.filter((r) => r.f !== null);

describe('random-case health', () => {
  it('reports the exclusion rate (never silent): failed cases are counted, and are rare', () => {
    // eslint-disable-next-line no-console
    console.log(`LF fuzz: ${JSON.stringify(stats)} failed-rate ${(100 * stats.failed / stats.total).toFixed(2)} %`);
    expect(stats.failed / stats.total).toBeLessThan(0.02);
    expect(stats.withIslands).toBeGreaterThan(0.05 * N);
    expect(stats.qLimited).toBeGreaterThan(0);
  });
});

describe('P1 power balance', () => {
  it('sum P_gen - sum P_load - losses = 0 (and Q with shunts and charging) per energised network', () => {
    let worstP = 0, worstQ = 0;
    for (const r of ok()) {
      const f = r.f!;
      const eP = Math.abs(f.totalGenP - f.totalLoadP - f.totalLossP);
      // Q: generation - load = branch Q (incl. charging, negative) + shunt Q (negative when delivering)
      const eQ = Math.abs(f.totalGenQ - f.totalLoadQ - (f.lossQ + f.shuntQ));
      worstP = Math.max(worstP, eP); worstQ = Math.max(worstQ, eQ);
      expect(eP, `${tag(r)} P`).toBeLessThan(1e-8);
      expect(eQ, `${tag(r)} Q`).toBeLessThan(1e-8);
    }
    console.log(`P1 worst |P| ${worstP.toExponential(2)} |Q| ${worstQ.toExponential(2)}`);
  });
});

describe('P2 KCL at every bus', () => {
  it('sum of branch flows out of the bus + shunt = scheduled injection (P everywhere, Q at PQ-type buses)', () => {
    let worst = 0;
    for (const r of ok()) {
      const f = r.f!;
      const net = r.eff;
      const out = new Map<string, { p: number; q: number }>();
      const merged = (id: string): string => { for (const m of Object.keys(f.bus)) if (m === id) return m; return id; };
      void merged;
      // map original bus -> merged bus via the solution voltage identity (ties are absent in generated cases)
      for (const b of net.buses) out.set(b.id, { p: 0, q: 0 });
      for (const br of net.branches) {
        if (!br.inService) continue;
        const fl = f.branch[br.id]!;
        out.get(br.from)!.p += fl.pFrom; out.get(br.from)!.q += fl.qFrom;
        out.get(br.to)!.p += fl.pTo; out.get(br.to)!.q += fl.qTo;
      }
      for (const b of net.buses) {
        if (!r.sol.energised[b.id]) continue;
        const kind = r.sol.kind[b.id]!;
        const bal = f.bus[b.id]!;
        const o = out.get(b.id)!;
        const eP = Math.abs(o.p + bal.shuntP - (bal.pGen - bal.pLoad));
        if (kind !== 'slack') { worst = Math.max(worst, eP); expect(eP, `${tag(r)} P at ${b.id}`).toBeLessThan(1e-8); }
        if (kind === 'pq') {
          const eQ = Math.abs(o.q + bal.shuntQ - (bal.qGen - bal.qLoad));
          worst = Math.max(worst, eQ); expect(eQ, `${tag(r)} Q at ${b.id}`).toBeLessThan(1e-8);
        }
      }
    }
    console.log(`P2 worst KCL residual ${worst.toExponential(2)} pu`);
  });
});

describe('P4 losses >= 0', () => {
  it('every passive branch P_from + P_to >= -1e-12 and total losses >= 0', () => {
    for (const r of ok()) {
      for (const br of r.eff.branches) if (br.inService) {
        const fl = r.f!.branch[br.id]!;
        expect(fl.lossP, `${tag(r)} ${br.id}`).toBeGreaterThanOrEqual(-1e-12);
      }
      expect(r.f!.lossP).toBeGreaterThanOrEqual(-1e-12);
      expect(r.f!.totalLossP).toBeGreaterThanOrEqual(-1e-12);
    }
  });
});

describe('P9 ordering invariance', () => {
  it('permuting bus / branch / unit / load ids and array order gives the same physical solution', () => {
    const rng = new Rng(0x909);
    let checked = 0, skipped = 0;
    for (const r of ok().slice(0, Math.min(N, 600))) {
      if (r.sol.islands.some((i) => i.collapse)) { skipped++; continue; } // continuation sheds depend on tie order of equal sensitivities
      const ids = r.net.buses.map((b) => b.id);
      const perm = rng.shuffle(ids);
      const map = new Map(ids.map((id, i) => [id, `z${perm[i]}`]));
      const m = (id: string) => map.get(id)!;
      const p: Net = {
        buses: rng.shuffle(r.net.buses.map((b) => ({ ...b, id: m(b.id) }))),
        branches: rng.shuffle(r.net.branches.map((b) => ({ ...b, id: `y${b.id}`, from: m(b.from), to: m(b.to) }))),
        shunts: rng.shuffle(r.net.shunts.map((s) => ({ ...s, id: `y${s.id}`, bus: m(s.bus) }))),
        loads: rng.shuffle(r.net.loads.map((l) => ({ ...l, id: `y${l.id}`, bus: m(l.bus) }))),
        units: rng.shuffle(r.net.units.map((u) => ({ ...u, id: `y${u.id}`, bus: m(u.bus) }))),
      };
      const s2 = solveNetwork(p);
      expect(s2.converged, tag(r)).toBe(true);
      for (const id of ids) {
        expect(Math.abs(s2.V[m(id)]! - r.sol.V[id]!), `${tag(r)} V ${id}`).toBeLessThan(1e-6);
        expect(Math.abs(s2.theta[m(id)]! - r.sol.theta[id]!), `${tag(r)} th ${id}`).toBeLessThan(1e-6);
      }
      checked++;
    }
    console.log(`P9 checked ${checked}, skipped ${skipped} (continuation cases)`);
    expect(checked).toBeGreaterThan(100);
  });
});

describe('P10 NR = GS on unique high-voltage cases', () => {
  it('lightly loaded single-island cases without Q limits: both methods agree to 1e-8', () => {
    let compared = 0, gsFail = 0, notApplicable = 0;
    for (let k = 0; k < N; k++) {
      const seed = SEED0 + 7_000_000 + k;
      const net = genNetwork(seed, { maxBuses: 14, islandProb: 0, loadFactor: [0.2, 0.5] });
      const { cases } = buildCases(net);
      if (cases.length !== 1) { notApplicable++; continue; }
      const c = cases[0]!.c;
      const nr = solveCase(c, { qLimits: false });
      if (!nr.converged || Math.min(...nr.V) < 0.8) { notApplicable++; continue; }
      const gs = solveGS(c, { maxIter: 3000, tol: 1e-11, accel: 1.4 });
      if (!gs.converged) { gsFail++; continue; }
      compared++;
      for (let i = 0; i < c.n; i++) {
        expect(Math.abs(gs.V[i]! - nr.V[i]!), `seed ${seed} V ${c.ids[i]}`).toBeLessThan(1e-8);
        expect(Math.abs(gs.th[i]! - nr.th[i]!), `seed ${seed} th ${c.ids[i]}`).toBeLessThan(1e-8);
      }
    }
    console.log(`P10 compared ${compared}, GS did not converge in 3000 sweeps ${gsFail}, not applicable ${notApplicable}`);
    expect(compared).toBeGreaterThan(0.5 * N);
  });
});

describe('P11 warm = flat start', () => {
  it('a warm start from a neighbouring operating point reaches the same (high-voltage) solution', () => {
    let compared = 0, lowV = 0;
    for (const r of ok()) {
      if (r.sol.islands.some((i) => i.collapse) || r.sol.qUnsettled.length) continue;
      const lighter: Net = { ...r.net, loads: r.net.loads.map((l) => ({ ...l, p: l.p * 0.85, q: l.q * 0.85 })) };
      const s0 = solveNetwork(lighter, { continuation: false });
      if (!s0.converged) continue;
      const warm = solveNetwork(r.net, { warm: s0, continuation: false });
      if (!warm.converged) continue;
      if (Math.min(...Object.entries(r.sol.V).filter(([id]) => r.sol.energised[id]).map(([, v]) => v)) < 0.7) { lowV++; continue; }
      compared++;
      for (const id of Object.keys(r.sol.V)) {
        expect(Math.abs(warm.V[id]! - r.sol.V[id]!), `${tag(r)} V ${id}`).toBeLessThan(1e-7);
        expect(Math.abs(warm.theta[id]! - r.sol.theta[id]!), `${tag(r)} th ${id}`).toBeLessThan(1e-7);
      }
    }
    console.log(`P11 compared ${compared}, low-voltage cases not compared ${lowV}`);
    expect(compared).toBeGreaterThan(0.5 * N);
  });
});

describe('P12 Q limits honoured', () => {
  it('every PV unit stays within [Q_min(V), Q_max(V)]; limited buses sit exactly on the limit', () => {
    let pvChecked = 0, limited = 0, unsettled = 0;
    for (const r of ok()) {
      if (r.sol.qUnsettled.length) { unsettled++; continue; }
      for (const b of r.eff.buses) {
        const kind = r.sol.kind[b.id]!;
        if (kind !== 'pv' && kind !== 'pq-max' && kind !== 'pq-min') continue;
        const V = r.sol.V[b.id]!;
        let qmax = 0, qmin = 0;
        for (const u of r.eff.units) {
          if (!u.online || u.bus !== b.id) continue;
          if (u.kind === 'sync' || u.kind === 'bess-gfm' || (u.kind === 'inverter' && u.vSet !== undefined)) { qmax += u.qMax ?? 1e6; qmin += u.qMin ?? -1e6; }
          if (u.kind === 'statcom') { qmax += (u.iMax ?? 0) * V; qmin -= (u.iMax ?? 0) * V; }
          if (u.kind === 'svc') { qmax += (u.bMax ?? 0) * V * V; qmin += (u.bMin ?? 0) * V * V; }
        }
        const q = r.f!.qAtPv[b.id]!;
        expect(q, `${tag(r)} ${b.id} Q ${q} max ${qmax}`).toBeLessThanOrEqual(qmax + 1e-7);
        expect(q, `${tag(r)} ${b.id} Q ${q} min ${qmin}`).toBeGreaterThanOrEqual(qmin - 1e-7);
        if (kind === 'pq-max') { expect(Math.abs(q - qmax)).toBeLessThan(1e-7); limited++; }
        if (kind === 'pq-min') { expect(Math.abs(q - qmin)).toBeLessThan(1e-7); limited++; }
        pvChecked++;
      }
    }
    console.log(`P12 regulating buses checked ${pvChecked}, at a limit ${limited}, cases with unsettled Q limits (excluded) ${unsettled}`);
    expect(limited).toBeGreaterThan(0);
  });
});

describe('P13 islands', () => {
  it('de-energised islands carry zero flow and their ENS equals their load', () => {
    let dark = 0;
    for (const r of recs) {
      const isl = findIslands(r.net);
      let ens = 0;
      for (const i of isl) {
        if (i.energised) continue;
        dark++;
        ens += islandLoadPu(r.net, i);
        for (const b of i.buses) { expect(r.sol.V[b]).toBe(0); expect(r.sol.energised[b]).toBe(false); }
      }
      const collapseShed = r.sol.islands.reduce((s, i) => s + (i.collapse ? i.collapse.shedPu : 0), 0);
      expect(Math.abs(r.sol.ensPu - (ens + collapseShed)), tag(r)).toBeLessThan(1e-9);
      if (r.f) for (const br of r.net.branches) {
        const dead = !r.sol.energised[br.from] && !r.sol.energised[br.to];
        if (dead) { const fl = r.f.branch[br.id]!; expect(fl.pFrom).toBe(0); expect(fl.qFrom).toBe(0); expect(fl.iKA).toBe(0); }
      }
    }
    console.log(`P13 dark islands seen ${dark}`);
    expect(dark).toBeGreaterThan(0);
  });
});

void dm; void cmpId;
