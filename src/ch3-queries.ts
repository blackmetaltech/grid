// Chapter 3 instrument queries (read-only), for the Godot panel godot/ui/ch3/ch3_panel.gd:
//   harmonics   (L08) the spectrum of the drives' voltage distortion at the mill bus, the capacitor current against its limit and the impedance-vs-frequency curve of the bus, for the
//               evening peak with the drives on (a what-if on a copy: banks not yet switched in are counted as in, flagged `asIf`); never changes the game.
//   seriesInfo  (L09) the line's R, X_L, the series capacitor's X_C, the far-end voltage now, and the fault (what it was, once it has happened) against the breaker's rating.
import type { QueryFn } from '@core/kit';
import type { GridState } from './types';
import type { SimParams } from './sim/params';
import { S_BASE_MVA } from './sim/network';
import { solveState } from './sim/solved';
import { harmonicStudy, impedanceSweep } from './sim/ch3/harmonics';
import { pathToSupply } from './sim/ch3/series';

const PEAK_BLOCK = 80;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function buildCh3Queries(d: { getParams: (s: GridState) => SimParams }): Record<string, QueryFn<GridState>> {
  return {
    harmonics: (s) => {
      const r = s.rules.ch3?.harmonics;
      if (!r) return { active: false };
      const f0 = d.getParams(s).f0;
      const c = structuredClone({ buses: s.buses, branches: s.branches, units: s.units, loads: s.loads, shunts: s.shunts, storage: s.storage }) as Pick<GridState, 'buses' | 'branches' | 'units' | 'loads' | 'shunts' | 'storage'>;
      const tanOf = (pf: number): number => (pf > 0 && pf < 1 ? Math.sqrt(1 - pf * pf) / pf : 0);
      for (const l of c.loads) { l.P = l.shape ? (l.shape.p[PEAK_BLOCK] ?? 0) * l.Ppeak : l.Ppeak; l.Q = l.shape ? (l.shape.q[PEAK_BLOCK] ?? 0) * l.Ppeak : l.Ppeak * tanOf(l.pf); l.shedFrac = 0; }
      let asIf = false;
      for (const h of c.shunts) if (h.kind === 'cap' && !h.blown && h.on === 0) { h.on = h.steps; asIf = true; }
      const sol = solveState({ ...c, solution: null });
      const res = harmonicStudy(c as unknown as GridState, r, f0, (b) => (sol.sol.energised[b] !== false ? sol.sol.V[b] : undefined));
      if (!res) return { active: true, ready: false };
      const hs: number[] = []; for (let h = 1; h <= 16.001; h += 0.2) hs.push(Math.round(h * 100) / 100);
      const sweep = impedanceSweep(c as unknown as GridState, r, f0, hs);
      const peak = sweep.reduce((a, p) => (p.zOhm > a.zOhm ? p : a), sweep[0]!);
      const blown = s.shunts.filter((h) => h.blown).map((h) => h.id);
      return {
        active: true, ready: true, asIf, bus: res.bus, f0, thdPct: r3(res.thdPct), thdMaxPct: r.thdMaxPct, capRmsMax: r.capRmsMax, i1A: r3(res.i1A),
        bars: r.orders.map((h) => ({ h, vPct: r3((res.vhV[h] ?? 0) / res.v1PhV * 100), iPct: r3(100 / h) })),
        banks: res.banks.map((b) => ({ id: b.id, kvar: Math.round(b.qNameplateMVAr * 1000), detunePct: r3(b.detunePct), ratio: r3(b.ratio), rmsA: r3(b.rmsA), ratedA: r3(b.ratedA), hParallel: r3(b.hParallel), sscMVA: r3(b.sscMVA) })),
        blown, sweep: sweep.map((p) => ({ h: p.h, z: r3(p.zOhm) })), peak: { h: peak.h, z: r3(peak.zOhm) }, orders: r.orders,
      };
    },
    seriesInfo: (s) => {
      const f = s.rules.ch3?.fault;
      if (!f) return { active: false };
      const bb = s.buses.find((b) => b.id === f.bus), line = pathToSupply(s, f.bus)[0];
      if (!bb || !line) return { active: false };
      const zb = bb.kvNom * bb.kvNom / S_BASE_MVA, xl = (line.seriesCap?.xGross ?? line.x) * zb, k = line.seriesCap?.pct ?? 0, tr = s.metrics.track;
      const sol = s.solution?.buses.find((b) => b.id === f.bus);
      return {
        active: true, lineId: line.id, kv: bb.kvNom, rOhm: r3(line.r * zb), xlOhm: r3(xl), xcOhm: r3(xl * k / 100), pct: k, vFarPu: sol ? r3(sol.vPu) : null, vMinPu: tr.loadVMinPu === undefined ? null : r3(tr.loadVMinPu),
        breakerKA: f.breakerKA, faultBlock: f.block, faultDone: tr.faultKA !== undefined, faultKA: tr.faultKA === undefined ? null : r3(tr.faultKA), faultKA0: tr.faultKA0 === undefined ? null : r3(tr.faultKA0), fResHz: tr.faultFResHz === undefined ? null : r3(tr.faultFResHz),
        farMinPu: s.rules.ch3?.loadVMinPu ?? null,
      };
    },
  };
}
