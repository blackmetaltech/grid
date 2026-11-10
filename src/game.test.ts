// Engine-level tests: actions teach on failure, clock, determinism, saves, protocol, modes, levels, personas, goldens.
import { describe, expect, it } from 'vitest';
import { Engine, Env, MemoryKV, checkAllLevels, createProtocol, play, stableStringify } from '@core/kit';
import { goldenFile, trajectory } from '@core/kit/golden';
import { GAME } from './game';

describe('GRID engine (M0)', () => {
  it('starts as an empty grid at day 0 block 0 in the build phase', () => {
    const e = new Engine(GAME);
    expect(e.state.clock).toEqual({ day: 0, block: 0, phase: 'build', speed: 1 });
    expect(e.state.buses).toEqual([]); expect(e.state.metrics.cost).toBe(0); expect(e.state.metrics.predictions).toEqual([]);
    expect(e.state.region).toBe('global'); expect(e.state.ruleset).toBe('grid:global@2.1');
    expect(e.q('summary')).toEqual({ region: 'global', mode: 'learner', counts: { buses: 0, branches: 0, units: 0, loads: 0, shunts: 0, storage: 0 } });
  });
  it('the state is plain JSON: it survives a JSON round trip unchanged (no undefined, Maps or typed arrays)', () => {
    const e = new Engine(GAME); e.act('tick', [5]);
    expect(JSON.parse(JSON.stringify(e.state))).toStrictEqual(e.state);
    expect(typeof e.state.map.tiles).toBe('string'); expect(e.state.solution).toBeNull();
    expect(stableStringify(e.state)).not.toMatch(/#Map|#Set|#Date|#Uint/);
  });
  it('clock: one tick is one 15-minute block; 96 blocks roll the day over', () => {
    const e = new Engine(GAME);
    e.act('tick', [95]); expect(e.q('clock')).toMatchObject({ day: 0, block: 95, hour: 23, minute: 45 });
    e.act('tick'); expect(e.q('clock')).toMatchObject({ day: 1, block: 0, hour: 0, minute: 0, tick: 96 });
    e.act('tick', [96 + 5]); expect(e.q('clock')).toMatchObject({ day: 2, block: 5, minuteOfDay: 75 });
    expect(new Engine(GAME).q('clock')).toMatchObject({ blocksPerDay: 96 });
  });
  it('setSpeed rejects impossible speeds with a teaching message and accepts the allowed ones', () => {
    const e = new Engine(GAME);
    const r = e.act('setSpeed', [3]); expect(r.ok).toBe(false); expect(r.message).toMatch(/0 \(paused\), 0\.5, 1, 2 or 4/);
    expect(e.act('setSpeed', ['fast']).message).toMatch(/must be a number/);
    expect(e.state.clock.speed).toBe(1);
    expect(e.act('setSpeed', [4]).message).toMatch(/Clock speed 4x/); expect(e.state.clock.speed).toBe(4);
    expect(e.act('setSpeed', [0]).message).toMatch(/paused/);
  });
  it('modes: learner, engineer, sandbox (learner first); an unknown mode teaches', () => {
    const e = new Engine(GAME);
    expect(GAME.modes).toEqual(['learner', 'engineer', 'sandbox']);
    expect((e.init() as any).game.modes).toEqual(['learner', 'engineer', 'sandbox']);
    expect(e.act('setMode', ['sandbox']).ok).toBe(true); expect(e.state.mode).toBe('sandbox');
    expect(e.act('setMode', ['god']).message).toMatch(/Modes: learner, engineer, sandbox/);
    expect(new Engine(GAME, { mode: 'engineer' }).state.mode).toBe('engineer');
  });
  it('same seed, same game', () => {
    const a = new Env(GAME), b = new Env(GAME);
    a.reset({ seed: 9 }); b.reset({ seed: 9 });
    for (let i = 0; i < 20; i++) { a.step({ name: 'setSpeed', args: [[0, 0.5, 1, 2, 4][i % 5]] }); a.step({ name: 'tick' }); b.step({ name: 'setSpeed', args: [[0, 0.5, 1, 2, 4][i % 5]] }); b.step({ name: 'tick' }); }
    expect(a.hash()).toBe(b.hash());
  });
  it('save and load round-trip through storage', () => {
    const kv = new MemoryKV(); const e = new Engine(GAME, { storage: kv });
    e.act('setSpeed', [2]); e.act('tick', [100]); const before = stableStringify(e.state);
    expect(e.act('save', ['slot2']).ok).toBe(true);
    e.act('tick', [5]); expect(stableStringify(e.state)).not.toBe(before);
    expect(e.act('load', ['slot2']).ok).toBe(true); expect(stableStringify(e.state)).toBe(before);
    const e2 = new Engine(GAME, { storage: kv });
    expect((e2.q('saves') as any[]).map((x) => x.slot)).toContain('slot2');
    expect((e2.q('saves') as any[]).find((x) => x.slot === 'slot2').label).toMatch(/Lumen Province · day 2 · 0 buses/);
  });
  it('protocol: init, act, q, env', () => {
    const h = createProtocol(new Engine(GAME));
    const init = h({ id: 1, fn: 'init' }); expect(init.ok).toBe(true); expect((init.result as any).actions).toContain('setSpeed'); expect((init.result as any).queries).toEqual(expect.arrayContaining(['clock', 'summary']));
    expect(h({ id: 2, fn: 'act', name: 'setSpeed', args: [2] }).ok).toBe(true);
    expect((h({ id: 3, fn: 'q', name: 'clock' }).result as any).speed).toBe(2);
    expect(h({ id: 4, fn: 'q', name: 'nope' }).error).toMatch(/Unknown query 'nope'/);
    expect((h({ id: 5, fn: 'env', name: 'autoplay', args: ['idle', 30] }).result as any).tick).toBeGreaterThan(0);
  });
  it('every level is solvable, not won by idling, not cheesable in two moves', () => {
    for (const r of checkAllLevels(GAME, { seed: 1 })) expect(r.problems, r.level).toEqual([]);
  });
  it('personas play without violations', () => {
    for (const p of ['idle', 'random']) for (const seed of [1, 2]) {
      const r = play(GAME, { persona: p, seed, ticks: 250 });
      expect(r.violations, `${p}/${seed}`).toEqual([]);
    }
    expect(play(GAME, { persona: 'idle', seed: 1, ticks: 20, level: 'T00' }).status).toBe('lost');
  });
  it('golden trajectories are unchanged (GOLDEN_UPDATE=1 to regenerate deliberately)', () => {
    const g = goldenFile(new URL('./__golden__/trajectories.json', import.meta.url).pathname);
    g.check('idle-1', trajectory(GAME, { seed: 1, ticks: 120, persona: 'idle' }));
    g.check('random-2', trajectory(GAME, { seed: 2, ticks: 120, persona: 'random' }));
    g.check('level-T00', trajectory(GAME, { seed: 1, ticks: 20, persona: 'idle', level: 'T00' }));
  });
});
