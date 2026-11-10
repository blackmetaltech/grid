// The world query: everything the Godot diorama draws that is not already an overlay (positions, kinds, flow sign, shed share), in
// plain finite JSON. Colour-valued data (bus voltage, branch loading) is NOT repeated here: the front-end reads `overlay('voltage')`
// and `overlay('loading')` so there is a single source of truth for the overlay-truth and town-lights-truth tests (DESIGN 9.8 items 3, 6).
import type { QueryFn } from '@core/kit';
import type { GridState } from './types';
import { solvedOf, toMW } from './sim/solved';
import { fin } from './sim/finite';
import { solveBench, HOMES, GEOM, SOURCE_V, type BenchParams } from './level/bench';
import { mapRows } from './level/maps';
import { terrainOf } from './level/maps';
import { replanRoutes, type RouteParams } from './route-actions';

const r3 = (x: number): number => Math.round(fin(x) * 1000) / 1000;

export interface WorldDeps { getBench: (s: GridState) => BenchParams; getRoute: (s: GridState) => RouteParams }
const r1 = (x: number): number => Math.round(fin(x) * 10) / 10;

export function buildWorldQueries(d: WorldDeps): Record<string, QueryFn<GridState>> {
  return {
    /** Geometry and discrete state of the map. `kind` is 'bench' on the DC bench levels, 'grid' when there are buses, else 'none'. */
    world: (s) => {
      const solved = solvedOf(s as GridState);
      const energised = new Set((s.solution?.buses ?? []).map((b) => b.id));
      const buses = s.buses.map((b) => {
        const ls = s.loads.filter((l) => l.bus === b.id);
        const demand = ls.reduce((a, l) => a + l.P, 0);
        const peak = ls.reduce((a, l) => a + l.Ppeak, 0);
        const served = ls.reduce((a, l) => a + l.P * (1 - l.shedFrac), 0);
        return { id: b.id, name: b.name, x: b.x, y: b.y, kv: b.kvNom, kind: b.kind, energised: energised.has(b.id), peakMW: r3(peak), demandMW: r3(demand), servedMW: r3(served), shed: demand > 0 ? r3(1 - served / demand) : 0 };
      });
      const branches = s.branches.map((b) => {
        const f = solved?.flows.branch[b.id];
        return { id: b.id, from: b.from, to: b.to, kind: b.kind, circuits: b.circuits, inService: b.inService, waypoints: b.waypoints.map((p) => [p[0], p[1]] as [number, number]), pFromMW: f ? r3(toMW(f.pFrom)) : 0, qFromMVAr: f ? r3(toMW(f.qFrom)) : 0, ratingMVA: r3(b.ratingMVA), overloadFrac: b.timer ? r3(b.timer.frac) : 0 };
      });
      const units = s.units.map((u) => ({ id: u.id, bus: u.bus, kind: u.kind, online: u.online, P: r3(u.P), pMax: r3(u.pMax), availMW: r3(u.availMW) }));
      const shunts = s.shunts.map((h) => ({ id: h.id, bus: h.bus, kind: h.kind, steps: h.steps, on: h.on }));
      let bench: unknown = null;
      if (s.bench) {
        const r = solveBench(s.bench, d.getBench(s as GridState));
        const sc = s.bench.scenario;
        bench = {
          scenario: sc, hutM: s.bench.hutM, mainMm2: s.bench.cableMm2.main, branchMm2: s.bench.cableMm2.b, topology: s.bench.topology, converters: s.bench.converters,
          homes: sc === 'l03' ? [] : [...(sc === 'l01' ? HOMES.l01 : HOMES.l02)], geom: GEOM, sourceV: SOURCE_V,
          powered: r.powered, vLoadV: r.vLoadV.map(r3), ampFracMax: r3(r.ampFracMax), vMinLimitV: s.bench.limits.vMinV, lossPct: r3(r.lossPct), lossMaxPct: s.bench.limits.lossMaxPct,
        };
      }
      const kind = s.bench ? 'bench' : s.buses.length > 0 ? 'grid' : 'none';
      let w = 0, h = 0;
      for (const b of s.buses) { w = Math.max(w, b.x); h = Math.max(h, b.y); }
      for (const b of s.branches) for (const p of b.waypoints) { w = Math.max(w, p[0]); h = Math.max(h, p[1]); }
      // the terrain the level stands on (rows as the map's tile characters, elevation per tile to 0.1 m) and the routes built on it, re-planned from their requests
      const tr = terrainOf(s.terrain);
      const terrain = tr && s.terrain ? { id: s.terrain, cols: tr.cols, nrows: tr.rows, tileM: tr.tileM, rows: [...(mapRows(s.terrain) ?? [])], elev: tr.elevM.map(r1), pollution: tr.pollution.join('') } : null;   // pollution: IEC 60815 class per tile (1-4), one digit each, row-major
      const routes = terrain ? replanRoutes(s as GridState, d.getRoute(s as GridState)) : [];
      const mapSize = tr ? { w: tr.cols, h: tr.rows } : { w: w + 4, h: h + 4 };
      return { kind, level: s.level, map: mapSize, buses, branches, units, shunts, bench, blackout: s.block.blackout, terrain, routes };
    },
  };
}
