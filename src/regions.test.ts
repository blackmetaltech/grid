// The region seam: the whole game must run, stay solvable and keep every regional token to itself in EVERY registered pack
// (drafts included). Adding a pack to src/regions/index.ts puts it under all of these checks automatically.
import { describe, expect, it } from 'vitest';
import { Engine, Env, checkAllLevels, play } from '@core/kit';
import { expectNoRegionLeaks, findRegionLeaks, formatMoney, rulesetId } from '@core/regions';
import { GAME } from './game';
import { REGIONS } from './regions';
import { RIG } from './state';
import { PERSONAS } from './personas';

const PACKS = REGIONS.list({ includeDrafts: true });

/** Everything a player can see for one region: init data, the level queries, flows, the region query, the log after an expert run. */
function render(pack: { id: string }) {
  const e = new Engine(GAME, { region: pack.id }); e.autosave = false;
  const { regions: _r, drafts: _d, ...init } = e.init() as any;
  const out: Record<string, unknown> = { init, region: e.q('region'), flows0: e.q('flows'), cost0: e.q('costPerHour'), saves: e.saves.list() };
  const levels: unknown[] = [];
  for (const lv of GAME.levels ?? []) {
    const env = new Env(GAME); env.reset({ seed: 1, level: lv.id, region: pack.id });
    const agent = lv.solver!(1);
    for (let i = 0; i < 200 && env.state.status === 'playing'; i++) {
      for (const a of agent(env.state, env.ctx({ int: () => 0 } as any))) env.step(a);
      if (env.state.status === 'playing') env.step({ name: 'tick' });
    }
    levels.push({ level: env.engine.q('level'), flows: env.engine.q('flows'), cost: env.engine.q('costPerHour'), log: env.state.log, status: env.state.statusReason, code: env.engine.q('solutionCode') });
  }
  out.levels = levels;
  return out;
}

describe('region packs of the sample game', () => {
  it('ships global as the default; in is a draft', () => {
    expect(REGIONS.defaultId).toBe('global');
    expect(REGIONS.get('global').status).toBe('shipping'); expect(REGIONS.get('in').status).toBe('draft');
    const init = new Engine(GAME).init() as any;
    expect(init.regions.map((r: any) => r.id)).toEqual(['global']); expect(init.drafts.map((r: any) => r.id)).toEqual(['in']);
  });
  it('global is US$ with international standards; no pack touches the physics', () => {
    const g = REGIONS.get('global');
    expect(g.currency.code).toBe('USD'); expect(g.currency.symbol).toBe('$'); expect(g.numbers.grouping).toBe('western');
    for (const p of PACKS) expect(p.data.g, p.id).toBe(RIG.g);
  });
  it.each(PACKS.map((p) => [p.id]))('region %s: the game starts, plays, and every level is solvable', (id) => {
    const e = new Engine(GAME, { region: id! });
    expect(e.state.region).toBe(id); expect(e.state.ruleset).toBe(rulesetId(GAME.id, REGIONS.get(id!), GAME.rulesetVersion ?? 1));
    expect(e.state.site).toBe(REGIONS.get(id!).strings.site);
    for (const r of checkAllLevels(GAME, { seed: 1, region: id })) expect(r.problems, `${id}/${r.level}`).toEqual([]);
    for (const persona of Object.keys(PERSONAS)) expect(play(GAME, { persona, seed: 2, ticks: 60, region: id }).violations, `${id}/${persona}`).toEqual([]);
    expect(play(GAME, { persona: 'expert', seed: 1, ticks: 120, level: 'steady', region: id }).status).toBe('won');
  });
  it('physics is region-independent: the same moves give the same depth in every region', () => {
    const runs = PACKS.map((p) => { const env = new Env(GAME); env.reset({ seed: 4, level: 'steady', region: p.id }); env.step({ name: 'setValve', args: [63] }); for (let i = 0; i < 15; i++) env.step({ name: 'tick' }); return { h: env.state.h, water: env.state.waterUsedM3 }; });
    for (const r of runs) expect(r).toEqual(runs[0]);
  });
  it('regional values come from the pack: the water price is formatted in the region\'s currency', () => {
    const cost = (id: string) => { const e = new Engine(GAME, { region: id }); e.act('setValve', [100]); return e.q('costPerHour') as any; };
    const g = cost('global'), n = cost('in');
    expect(g.text).toMatch(/^Supply water costs \$1\.50 per m³: \$48\.60 per hour/);   // 0.009 m³/s × 3600 × 1.5
    expect(n.text).toMatch(/^Supply water costs ₹30\.00 per m³: ₹972\.00 per hour/);
    expect(n.m3PerHour).toBe(g.m3PerHour);
  });
  it('no regional token leaks between packs (init, levels, flows, region query, log, solution code)', () => {
    expectNoRegionLeaks(PACKS, render);
  });
  it('the leak test is live: it would catch a planted leak', () => {
    const hits = findRegionLeaks(PACKS, (p) => (p.id === 'global' ? { ...render(p), oops: `${formatMoney(5, REGIONS.get('in'))} at Yamuna Test Rig` } : render(p)));
    expect(hits.map((h) => h.marker).sort()).toEqual(['Yamuna Test Rig', '₹']);
  });
  it('unknown regions teach', () => {
    expect(() => new Engine(GAME, { region: 'mars' })).toThrow(/Unknown region 'mars'.*global, in/);
    expect(new Engine(GAME).act('newGame', [1, 'learner', 'mars']).message).toMatch(/Available regions: global, in/);
  });
});
