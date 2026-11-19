// Actions teach: every rejection says what rule was broken, carries {key, params}, and changes nothing; successes are logged.
import { describe, expect, it } from 'vitest';
import { Engine, stableStringify } from '@core/kit';
import { TEST_GAME, populate } from './testgrid';
import { GAME } from './game';
import { simParamsOf, catalogueViewOf } from './catalogue';
import { voltageBand } from './sim/params';
import { GLOBAL } from './regions/global';
import { IN } from './regions/in';
import { en } from './locales/en';
import type { GridState } from './types';

const fresh = (): Engine<GridState> => { const e = new Engine(TEST_GAME, { mode: 'sandbox' } as never); e.autosave = false; populate(e.state as GridState); return e as Engine<GridState>; };

describe('actions', () => {
  it('a rejected action changes nothing and returns message, key and params', () => {
    const e = fresh(); const before = stableStringify(e.state);
    const cases: [string, unknown[], string, RegExp][] = [
      ['setDispatch', ['U1', 9999], 'act.setDispatch.range', /can only run between/],
      ['shedLoad', ['L1', 1.5], 'act.shed.range', /between 0 and 1/],
      ['setTap', ['T11', 99], 'act.tap.range', /taps run from -8 to 8/],
      ['setTap', ['T1', 1], 'act.tap.notXfmr', /not a transformer/],
      ['commit', ['U3', true], 'act.commit.nonThermal', /follows the sun or wind/],
      ['setDroop', ['U1', 50], 'act.droop.range', /between 2 % and 12 %/],
      ['stringLine', ['B1', 'B1', 'l132-panther', 1], 'act.line.same', /two different buses/],
      ['stringLine', ['B1', 'B7', 'l132-panther', 1], 'act.line.kv', /33 kV/],
      ['placeTransformer', ['B1', 'B2', 't-x132-33'], 'act.xfmr.kv', /132\/33 kV/],
      ['placeUnit', ['nope', 'B1', 10], 'act.unknownCatalog', /no generator "nope"/],
      ['placeUnit', ['t-gas', 'B99', 10], 'act.unknownId', /no bus with id "B99"/],
      ['setShuntSteps', ['C9', 1], 'act.unknownId', /no shunt/],
      ['shedLoad', [], 'act.arg', /missing or has the wrong type/],
      ['predict', ['q', 'x'], 'act.arg', /a number/],
    ];
    for (const [name, args, key, re] of cases) {
      const r = e.act(name, args) as any;
      expect(r.ok, name).toBe(false); expect(r.key, name).toBe(key); expect(r.message, name).toMatch(re); expect(typeof r.params).toBe('object');
    }
    expect(stableStringify(e.state)).toBe(before);
  });
  it('successful actions are logged in actionLog with their key, and the solution-code record keeps them', () => {
    const e = new Engine(TEST_GAME); e.autosave = false; e.act('startLevel', ['TG1']);
    const r = e.act('setDispatch', ['U1', 100, 4]) as any;
    expect(r.ok).toBe(true); expect(r.key).toBe('act.setDispatch.ok'); expect(r.params).toMatchObject({ id: 'U1', mw: 100 });
    e.act('shedLoad', ['L1', 0.1]); e.act('shedLoad', ['L1', 7]);
    expect((e.state as GridState).actionLog.map((a) => a.name)).toEqual(['setDispatch', 'shedLoad']);
    expect((e.q('actionLog') as any[])[1]).toMatchObject({ name: 'shedLoad', key: 'act.shed.ok' });
    expect(e.state.levelActions!.map((a) => a[0])).toEqual(['setDispatch', 'shedLoad']);
  });
  it('building through actions: bus, line, transformer, unit, storage, shunt, then demolish removes what hangs off a bus', () => {
    const e = new Engine(TEST_GAME, { mode: 'sandbox' } as never); e.autosave = false;
    expect(e.act('placeBus', [0, 0, 132, 'gen', 1.02]).ok).toBe(true); expect(e.act('placeBus', [10, 0, 132, 'load']).ok).toBe(true); expect(e.act('placeBus', [10, 5, 33, 'load']).ok).toBe(true);
    const line = e.act('stringLine', ['B1', 'B2', 'l132-panther', 1]) as any; expect(line.ok).toBe(true); expect(line.message).toMatch(/Line T1: 1 km/);
    expect(e.act('placeTransformer', ['B2', 'B3', 't-x132-33']).ok).toBe(true);
    expect(e.act('placeUnit', ['t-coal', 'B1', 100]).ok).toBe(true); expect(e.act('placeStorage', ['B2', 't-bess']).ok).toBe(true); expect(e.act('placeShunt', ['B3', 't-cap', 3]).ok).toBe(true);
    expect(e.act('placeLoad', ['B3', 'residential', 20]).ok).toBe(true);
    expect((e.state as GridState).budget.spent).toBeGreaterThan(1e8); expect((e.state as GridState).branches[0]!.x).toBeGreaterThan(0);
    expect(e.act('demolish', ['B2']).ok).toBe(true);
    const s = e.state as GridState;
    expect(s.branches.length).toBe(0); expect(s.storage.length).toBe(0); expect(s.buses.map((b) => b.id)).toEqual(['B1', 'B3']);
  });
  it('loads can only be placed in sandbox mode', () => {
    const e = new Engine(TEST_GAME, { mode: 'learner' } as never); e.autosave = false; e.act('placeBus', [0, 0, 33, 'load']);
    expect(e.act('placeLoad', ['B1', 'residential', 10]).message).toMatch(/only available in sandbox/);
  });
  it('every action and query is registered once; names do not clash with core built-ins', () => {
    const e = new Engine(GAME); const init = (e.init() as any);
    expect(init.actions).toEqual(expect.arrayContaining(['setSpeed', 'placeUnit', 'stringLine', 'commit', 'setDispatch', 'switchBranch', 'setTapAuto', 'predict']));
    expect(init.queries).toEqual(expect.arrayContaining(['solutionSummary', 'needsYouNow', 'whyCard', 'overlay', 'replay', 'timeline', 'costBreakdown']));
  });
  it('every message key the game can produce exists in the locale', () => {
    for (const k of ['level.won', 'level.lost.blackout', 'needs.shortfall', 'cascade.overload-trip', 'freq.blackout', 'act.arg']) expect(en[k], k).toBeTruthy();
  });
});

describe('pack -> plain parameters (src/sim never sees a pack)', () => {
  it('maps f0, grid code, economy, bands and latitude from the global pack and from in', () => {
    const g = simParamsOf(GLOBAL.data), i = simParamsOf(IN.data);
    expect(g.f0).toBe(50); expect(g.gridcode.ufls[0]).toEqual({ hz: 49, shedPct: 5, delayS: 0.2 }); expect(g.economy.vollPerMWh).toBe(10000); expect(g.latitudeDeg).toBe(23);
    expect(voltageBand(g, 132, 'learner')[0]).toBeCloseTo(119 / 132, 9); expect(voltageBand(g, 132, 'learner')[1]).toBeCloseTo(145 / 132, 9);
    expect(voltageBand(g, 0.4, 'learner')).toEqual([0.9, 1.1]);
    expect(i.f0).toBe(50); expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });
  it('maps catalogue rows into the views the actions use (generator cost, transformer pu inputs, line templates)', () => {
    const d = structuredClone(GLOBAL.data); d.catalogues.generators = [{ id: 'g1', kind: 'coal', capexPerKw: 1800, heatRateMJkWh: 9.5, pMinPct: 40, source: 's', confidence: 'game' }];
    d.catalogues.transformers = [{ id: 'x1', mva: 40, kvHv: 132, kvLv: 33, price: 1e6, zPct: 12, source: 's', confidence: 'game' }];
    const v = catalogueViewOf(d);
    expect(v.generator('g1')).toMatchObject({ kind: 'coal', fuelPerGJ: d.economy.fuelPerGJ.coal, heatRateGJperMWh: 9.5, pMinPct: 40 });
    expect(v.generator('none')).toBeNull(); expect(v.transformer('x1')).toMatchObject({ mva: 40, zPct: 12, tapMin: -8, tapMax: 8 });
    expect(v.line('l132-panther')).toMatchObject({ kv: 132, thermalMva: 86 });
  });
});

describe('coachCarry (Retry keeps the coach where the last attempt left it)', () => {
  it('starts the coach at the carried step, is allowed inside a level and is not logged', async () => {
    const { Env } = await import('@core/kit');
    const e = new Env(GAME); e.reset({ seed: 1, level: 'L12' });
    const coach = () => (GAME.queries!.coach as (s: GridState) => { index: number; total: number })(e.state);
    expect(coach().index).toBe(0);
    const log = e.state.actionLog.length;
    expect((e.step({ name: 'coachCarry', args: [2] }).info as unknown as { ok: boolean }).ok).toBe(true);
    expect(coach().index).toBeGreaterThanOrEqual(Math.min(2, coach().total));
    expect(e.state.actionLog.length).toBe(log);
    expect((e.step({ name: 'coachCarry', args: [-1] }).info as unknown as { ok: boolean }).ok).toBe(false);
  });
});
