// The region seam: the whole game must run, stay solvable and keep every regional token to itself in EVERY registered pack
// (drafts included); pack data must validate; the release gate and the ruleset pins must hold.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine, Env, checkAllLevels, play } from '@core/kit';
import { expectNoRegionLeaks, findRegionLeaks, formatMoney, rulesetId } from '@core/regions';
import { GAME } from './game';
import { REGIONS } from './regions';
import { PERSONAS } from './personas';
import { checkPin, packDataHash, releaseGateProblems, validateGridData, type GridRegionData } from './regions/data';
import { PINS } from './regions/pins';
import { GLOBAL } from './regions/global';
import { IN } from './regions/in';

const PACKS = REGIONS.list({ includeDrafts: true });
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const dataOf = (p: { data: GridRegionData }): GridRegionData => clone(p.data);

/** Everything a player can see for one region: init data, the region/clock/summary queries, the log, the level runs. */
function render(pack: { id: string }) {
  const e = new Engine(GAME, { region: pack.id }); e.autosave = false;
  const { regions: _r, drafts: _d, ...init } = e.init() as any;
  const out: Record<string, unknown> = { init, region: e.q('region'), clock: e.q('clock'), summary: e.q('summary'), log: e.state.log, saves: e.saves.list() };
  e.act('save', ['main']); out.saveLabel = e.saves.list();
  const levels: unknown[] = [];
  for (const lv of GAME.levels ?? []) {
    const env = new Env(GAME); env.reset({ seed: 1, level: lv.id, region: pack.id });
    const agent = lv.solver!(1);
    for (let i = 0; i < 50 && env.state.status === 'playing'; i++) {
      for (const a of agent(env.state, env.ctx({ int: () => 0 } as any))) env.step(a);
      if (env.state.status === 'playing') env.step({ name: 'tick' });
    }
    levels.push({ level: env.engine.q('level'), log: env.state.log, status: env.state.statusReason, code: env.engine.q('solutionCode') });
  }
  out.levels = levels;
  return out;
}

describe('region packs of GRID', () => {
  it('ships global as the default; in is a draft', () => {
    expect(REGIONS.defaultId).toBe('global');
    expect(REGIONS.get('global').status).toBe('shipping'); expect(REGIONS.get('in').status).toBe('draft');
    const init = new Engine(GAME).init() as any;
    expect(init.regions.map((r: any) => r.id)).toEqual(['global']); expect(init.drafts.map((r: any) => r.id)).toEqual(['in']);
  });
  it('global is US$, western grouping, 50 Hz, IEC 60038 voltages and the Lumen Grid Code values of DESIGN §4.7', () => {
    const g = REGIONS.get('global');
    expect(g.currency).toMatchObject({ code: 'USD', symbol: '$' }); expect(g.numbers.grouping).toBe('western');
    const d = g.data;
    expect(d.f0).toBe(50); expect([d.voltage.lvPhaseV, d.voltage.lvLineV]).toEqual([230, 400]); expect(d.voltage.levelsKv).toEqual([11, 33, 66, 132, 220, 400]);
    expect(d.gridcode.ufls.map((u) => [u.hz, u.shedPct, u.delayS])).toEqual([[49, 5, 0.2], [48.8, 8, 0.2], [48.6, 8, 0.2], [48.4, 8, 0.2], [48.2, 8, 0.2], [48, 8, 0.2]]);
    expect(d.gridcode.standardRangeHz).toEqual([49.95, 50.05]); expect(d.gridcode.fcrDeadbandHz).toBe(0.01); expect(d.gridcode.droopRangePct).toEqual([2, 12]);
    expect(d.gridcode.genUfTrip).toEqual({ hz: 47.5, s: 0.5 }); expect(d.gridcode.genOfTrip).toEqual({ hz: 51.5, s: 2 }); expect(d.gridcode.settlementMin).toBe(15);
    expect([d.economy.vollPerMWh, d.economy.energyPricePerMWh]).toEqual([10000, 50]);
    expect(g.strings.region).toBe('Lumen Province');
  });
  it('in is the draft: rupees with lakh grouping, IEGC values, 4 UFLS stages', () => {
    const n = REGIONS.get('in');
    expect(n.currency.code).toBe('INR'); expect(n.numbers.grouping).toBe('indian');
    expect(formatMoney(1234567, n)).toBe('₹12,34,567.00');
    expect(n.data.gridcode.ufls.map((u) => [u.hz, u.shedPct])).toEqual([[49.4, 5], [49.2, 6], [49, 7], [48.8, 7]]);
    expect(n.data.gridcode.standardRangeHz).toEqual([49.9, 50.05]);
  });
  it.each(PACKS.map((p) => [p.id]))('region %s: the game starts, plays, and every level is solvable', (id) => {
    const e = new Engine(GAME, { region: id! });
    expect(e.state.region).toBe(id); expect(e.state.ruleset).toBe(rulesetId(GAME.id, REGIONS.get(id!), GAME.rulesetVersion ?? 1));
    const p = REGIONS.get(id!);
    expect(e.state.freq.fHz).toBe(p.data.f0); expect(e.state.map.latitudeDeg).toBe(p.data.climate.latitudeDeg);
    expect(e.state.protection.ufls.map((u) => u.hz)).toEqual(p.data.gridcode.ufls.map((u) => u.hz));
    expect(e.state.log[0]!.text).toContain(p.strings.region!);
    for (const r of checkAllLevels(GAME, { seed: 1, region: id })) expect(r.problems, `${id}/${r.level}`).toEqual([]);
    for (const persona of Object.keys(PERSONAS)) expect(play(GAME, { persona, seed: 2, ticks: 120, region: id }).violations, `${id}/${persona}`).toEqual([]);
    const env = new Env(GAME); env.reset({ seed: 1, level: 'T00', region: id });
    env.step({ name: 'setSpeed', args: [4] }); for (let i = 0; i < 8; i++) env.step({ name: 'tick' });
    expect(env.state.status).toBe('won');
  });
  it('the simulation clock is region-independent: the same moves give the same clock in every region', () => {
    const runs = PACKS.map((p) => { const env = new Env(GAME); env.reset({ seed: 4, level: 'T00', region: p.id }); env.step({ name: 'setSpeed', args: [4] }); for (let i = 0; i < 8; i++) env.step({ name: 'tick' }); return { clock: env.state.clock, status: env.state.status, tick: env.state.tick }; });
    for (const r of runs) expect(r).toEqual(runs[0]);
  });
  it('physics invariance (static): nothing under src/sim imports a region pack', () => {
    const root = fileURLToPath(new URL('./sim', import.meta.url));
    const files: string[] = []; const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) && files.push(p); } };
    walk(root); expect(files.length).toBeGreaterThan(0);
    const bad = files.filter((f) => /(?:from|import)\s*\(?\s*['"][^'"]*(regions|@core\/regions)[^'"]*['"]/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('regional money is formatted by the pack, not hard-coded', () => {
    expect(formatMoney(GLOBAL.data.economy.vollPerMWh, GLOBAL)).toBe('$10,000.00');
    expect(formatMoney(IN.data.economy.vollPerMWh, IN)).toBe('₹50,000.00');
  });
  it('no regional token leaks between packs (init, region query, clock, log, saves, levels, solution code)', () => {
    expectNoRegionLeaks(PACKS, render);
  });
  it('the leak test is live: it would catch a planted leak', () => {
    const hits = findRegionLeaks(PACKS, (p) => (p.id === 'global' ? { ...render(p), oops: `${formatMoney(5, REGIONS.get('in'))} at Prakash Pradesh` } : render(p)));
    expect(hits.map((h) => h.marker).sort()).toEqual(['Prakash', 'Prakash Pradesh', '₹']);
  });
  it('unknown regions teach', () => {
    expect(() => new Engine(GAME, { region: 'mars' })).toThrow(/Unknown region 'mars'.*global, in/);
    expect(new Engine(GAME).act('newGame', [1, 'learner', 'mars']).message).toMatch(/Available regions: global, in/);
  });
});

describe('validateGridData', () => {
  it('accepts both packs', () => { for (const p of PACKS) expect(validateGridData(p.data), p.id).toEqual([]); });
  const bad = (edit: (d: any) => void) => { const d = dataOf(GLOBAL); edit(d); return validateGridData(d); };
  it('rejects UFLS stages that are not strictly descending, or that shed nothing', () => {
    expect(bad((d) => { d.gridcode.ufls[1].hz = 49.0; }).join('\n')).toMatch(/strictly descending/);
    expect(bad((d) => { d.gridcode.ufls[1].hz = 49.5; }).join('\n')).toMatch(/strictly descending/);
    expect(bad((d) => { d.gridcode.ufls[2].shedPct = 0; }).join('\n')).toMatch(/shedPct must be positive/);
    expect(bad((d) => { d.gridcode.ufls[0].hz = 50.2; }).join('\n')).toMatch(/below 50 Hz/);
  });
  it('rejects f0 other than 50 or 60, a negative deadband, non-positive voltage levels', () => {
    expect(bad((d) => { d.f0 = 55; }).join('\n')).toMatch(/f0 must be 50 or 60/);
    expect(validateGridData({ ...dataOf(GLOBAL), f0: 60 }).join('\n')).toMatch(/standardRangeHz must be \[low, high\] around 60/);
    expect(bad((d) => { d.gridcode.fcrDeadbandHz = -0.01; }).join('\n')).toMatch(/fcrDeadbandHz must be >= 0/);
    expect(bad((d) => { d.voltage.levelsKv = [11, 0, 400]; }).join('\n')).toMatch(/levelsKv must be a non-empty array of positive/);
    expect(bad((d) => { d.voltage.levelsKv = [33, 11]; }).join('\n')).toMatch(/ascending/);
  });
  it('rejects physics constants in a pack (the schema is strict) and missing provenance', () => {
    expect(bad((d) => { d.physics = { rhoAl: 2.82e-8 }; }).join('\n')).toMatch(/data\.physics is not a field/);
    expect(bad((d) => { d.economy.g = 9.81; }).join('\n')).toMatch(/economy\.g is not a field/);
    expect(bad((d) => { d.catalogues.generators.push({ id: 'x', kind: 'coal', capexPerKw: 1, resistivity: 2.8e-8, source: 's', confidence: 'game' }); }).join('\n')).toMatch(/resistivity is not a field/);
    expect(bad((d) => { delete d.provenance['gridcode.ufls.hz']; }).join('\n')).toMatch(/provenance\.gridcode\.ufls\.hz is missing/);
  });
  it('rejects a catalogue row with no source or a bad confidence tag', () => {
    const row = { id: 'test-ccgt', kind: 'gas', capexPerKw: 1330, source: 'EIA AEO2023 Table 1', confidence: 'report' };
    expect(bad((d) => { d.catalogues.generators.push({ ...row }); })).toEqual([]);
    expect(bad((d) => { const { source: _s, ...r } = row; d.catalogues.generators.push(r); }).join('\n')).toMatch(/has no source/);
    expect(bad((d) => { d.catalogues.generators.push({ ...row, source: '  ' }); }).join('\n')).toMatch(/has no source/);
    expect(bad((d) => { d.catalogues.generators.push({ ...row, confidence: 'trust-me' }); }).join('\n')).toMatch(/confidence must be one of/);
    expect(bad((d) => { d.catalogues.generators.push({ ...row }, { ...row }); }).join('\n')).toMatch(/duplicate id/);
  });
  it('defineRegion refuses a pack with bad data (one error listing every problem)', async () => {
    const { defineRegion } = await import('@core/regions');
    expect(() => defineRegion<GridRegionData>({ ...GLOBAL, data: { ...dataOf(GLOBAL), f0: 55 as any } }, validateGridData)).toThrow(/f0 must be 50 or 60/);
  });
});

describe('release gate (no recall rows in a shipping pack)', () => {
  const row = { id: 'diesel-1500', kind: 'diesel', capexPerKw: 800, source: 'genset datasheets to verify', confidence: 'recall' };
  it('a recall catalogue row is fine in a draft pack and a problem in a shipping pack', () => {
    const d = dataOf(GLOBAL); d.catalogues.generators.push({ ...row } as any);
    expect(releaseGateProblems({ id: 'x', status: 'draft', data: d })).toEqual([]);
    const p = releaseGateProblems({ id: 'x', status: 'shipping', data: d });
    expect(p).toEqual(expect.arrayContaining([expect.stringContaining("catalogues.generators row 'diesel-1500' is recall")]));
  });
  it('a recall provenance entry is a problem in a shipping pack and fine in a draft one', () => {
    const d = dataOf(IN);
    expect(Object.values(d.provenance).some((s) => s.confidence === 'recall')).toBe(true);
    expect(releaseGateProblems({ id: 'in', status: 'draft', data: d })).toEqual([]);
    expect(releaseGateProblems({ id: 'in', status: 'shipping', data: d }).length).toBeGreaterThan(0);
  });
  it('the draft in pack passes trivially; the global pack has no recall row or provenance entry left (M1.9)', () => {
    expect(releaseGateProblems(IN)).toEqual([]);
    expect(releaseGateProblems(GLOBAL)).toEqual([]);
  });
});

describe('ruleset pins (DECISIONS #3)', () => {
  it('every registered pack is pinned and consistent: {packId, rulesetVersion, dataHash}', () => {
    const lines = PACKS.map((p) => `${p.id}: { rulesetVersion: ${p.rulesetVersion}, dataHash: '${packDataHash(p)}' }`).join('\n');
    for (const p of PACKS) expect(checkPin(p, PINS[p.id]), `current lines:\n${lines}`).toEqual([]);
    expect(Object.keys(PINS).sort()).toEqual(PACKS.map((p) => p.id).sort());
  });
  it('changing a price or limit without bumping rulesetVersion FAILS the pin check', () => {
    for (const edit of [
      (d: GridRegionData) => { d.economy.vollPerMWh += 1; },
      (d: GridRegionData) => { d.economy.fuelPerGJ.coal += 0.1; },
      (d: GridRegionData) => { d.gridcode.ufls[0]!.hz -= 0.1; },
      (d: GridRegionData) => { d.gridcode.fcrDeadbandHz += 0.001; },
      (d: GridRegionData) => { d.voltage.bandsKv['400']!.maxKv += 1; },
    ]) for (const p of PACKS) {
      const mutated = { id: p.id, rulesetVersion: p.rulesetVersion, data: dataOf(p) }; edit(mutated.data);
      expect(packDataHash(mutated)).not.toBe(packDataHash(p));
      expect(checkPin(mutated, PINS[p.id]).join('\n')).toMatch(/bump the pack's rulesetVersion/);
      expect(checkPin({ ...mutated, rulesetVersion: p.rulesetVersion + 1 }, PINS[p.id]).join('\n')).toMatch(/pins\.ts is stale/);   // bumped but pin not refreshed: also caught
    }
  });
  it('changing strings or names does NOT change the hash or the pin check', () => {
    for (const p of PACKS) {
      const mutated = clone({ id: p.id, rulesetVersion: p.rulesetVersion, data: p.data, name: p.name, strings: p.strings });
      for (const k of Object.keys(mutated.strings)) mutated.strings[k] = mutated.strings[k] + ' (renamed)';
      mutated.name = 'Renamed';
      expect(packDataHash(mutated)).toBe(packDataHash(p)); expect(checkPin(mutated, PINS[p.id])).toEqual([]);
    }
  });
  it('relabelling a source or confidence tag does not change the hash; changing a catalogue price does', () => {
    const d = dataOf(GLOBAL); const h0 = packDataHash({ data: d });
    d.provenance['gridcode.settlementMin'] = { source: 'EB GL opened', confidence: 'standard' };
    expect(packDataHash({ data: d })).toBe(h0);
    d.catalogues.generators.push({ id: 'g', kind: 'gas', capexPerKw: 1000, source: 'a', confidence: 'game' });
    const h1 = packDataHash({ data: d }); expect(h1).not.toBe(h0);
    d.catalogues.generators[0]!.source = 'b'; d.catalogues.generators[0]!.confidence = 'report'; expect(packDataHash({ data: d })).toBe(h1);
    d.catalogues.generators[0]!.capexPerKw = 1001; expect(packDataHash({ data: d })).not.toBe(h1);
  });
});
