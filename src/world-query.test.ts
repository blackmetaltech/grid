// The world query contract (M2.3): what the Godot diorama reads. Overlay values and world geometry must agree, be finite, and
// town lights must be derivable from `overlay('voltage')` (window energy = vPu^2, see godot/world/world_math.gd).
import { describe, expect, it } from 'vitest';
import { Engine } from '@core/kit';
import { GAME } from './game';
import { LEVEL_SPECS } from './level';
import type { GridState } from './types';

const play = (id: string, acts: [string, unknown[]][], ticks: number): Engine<GridState> => {
  const e = new Engine(GAME); e.act('startLevel', [id, 1, 'learner']);
  for (const [n, a] of acts) expect(e.act(n, a).ok).toBe(true);
  if (ticks > 0) e.act('tick', [ticks]);
  return e;
};
const finite = (x: unknown): boolean => JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NF__' : v)).indexOf('__NF__') < 0;

describe('world query contract', () => {
  it('exists on every level, is finite JSON, and its kind matches the level', () => {
    for (const spec of LEVEL_SPECS) {
      const e = new Engine(GAME); e.act('startLevel', [spec.id, 1, 'learner']); e.act('tick', [1]);
      const w = e.q('world') as any;
      expect(finite(w)).toBe(true);
      expect(w.level).toBe(spec.id);
      const staged = (spec.chapter === 4 || spec.chapter === 7) && w.kind === 'none';   // a level drawn by its own stage (chapters 4 and 7) has no world
      expect(staged ? 'none' : w.kind).toBe(staged ? 'none' : spec.kind === 'bench' ? 'bench' : 'grid');
      if (w.kind === 'grid') { expect(w.buses.length).toBeGreaterThan(0); expect(w.map.w).toBeGreaterThan(0); }   // chapter 6's frequency islands are one aggregate bus
    }
  });
  it('a caller that already holds the terrain gets it without its tiles; any other id gets them in full', () => {
    const e = play('L30', [], 0);
    const full = e.q('world') as any, lite = e.q('world', [full.terrain.id]) as any, other = e.q('world', ['elsewhere']) as any;
    expect(full.terrain.rows.length).toBe(full.terrain.nrows); expect(full.terrain.elev.length).toBe(full.terrain.cols * full.terrain.nrows);
    expect(lite.terrain.rows).toEqual([]); expect(lite.terrain.elev).toEqual([]); expect(lite.terrain.pollution).toBe('');
    expect({ ...lite, terrain: null }).toEqual({ ...full, terrain: null }); expect(lite.terrain.id).toBe(full.terrain.id);
    expect(other.terrain.rows).toEqual(full.terrain.rows);
    expect((e.q('world') as any).storage).toEqual([]);
  });
  it('every bus has a voltage in overlay(voltage) when energised, and the overlay covers exactly the energised buses', () => {
    const e = play('L07', [], 4);
    const w = e.q('world') as any; const v = (e.q('overlay', ['voltage']) as any).values as Record<string, number>;
    for (const b of w.buses) { expect(b.energised).toBe(b.id in v); if (b.energised) { expect(v[b.id]).toBeGreaterThan(0.5); expect(v[b.id]).toBeLessThan(1.3); } }
  });
  it('every branch has a loading entry and flow sign data; loading = |S|/rating consistent with flows', () => {
    const e = play('L07', [], 4);
    const w = e.q('world') as any; const l = (e.q('overlay', ['loading']) as any).values as Record<string, number>;
    for (const b of w.branches) { expect(b.id in l).toBe(true); expect(l[b.id]).toBeGreaterThanOrEqual(0); if (b.inService && l[b.id]! > 0.01) expect(Math.abs(b.pFromMW) + Math.abs(b.qFromMVAr)).toBeGreaterThan(0); }
  });
  it('P0: closing Line 7 raises the loading of T4 and the world reports it open before', () => {
    const e = play('P0', [], 1); const w0 = e.q('world') as any;
    expect(w0.branches.find((b: any) => b.id === 'T5').inService).toBe(false);
    const e2 = play('P0', [['switchBranch', ['T5', true]]], 2); const w1 = e2.q('world') as any;
    expect(w1.branches.find((b: any) => b.id === 'T5').inService).toBe(true);
  });
  it('bench levels expose homes and the per-hamlet voltage the lights read', () => {
    const e = play('L01', [['placeHut', [120]], ['layCable', ['main', 25]]], 2);
    const w = e.q('world') as any;
    expect(w.bench.homes).toEqual([10]); expect(w.bench.vLoadV.length).toBe(1); expect(w.bench.powered).toBe(true);
    expect(w.bench.vLoadV[0]).toBeCloseTo((e.q('benchStatus') as any).vLoadV[0], 3);
  });
});
