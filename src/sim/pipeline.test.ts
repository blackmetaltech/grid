// Systems pipeline (M1.10): the synthetic 10-bus day, determinism (P23), no NaN (P24), state size, event windows, controls.
import { describe, expect, it } from 'vitest';
import { Engine, Env, Rng, hashOf, stableStringify, type System } from '@core/kit';
import { TEST_GAME, TEST_ACTIONS, populate } from '../testgrid';
import { GAME } from '../game';
import { buildPipeline } from './tick';
import { findNonFinite } from './finite';
import { runEventWindow, levelResult } from './event';
import { TEST_PARAMS } from './params';
import { BLOCKS_PER_DAY, type GridState } from '../types';

function sandbox(seed = 1): Engine<GridState> {
  const e = new Engine(TEST_GAME, { mode: 'sandbox', seed } as never);
  e.autosave = false;
  populate(e.state as GridState);
  return e as Engine<GridState>;
}
const hashes = (e: Engine<GridState>, n: number): string[] => { const out: string[] = []; for (let i = 0; i < n; i++) { e.act('tick'); out.push(hashOf(e.state)); } return out; };

describe('synthetic 10-bus day', () => {
  const e = sandbox();
  const day: { f: number; demand: number; pv: number; ens: number; conv: boolean; gen: number; v: number }[] = [];
  const violations: unknown[] = [];
  it('runs 96 blocks: converges every block, frequency near nominal, nothing unserved, no invariant violation', () => {
    for (let i = 0; i < BLOCKS_PER_DAY; i++) {
      e.act('tick'); const s = e.state as GridState;
      day.push({ f: s.freq.fHz, demand: s.block.demandMW, pv: s.units.find((u) => u.kind === 'pv')!.P, ens: s.block.ensMW, conv: s.solution!.converged, gen: s.block.genMW, v: s.block.worstVPu });
      violations.push(...(GAME.invariants!(s, null)));
    }
    expect(violations).toEqual([]);
    expect(day.every((d) => d.conv)).toBe(true);
    expect(Math.max(...day.map((d) => Math.abs(d.f - 50)))).toBeLessThan(0.3);
    expect(Math.max(...day.map((d) => d.ens))).toBe(0);
    expect(e.state.clock).toMatchObject({ day: 1, block: 0 });
  });
  it('demand follows the daily shape and generation follows demand plus losses', () => {
    const night = day[12]!.demand, evening = day[76]!.demand;   // 03:15 and 19:15 (index = block - 1)
    expect(evening).toBeGreaterThan(night * 1.3);
    for (const d of day) { expect(d.gen).toBeGreaterThan(d.demand * 0.99); expect(d.gen).toBeLessThan(d.demand * 1.08); }
  });
  it('PV is dark at night and productive at noon; worst voltage stays inside 0.9..1.1 pu', () => {
    expect(day[2]!.pv).toBe(0); expect(day[48]!.pv).toBeGreaterThan(10);
    for (const d of day) { expect(d.v).toBeGreaterThan(0.9); expect(d.v).toBeLessThan(1.1); }
  });
  it('costs and history accumulate; the ring holds one entry per block', () => {
    const s = e.state as GridState;
    expect(s.metrics.cost).toBeGreaterThan(0); expect(s.metrics.opex).toBeGreaterThan(0); expect(s.metrics.co2t).toBeGreaterThan(0); expect(s.metrics.lossesMWh).toBeGreaterThan(0);
    expect(s.history.entries).toHaveLength(BLOCKS_PER_DAY);
    expect(s.history.entries[0]!.genMW.coal).toBeGreaterThan(0);
  });
  it('flows are not stored in the state but queries recompute them', () => {
    const s = e.state as GridState;
    expect(stableStringify(s)).not.toMatch(/pFrom|iKA/);
    const info = e.q('branchInfo', ['T1']) as any;
    expect(info.loading).toBeGreaterThan(0); expect(info.loading).toBeLessThan(1);
    expect((e.q('solutionSummary') as any).ready).toBe(true);
    const ov = e.q('overlay', ['voltage']) as any; expect(Object.keys(ov.values)).toHaveLength(10);
  });
});

describe('P23 determinism', () => {
  it('same seed and actions give the same per-block hash, twice; a different seed differs', () => {
    const a = hashes(sandbox(7), 40), b = hashes(sandbox(7), 40), c = hashes(sandbox(8), 40);
    expect(a).toEqual(b); expect(a).not.toEqual(c);
  });
  it('a save/load in the middle of the day continues bit-exactly (streams are derived from seed, day, block)', () => {
    const full = sandbox(3); const ref = hashes(full, 80);
    const part = sandbox(3); hashes(part, 40);
    const copy = JSON.parse(JSON.stringify(part.state)) as GridState;
    const resumed = new Engine(TEST_GAME, { mode: 'sandbox', seed: 3 } as never); resumed.autosave = false; Object.assign(resumed.state, copy);
    expect(hashes(resumed as Engine<GridState>, 40)).toEqual(ref.slice(40));
  });
  it('per-system streams: an extra system drawing from the shared core stream changes nothing else', () => {
    const base = sandbox(5); hashes(base, 30);
    const extra: System<GridState> = { id: 'noise', run: (_s, rng) => { rng.next(); rng.next(); rng.next(); } };
    const def = { ...TEST_GAME, systems: [...TEST_GAME.systems!.slice(0, 5), extra, ...TEST_GAME.systems!.slice(5)] };
    const e2 = new Engine(def, { mode: 'sandbox', seed: 5 } as never); e2.autosave = false; populate(e2.state as GridState); hashes(e2 as Engine<GridState>, 30);
    const strip = (s: GridState) => ({ ...s, rng: 0 });
    expect(stableStringify(strip(e2.state as GridState))).toBe(stableStringify(strip(base.state as GridState)));
  });
});

describe('P24 no NaN', () => {
  it('findNonFinite finds the first NaN or Infinity with its path', () => {
    expect(findNonFinite({ a: [1, { b: NaN }] })).toBe('$.a[1].b'); expect(findNonFinite({ a: Infinity })).toBe('$.a'); expect(findNonFinite({ a: 1, b: [null, 'x'] })).toBeNull();
  });
  it('random action sequences (valid and invalid arguments) leave state and every query result finite', () => {
    const names = Object.keys(TEST_ACTIONS).filter((n) => !/^place|demolish/.test(n));
    const queries = Object.keys(GAME.queries!);
    const rng = new Rng(99); const e = sandbox(2);
    const ids = () => { const s = e.state as GridState; return [...s.units.map((u) => u.id), ...s.branches.map((b) => b.id), ...s.loads.map((l) => l.id), ...s.shunts.map((h) => h.id), 'nope']; };
    const arg = (): unknown => rng.pick([ids()[rng.int(0, ids().length - 1)], rng.range(-2, 300), rng.int(0, 96), true, false, NaN, 'x', null, 0, 1, 4]);
    for (let step = 0; step < 400; step++) {
      const n = rng.pick(names); e.act(n, [arg(), arg(), arg(), arg()]);
      if (step % 3 === 0) e.act('tick', [rng.int(1, 3)]);
      const s = e.state as GridState;
      expect(findNonFinite(s), `state after ${n}`).toBeNull();
      expect(GAME.invariants!(s, null), `invariants after ${n}`).toEqual([]);
      if (step % 20 === 0) for (const q of queries) expect(findNonFinite(e.q(q, ids().slice(0, 1))), `query ${q}`).toBeNull();
    }
  });
});

describe('state size (DESIGN 8.2)', () => {
  it('a day on the level stays under 256 KB; 7 sandbox days stay under 1 MB', () => {
    const l = new Engine(TEST_GAME); l.autosave = false; l.act('startLevel', ['TG1']);
    for (let i = 0; i < 95; i++) l.act('tick');
    expect(JSON.stringify(l.state).length).toBeLessThan(256 * 1024);
    const e = sandbox(); e.act('tick', [BLOCKS_PER_DAY * 7]);
    const size = JSON.stringify(e.state).length;
    expect(size).toBeLessThan(1024 * 1024); expect((e.state as GridState).history.entries.length).toBe(BLOCKS_PER_DAY * 7);
    console.log(`7-day sandbox state: ${Math.round(size / 1024)} KB`);
  });
});

describe('level plumbing', () => {
  it('a quiet day wins the level through the pipeline verdict (no system sets the status)', () => {
    const l = new Engine(TEST_GAME); l.autosave = false; l.act('startLevel', ['TG1']);
    for (let i = 0; i < 96 && l.state.status === 'playing'; i++) l.act('tick');
    expect(l.state.status).toBe('won'); expect((l.state as GridState).stars).toBeGreaterThanOrEqual(1);
  });
  it('losing: blackout and ENS verdicts come from levelResult with teaching keys', () => {
    const s = sandbox().state as GridState; s.rules = { ...s.rules, maxEnsMWh: 1, horizonBlocks: 10 };
    s.metrics.ensMWh = 2; expect(levelResult(s, s.rules, 3)).toMatchObject({ status: 'lost', key: 'level.lost.ens' });
    s.metrics.ensMWh = 0; expect(levelResult(s, s.rules, 3).status).toBe('playing'); expect(levelResult(s, s.rules, 10)).toMatchObject({ status: 'won', stars: 1 });
    s.rules.minNadirHz = 49; s.metrics.nadirHz = 48.5; expect(levelResult(s, s.rules, 3).key).toBe('level.lost.nadir');
  });
  it('free play and levels without rules never end', () => { const e = sandbox(); e.act('tick', [20]); expect(e.state.status).toBe('playing'); });
});

describe('event windows', () => {
  function atBlock(e: Engine<GridState>, block: number): void { e.act('tick', [block]); }
  it('runEventWindow is pure and returns a new state with replay, frequency dip and the unit offline', () => {
    const e = sandbox(); atBlock(e, 40);
    const s = e.state as GridState; const before = stableStringify(s);
    const r = runEventWindow(s, TEST_PARAMS, { trips: ['U1'] });
    expect(stableStringify(s)).toBe(before);
    expect(r.state.units.find((u) => u.id === 'U1')!.online).toBe(false);
    expect(r.frequencyRan).toBe(true); expect(r.lostGenMW).toBeGreaterThan(20);
    expect(r.state.metrics.nadirHz).toBeLessThan(49.9); expect(r.state.replay!.fMilliHz.length).toBeGreaterThan(10);
    expect(JSON.stringify(r.state.replay).length).toBeLessThan(64 * 1024);
    expect(r.state.events.log.length).toBeGreaterThan(0); expect(r.state.solution!.converged).toBe(true);
  });
  it('a scripted unit trip fires on its block, opens an event window, and the system recovers', () => {
    const e = sandbox(); const s0 = e.state as GridState;
    s0.events.queue.push({ id: 'ev1', day: 0, block: 41, kind: 'trip-unit', target: 'U1', magnitude: 0 });
    atBlock(e, 40); expect((e.state as GridState).block.eventWindow).toBe(false);
    e.act('tick'); const s = e.state as GridState;
    expect(s.block.eventWindow).toBe(true); expect(s.clock.phase).toBe('event'); expect(s.events.queue).toHaveLength(0);
    expect(s.units.find((u) => u.id === 'U1')!.online).toBe(false);
    expect(s.metrics.nadirHz).toBeLessThan(50);
    const why = e.q('whyCard') as any; expect(why.empty).toBe(false); expect(why.entries.some((x: any) => /U1 was lost/.test(x.message))).toBe(true);
    expect((e.q('replay') as any).marks.length).toBeGreaterThan(0);
    for (let i = 0; i < 24; i++) { e.act('tick'); expect(GAME.invariants!(e.state as GridState, null)).toEqual([]); }
    const after = e.state as GridState;
    expect(after.clock.phase).toBe('run'); expect(after.block.shortfallMW).toBe(0); expect(Math.abs(after.freq.fHz - 50)).toBeLessThan(0.3);
  });
  it('a branch trip island-splits cleanly; a fault trips the lines at its bus', () => {
    const e = sandbox(); (e.state as GridState).events.queue.push({ id: 'f1', day: 0, block: 5, kind: 'fault', target: 'B9', magnitude: 0.1 });
    e.act('tick', [5]); const s = e.state as GridState;
    expect(s.branches.filter((b) => (b.from === 'B9' || b.to === 'B9') && b.inService)).toHaveLength(0);
    expect(s.block.eventWindow).toBe(true); expect(s.loads.find((l) => l.bus === 'B9')!.shedFrac).toBe(0);
    expect(s.block.ensMW).toBeGreaterThan(30);   // the industrial load behind the fault is dark: counted as energy not served
    expect(findNonFinite(s)).toBeNull();
  });
  it('a sustained overload trips the branch on its inverse-time timer and opens an event window', () => {
    const e = sandbox(); const s0 = e.state as GridState;
    for (const b of s0.branches) if (b.id === 'T8') b.ratingMVA = 20;   // B6-B9 feeds 45 MW industrial load: 2.2x overload
    e.act('tick', [3]); const s = e.state as GridState;
    expect(s.branches.find((b) => b.id === 'T8')!.inService).toBe(false);
    expect(s.events.log.some((x) => x.causeKey === 'cascade.initial-trip')).toBe(true);
    expect(s.log.some((l) => /thermal overload/.test(l.text))).toBe(true);
  });
  it('UFLS: a generation shortfall drops frequency, sheds load in the block model and says so', () => {
    const e = sandbox(); const s0 = e.state as GridState;
    for (const u of s0.units) if (u.kind === 'coal' || u.kind === 'gas') u.pMax = 45;    // 90 MW of thermal against a ~110-150 MW day
    let first: GridState | null = null;
    for (let i = 0; i < 90 && !first; i++) { e.act('tick'); if ((e.state as GridState).block.shortfallMW > 0) first = structuredClone(e.state as GridState); }
    expect(first).not.toBeNull();
    expect(first!.freq.fHz).toBeLessThan(49.5);
    expect((e.q('needsYouNow') as any[]).some((n) => n.key === 'needs.shortfall')).toBe(true);
    e.act('tick', [12]); const s = e.state as GridState;
    expect(s.metrics.nadirHz).toBeLessThan(49); expect(s.loads.some((l) => l.shedFrac > 0)).toBe(true); expect(s.metrics.ensMWh).toBeGreaterThan(0);
  });
});

describe('controls and commitment', () => {
  it('an automatic tap changer moves one step after its delay when the LV bus is out of band', () => {
    const e = sandbox(); e.act('tick', [2]);
    expect(e.act('setTapAuto', ['T11', 1.04, 0.01, 2]).ok).toBe(true);
    const v0 = (e.state as GridState).solution!.buses.find((b) => b.id === 'B7')!.vPu;
    expect(v0).toBeLessThan(1.03);
    e.act('tick', [2]); const s = e.state as GridState;
    expect(s.branches.find((b) => b.id === 'T11')!.tap!.pos).toBeGreaterThanOrEqual(1); expect(s.metrics.tapOps).toBeGreaterThanOrEqual(1);
    e.act('tick', [6]); expect((e.state as GridState).solution!.buses.find((b) => b.id === 'B7')!.vPu).toBeGreaterThan(v0);
  });
  it('commitment honours start delay and min-up time; a stopped coal unit restarts after its start time', () => {
    const e = sandbox(); e.act('tick', [2]);
    expect(e.act('commit', ['U1', false, 0]).ok).toBe(true);
    e.act('tick', [2]); let u1 = (e.state as GridState).units.find((u) => u.id === 'U1')!;
    expect(u1.online).toBe(false); expect(u1.P).toBe(0); expect(u1.commit.minDownLeft).toBeGreaterThan(0);
    e.act('commit', ['U1', true, 0]);
    e.act('tick', [4]); u1 = (e.state as GridState).units.find((u) => u.id === 'U1')!; expect(u1.online).toBe(false);   // still in its minimum down time
    e.act('tick', [60]); u1 = (e.state as GridState).units.find((u) => u.id === 'U1')!; expect(u1.online).toBe(true);
    expect((e.state as GridState).metrics.opex).toBeGreaterThan(0);
  });
  it('manual dispatch holds the set-point and turns auto off; out-of-range set-points teach', () => {
    const e = sandbox(); e.act('tick', [2]);
    const bad = e.act('setDispatch', ['U1', 500]); expect(bad.ok).toBe(false); expect(bad.message).toMatch(/can only run between/);
    expect(e.act('setDispatch', ['U1', 100, 4]).ok).toBe(true); expect((e.state as GridState).dispatch.auto).toBe(false);
    e.act('tick'); expect((e.state as GridState).units.find((u) => u.id === 'U1')!.P).toBeGreaterThan(60);
  });
  it('batteries charge when lambda is low and discharge when high (threshold mode)', () => {
    const e = sandbox(); const s = e.state as GridState;
    expect(e.act('placeStorage', ['B2', 't-bess']).ok).toBe(true);
    s.dispatch.lambda = 10; e.act('tick'); expect((e.state as GridState).storage[0]!.P).toBeLessThan(0);
    const soc = (e.state as GridState).storage[0]!.soc; expect(soc).toBeGreaterThan(0.5);
    (e.state as GridState).dispatch.lambda = 500; e.act('tick'); expect((e.state as GridState).storage[0]!.P).toBeGreaterThanOrEqual(0);
  });
  it('the pipeline is exactly the 17 systems of DESIGN 8.3 in order', () => {
    expect(buildPipeline(() => TEST_PARAMS).map((x) => x.id)).toEqual(['clock', 'weather', 'demand', 'renewables', 'commitment', 'dispatch', 'controls', 'flashover', 'loadflow', 'limits', 'events', 'blockFrequency', 'economics', 'metrics', 'levelRules', 'explain', 'history']);
  });
});
