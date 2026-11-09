// Engine-level tests: actions teach on failure, determinism, saves, protocol, levels, personas, goldens.
import { describe, expect, it } from 'vitest';
import { Engine, Env, MemoryKV, checkAllLevels, createProtocol, play } from '@core/kit';
import { goldenFile, trajectory } from '@core/kit/golden';
import { GAME } from './game';

describe('sample game', () => {
  it('setValve rejects impossible openings with a teaching message', () => {
    const e = new Engine(GAME);
    const r = e.act('setValve', [140]);
    expect(r.ok).toBe(false); expect(r.message).toMatch(/0 % .* 100 %/);
    expect(e.act('setValve', ['lots']).message).toMatch(/number of percent/);
    expect(e.state.valve).toBe(0);
  });
  it('setValve tells the player where the tank will settle', () => {
    const e = new Engine(GAME); const r = e.act('setValve', [63]);
    expect(r.ok).toBe(true); expect(r.message).toMatch(/settle near 1\.10 m/);
  });
  it('same seed, same game', () => {
    const a = new Env(GAME), b = new Env(GAME);
    a.reset({ seed: 9 }); b.reset({ seed: 9 });
    for (let i = 0; i < 20; i++) { a.step({ name: 'setValve', args: [i * 5] }); a.step({ name: 'tick' }); b.step({ name: 'setValve', args: [i * 5] }); b.step({ name: 'tick' }); }
    expect(a.hash()).toBe(b.hash());
    const c = new Env(GAME); c.reset({ seed: 10 }); expect(c.state.h).not.toBe(a.engine.state.history[0]);
  });
  it('save and load round-trip through storage', () => {
    const kv = new MemoryKV(); const e = new Engine(GAME, { storage: kv });
    e.act('setValve', [50]); e.act('tick', [5]); const h = e.state.h;
    expect(e.act('save', ['slot2']).ok).toBe(true);
    e.act('tick', [5]); expect(e.state.h).not.toBe(h);
    expect(e.act('load', ['slot2']).ok).toBe(true); expect(e.state.h).toBe(h);
    const e2 = new Engine(GAME, { storage: kv });
    expect((e2.q('saves') as any[]).map((x) => x.slot)).toContain('slot2');
  });
  it('protocol: init, act, q, claim, env', () => {
    const h = createProtocol(new Engine(GAME));
    const init = h({ id: 1, fn: 'init' }); expect(init.ok).toBe(true); expect((init.result as any).actions).toContain('setValve');
    expect(h({ id: 2, fn: 'act', name: 'setValve', args: [30] }).ok).toBe(true);
    expect((h({ id: 3, fn: 'claim' }).result as any[])[0]?.id).toBe('first-valve');
    expect((h({ id: 4, fn: 'q', name: 'flows' }).result as any).valve).toBeCloseTo(0.3);
    expect(h({ id: 5, fn: 'q', name: 'nope' }).error).toMatch(/Unknown query 'nope'/);
    expect((h({ id: 6, fn: 'env', name: 'autoplay', args: ['expert', 30] }).result as any).tick).toBeGreaterThan(0);
  });
  it('every level is solvable, not won by idling, not cheesable in two moves', () => {
    for (const r of checkAllLevels(GAME, { seed: 1 })) expect(r.problems, r.level).toEqual([]);
  });
  it('personas play without violations', () => {
    for (const p of ['expert', 'idle', 'random']) for (const seed of [1, 2]) {
      const r = play(GAME, { persona: p, seed, ticks: 80 });
      expect(r.violations, `${p}/${seed}`).toEqual([]);
    }
    expect(play(GAME, { persona: 'expert', seed: 1, ticks: 120, level: 'steady' }).status).toBe('won');
    expect(play(GAME, { persona: 'idle', seed: 1, ticks: 200, level: 'steady' }).status).toBe('lost');
  });
  it('golden trajectories are unchanged (GOLDEN_UPDATE=1 to regenerate deliberately)', () => {
    const g = goldenFile(new URL('./__golden__/trajectories.json', import.meta.url).pathname);
    g.check('expert-1', trajectory(GAME, { seed: 1, ticks: 40, persona: 'expert' }));
    g.check('random-2', trajectory(GAME, { seed: 2, ticks: 40, persona: 'random' }));
    g.check('level-steady', trajectory(GAME, { seed: 1, ticks: 60, persona: 'expert', level: 'steady' }));
  });
});
