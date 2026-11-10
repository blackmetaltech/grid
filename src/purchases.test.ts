// Demolish refunds what the player bought this level, and only that: re-picking a battery, transformer or cable costs the difference;
// the district gear a level places for you (L30: the River Line, the harbour transformer) refunds nothing when taken down.
import { describe, expect, it } from 'vitest';
import { Engine } from '@core/kit';
import { GAME } from './game';
import type { GridState } from './types';

const l30 = (): Engine<GridState> => { const e = new Engine(GAME); e.act('startLevel', ['L30', 1, 'learner']); return e; };
const spent = (e: Engine<GridState>): number => e.state.budget.spent;

describe('purchases and refunds', () => {
  it('re-picking the island battery costs only the new one', () => {
    const a = l30(); expect(a.act('placeStorage', ['B8', 'isl-50kw-150kwh']).ok).toBe(true);
    const only = spent(a);
    const b = l30(); expect(b.act('placeStorage', ['B8', 'isl-25kw-50kwh']).ok).toBe(true);
    const id = b.state.storage.at(-1)!.id;
    expect(b.act('demolish', [id]).ok).toBe(true); expect(spent(b)).toBeCloseTo(0, 6);
    expect(b.act('placeStorage', ['B8', 'isl-50kw-150kwh']).ok).toBe(true); expect(spent(b)).toBeCloseTo(only, 6);
  });
  it('a transformer and a cable bought and taken down are refunded in full', () => {
    const e = l30();
    expect(e.act('layCableRoute', ['B5', 'B7', 'sub-11-120']).ok).toBe(true);
    expect(e.act('placeTransformer', ['B7', 'B8', 'dt-100']).ok).toBe(true);
    expect(spent(e)).toBeGreaterThan(0);
    for (const br of e.state.branches.filter((x) => Object.keys(e.state.purchases ?? {}).includes(x.id))) expect(e.act('demolish', [br.id]).ok).toBe(true);
    expect(spent(e)).toBeCloseTo(0, 6); expect(e.state.cables ?? []).toEqual([]);
  });
  it('the gear the level placed for you refunds nothing', () => {
    const e = l30(); const s = e.state;
    expect(s.purchases).toBeUndefined();
    const pre = s.branches.find((b) => b.kind !== 'cable')!;
    expect(e.act('demolish', [pre.id]).ok).toBe(true); expect(spent(e)).toBe(0);
  });
});

describe('actionCost', () => {
  it('prices a build on a copy: the cost equals what the real action charges, and the state is untouched', () => {
    const e = l30();
    const q = e.q('actionCost', ['placeStorage', ['B8', 'isl-50kw-150kwh']]) as { ok: boolean; cost: number };
    expect(q.ok).toBe(true); expect(e.state.storage.length).toBe(0); expect(e.state.budget.spent).toBe(0);
    e.act('placeStorage', ['B8', 'isl-50kw-150kwh']); expect(e.state.budget.spent).toBeCloseTo(q.cost, 2);
    const bad = e.q('actionCost', ['placeStorage', ['B1', 'nope']]) as { ok: boolean; message: string };
    expect(bad.ok).toBe(false); expect(bad.message.length).toBeGreaterThan(0);
    const cab = e.q('actionCost', ['layCableRoute', ['B5', 'B7', 'sub-11-120']]) as { ok: boolean; cost: number };
    expect(cab.ok).toBe(true); expect(cab.cost).toBeGreaterThan(0);
  });
});
