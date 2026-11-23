// L28 Keep the Lights On, engine side: the three-day gate (naive loses on Day 1 heat, lesson earns two stars, reference three), the budget that forces a choice, oracles F-1..F-3 (tools/oracles/chf_oracles.py), the island through the lightning
// (second feeder, a 4-hour battery that holds, a 2-hour battery that does not by 0.6 %), the frozen targets, the lesson and try hint in the player's numbers, determinism and speed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf, type Action } from '@core/kit';
import { GAME } from '../game';
import { specOf } from './index';
import { runDesign } from './run';
import { botPopulation } from './population';
import { designs } from './spec';
import { islandBattery, secondCauseway, eastgateFeeder, tapsEastgate, capsEastgate, reactorsCapital, statcomEastgate, spinCcgt, gfm, FINALE, BUS, LINE_ID, ISLAND_LOAD, NORTH_FEEDER, SPIN_CALL, LIGHTNING_AT, spinAtCall, shedAtLightning, LIVE, reference4h } from './levels/l28';
import { solvedOf } from '../sim/solved';
import type { GridState } from '../types';

const EXP = JSON.parse(readFileSync(fileURLToPath(new URL('../../tools/oracles/chf_expected.json', import.meta.url)), 'utf8'));
const spec = specOf('L28')!;
const near = (a: number, b: number, rel: number): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.abs(b)); };
const fresh = (region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: 'L28', region }); return e as Env<GridState>; };
const play = (acts: Action[], region = 'global'): Env<GridState> => { const e = fresh(region); for (const a of acts) expect(e.step(a).info.ok, a.name).toBe(true); return e; };
const run = (e: Env<GridState>): Env<GridState> => { for (let i = 0; i < 292 && e.state.status === 'playing'; i++) e.step(TICK); return e; };
const info = (e: Env<GridState>): any => e.engine.q('levelInfo');

describe('L28 three-day gate', () => {
  for (const region of ['global', 'in']) {
    it(`${region}: idle loses on Day 1 heat (voltage low), the lesson earns two stars, the reference three`, () => {
      const n = runDesign(spec, region, spec.naive.actions);
      expect(n.status).toBe('lost'); expect(n.failKind).toBe('brownout'); expect(n.state.block.verdictKey).toBe('level.lost.voltageLow'); expect(n.state.clock.day).toBe(0);
      const l = runDesign(spec, region, spec.lesson);
      expect(l.status, l.reason).toBe('won');
      const r = runDesign(spec, region, spec.reference);
      expect(r.status, r.reason).toBe('won');
      if (region === 'global') {
        expect(l.stars).toBe(2); expect(r.stars).toBe(3); expect(r.track.unplannedEnsMWh).toBe(0); expect(r.track.islandDarkBlocks).toBe(0); expect(r.track.freqViolBlocks).toBe(0); expect(r.track.lossPct!).toBeLessThanOrEqual(3);
      } else {
        // the national tie holds the frequency in the in pack (nadir well above the 49.4 Hz first UFLS stage): the reference is the cheapest pass there (no spun unit)
        expect(l.stars).toBeLessThan(3); expect(r.stars).toBe(3); expect(r.ensMWh).toBe(0); expect(r.state.metrics.nadirHz).toBeGreaterThan(49.8); expect(r.track.islandDarkBlocks).toBe(0);
        expect(info(run(play(spec.byRegion!.in!.reference!, 'in'))).lesson).toContain('All-India grid');   // the in pack's own reference
      }
    });
  }
  it('frozen targets match the regenerated bot population (global, drift <= 2 %) and the budget rule holds', () => {
    const pop = botPopulation(spec, 'global'), f = spec.frozen!.global!;
    near(pop.budget, f.budget, 0.02); near(pop.starA, f.starA, 0.02); near(pop.starB, f.starB, 0.02);
    expect(f.budget).toBeGreaterThanOrEqual(spec.budgetOverCheapest! * pop.cheapestPass);
    expect(pop.passing).toBe(7);   // the 2-hour battery with the north feeder (U4 from the start or at the call, with or without the reactor), the 4-hour battery with no reserve, or with U4 at the call (also with the feeder opened): DECISIONS 20
    const dearest = Math.max(...[...designs(spec)].map((d) => runDesign(spec, 'global', d.actions, { frozen: null }).capex));
    expect(f.budget).toBeLessThan(dearest);
  }, 300000);
  it('frozen targets of the in pack match too', () => {
    const pop = botPopulation(spec, 'in'), f = spec.frozen!.in!;
    near(pop.budget, f.budget, 0.02); near(pop.starA, f.starA, 0.02); near(pop.starB, f.starB, 0.02);
  }, 300000);
});

describe('the budget forces a choice (DECISIONS 14)', () => {
  const won = (acts: Action[]): ReturnType<typeof runDesign> => runDesign(spec, 'global', acts, { frozen: null });
  const priced = (acts: Action[]): ReturnType<typeof runDesign> => runDesign(spec, 'global', acts);
  it('every plan that buys a second fix for a threat passes on the engine but breaks the budget', () => {
    const base = [...tapsEastgate, ...capsEastgate, ...spinCcgt];
    const safe: [string, Action[]][] = [
      ['reactor for the holiday', [...base, ...reactorsCapital, ...islandBattery('bess-4h-50')]],
      ['both island paths', [...base, ...secondCauseway, ...islandBattery('bess-4h-50')]],
      ['STATCOM instead of the bank', [...tapsEastgate, ...statcomEastgate, ...spinCcgt, ...islandBattery('bess-4h-50')]],
      ['one grid-forming pack on top', [...base, ...gfm(1), ...islandBattery('bess-4h-50')]],
      ['the Eastgate feeder', [...base, ...eastgateFeeder]],
      ['buy everything safe', [...base, ...reactorsCapital, ...secondCauseway, ...islandBattery('bess-4h-50')]],
    ];
    for (const [name, acts] of safe) {
      expect(won(acts).status, name).toBe('won');
      const o = priced(acts); expect(o.failKind, name).toBe('budget'); expect(o.capex, name).toBeGreaterThan(spec.frozen!.global!.budget);
    }
  });
  it('a passing plan exists by hand at 90 % of the budget or less, and the cheap trap (a 2-hour battery) fits the budget but runs dry', () => {
    const cheap = priced(spec.lesson); expect(cheap.status).toBe('won'); expect(cheap.capex).toBeLessThanOrEqual(0.9 * spec.frozen!.global!.budget);
    const ref = priced(spec.reference); expect(ref.status).toBe('won'); expect(ref.stars).toBe(3);
    const line = priced([...tapsEastgate, ...capsEastgate, ...secondCauseway]); expect(won([...tapsEastgate, ...capsEastgate, ...secondCauseway]).status).toBe('won'); expect(line.failKind).toBe('budget');   // the classic N-1 line works but costs more than the budget (DECISIONS 20)
    const trap = priced([...tapsEastgate, ...capsEastgate, ...spinCcgt, ...islandBattery('bess-2h-50')]);
    expect(trap.capex).toBeLessThan(spec.frozen!.global!.budget); expect(trap.failKind).toBe('islandDark');
  });
  it('taking a part back refunds it, but never the fuel of a unit still spinning', () => {
    const e = play([...tapsEastgate, ...capsEastgate, ...spinCcgt, ...islandBattery('bess-4h-50')]);
    const before = e.state.budget.spent, batt = e.state.storage.find((b) => b.bus === BUS.saltmarsh)!, paid = e.state.purchases![batt.id]!, fuel = e.state.purchases!['spin:U4']!;
    expect(fuel).toBeGreaterThan(0);
    expect(e.step({ name: 'demolish', args: [batt.id] }).info.ok).toBe(true);
    expect(e.state.budget.spent).toBeCloseTo(before - paid, 6); expect(e.state.purchases!['spin:U4']).toBe(fuel);
  });
});

describe('the live calls (DECISIONS 20)', () => {
  const priced = (acts: Action[]): ReturnType<typeof runDesign> => runDesign(spec, 'global', acts);
  const plan4 = [...tapsEastgate, ...capsEastgate, ...islandBattery('bess-4h-50')], plan2 = [...tapsEastgate, ...capsEastgate, ...spinCcgt, ...islandBattery('bess-2h-50')];
  const at = (k: number, ...a: Action[]): Action[] => [{ name: 'tick', args: [k] }, ...a];
  it('the 4-hour battery with U4 spun for three days does not fit; U4 spun at the radio call does, and earns one lamp (the safe plan is dear, DECISIONS 24)', () => {
    const safe = priced([...plan4, ...spinCcgt]); expect(safe.failKind).toBe('budget'); expect(safe.capex).toBeGreaterThan(spec.frozen!.global!.budget);
    const ref = priced([...plan4, ...spinAtCall]); expect(ref.status).toBe('won'); expect(ref.stars).toBe(1); expect(ref.ensMWh).toBe(0);   // nothing shed, but US$53.5M is over star A (DECISIONS 24)
    expect(SPIN_CALL).toBe(96 + 12);   // Day 2 03:00, the radio's call (log.finale.spinCall)
  });
  it('unplanned energy not served leaves out the shed the operator holds (DECISIONS 24)', () => {
    const held = priced(plan2.concat(shedAtLightning));
    expect(held.ensMWh).toBeGreaterThan(20); expect(held.track.unplannedEnsMWh!).toBeCloseTo(0, 6); expect(held.track.unplannedEnsPct!).toBe(0);   // all of it was ordered
    const dry = priced(plan4.concat(spinAtCall)), none = priced(plan4);
    expect(dry.track.unplannedEnsMWh!).toBe(0);
    expect(none.track.unplannedEnsMWh!).toBeCloseTo(none.ensMWh, 6);   // a relay shed nobody ordered counts in full
    expect(none.track.unplannedEnsPct!).toBeCloseTo(100 * none.ensMWh / FINALE.energyMWh, 6);
  });
  it('call 1 is a decision: the same cheap build with U4 at the radio call costs less than with U4 at the plan and clears star B (DECISIONS 24)', () => {
    const f = spec.frozen!.global!;
    const plan = priced(plan2.concat(shedAtLightning)), call = priced([...tapsEastgate, ...capsEastgate, ...islandBattery('bess-2h-50'), ...LIVE.find((l) => l.id === 'spin+north-feeder')!.actions]);
    expect(plan.status).toBe('won'); expect(call.status).toBe('won');
    expect(call.capex).toBeLessThan(plan.capex); expect(call.capex).toBeLessThanOrEqual(f.starB); expect(plan.capex).toBeGreaterThan(f.starB);
    expect(plan.stars).toBe(2); expect(call.stars).toBe(3);   // the order to shed was the operator's, so only the price separates them
    expect(priced(plan4).stars).toBe(1);   // the 4-hour battery costs more than star A (US$40M) and sheds by relay with no reserve: it passes with one lamp
  });
  it('no reserve at all passes on the last few MWh; U4 spun after the morning of Day 2 is too late for Day 3', () => {
    const none = priced(plan4); expect(none.status).toBe('won'); expect(none.stars).toBe(1); expect(none.ensMWh).toBeGreaterThan(0.99 * 0.001 * FINALE.energyMWh);
    const late = priced([...plan4, ...at(144, ...spinCcgt)]); expect(late.status).toBe('won'); expect(late.stars).toBe(1); expect(late.ensMWh).toBeGreaterThan(10);   // Day 2 12:00: a cold CCGT is not back before the Day 3 trip
  });
  it('the 2-hour battery lasts the night with the north feeder open at the lightning: a third of the island off, the school lit, the energy counted as not served', () => {
    const o = priced(plan2.concat(shedAtLightning)); expect(o.status, o.reason).toBe('won'); expect(o.stars).toBe(2);
    expect(o.track.islandDarkBlocks).toBe(0); expect(o.track.islandShedMWh!).toBeGreaterThan(20); expect(o.ensMWh).toBeCloseTo(o.track.islandShedMWh!, 6);
    near(o.track.islandShedMWh!, NORTH_FEEDER * o.track.islandNightMWh!, 0.06);   // a third of the draw, from the block after the lightning
    expect(o.capex).toBeLessThanOrEqual(0.6 * spec.frozen!.global!.budget);
    expect(o.state.loads.find((l) => l.id === ISLAND_LOAD)!.shedFrac).toBe(0);   // closed again with the causeway at 06:00
    expect(o.state.log.some((x) => /feeders are closed again/.test(x.text))).toBe(true);
  });
  it('opened three hours late, the feeder cannot save the cells; without reserve the shed breaks the energy limit', () => {
    const late = priced([...plan2, ...at(LIGHTNING_AT + 12, { name: 'shedLoad', args: [ISLAND_LOAD, NORTH_FEEDER] })]); expect(late.failKind).toBe('islandDark');
    const noRes = priced([...tapsEastgate, ...capsEastgate, ...islandBattery('bess-2h-50'), ...shedAtLightning]); expect(noRes.status).toBe('lost'); expect(noRes.ensMWh).toBeGreaterThan(0.001 * FINALE.energyMWh);
  });
  it('the operator\'s open feeder holds through the night; the relays\' sheds are still closed again (finale.ts)', () => {
    const e = play(plan2); for (let i = 0; i < LIGHTNING_AT; i++) e.step(TICK);
    expect(e.step({ name: 'shedLoad', args: [ISLAND_LOAD, NORTH_FEEDER] }).info.ok).toBe(true);
    for (let i = 0; i < 4; i++) e.step(TICK);
    const l = e.state.loads.find((x) => x.id === ISLAND_LOAD)!; expect(l.shedFrac).toBeCloseTo(NORTH_FEEDER, 12); expect(l.shedHold).toBeCloseTo(NORTH_FEEDER, 12);
    const other = e.state.loads.find((x) => x.bus === BUS.harbour)!; other.shedFrac = 0.9;   // a relay's shed: no hold
    e.step(TICK); expect(e.state.loads.find((x) => x.bus === BUS.harbour)!.shedFrac).toBeCloseTo(0.4, 9);
    expect(e.step({ name: 'shedLoad', args: [ISLAND_LOAD, 0] }).info.ok).toBe(true); expect(e.state.loads.find((x) => x.id === ISLAND_LOAD)!.shedHold).toBeUndefined();
  });
});

describe('the island through the lightning', () => {
  const base = [...tapsEastgate, ...capsEastgate, ...spinCcgt];   // the plan with reserve for three days, no island fix
  it('no second path: it goes dark at 23:30 on Day 2 and the report names the island; a second feeder and a 4-hour battery both keep it lit', () => {
    const none = runDesign(spec, 'global', base);
    expect(none.status).toBe('lost'); expect(none.failKind).toBe('islandDark'); expect(none.state.block.verdictKey).toBe('level.lost.islandStorm'); expect(none.reason).toMatch(/^At 23:30 on Day 2 Saltmarsh Island/);
    expect(runDesign(spec, 'global', [...base, ...secondCauseway], { frozen: null }).status).toBe('won');   // physics only: with U4 for three days both are over the budget (DECISIONS 20)
    expect(runDesign(spec, 'global', [...base, ...islandBattery('bess-4h-50')], { frozen: null }).status).toBe('won');
  });
  it('a 2-hour battery holds 100 MWh against the 124 MWh of nameplate the night needs (oracle F-3): it runs dry', () => {
    expect(EXP['F-3'].nameplate_MWh).toBeGreaterThan(100); expect(EXP['F-3'].nameplate_MWh).toBeLessThan(125);
    const o = runDesign(spec, 'global', [...base, ...islandBattery('bess-2h-50')]);
    expect(o.status).toBe('lost'); expect(o.state.block.verdictKey).toBe('level.lost.islandStormBattery'); expect(o.state.clock.day).toBe(2); expect(o.state.clock.block).toBeLessThan(24);   // the cells ran dry in the small hours of Day 3, before the 06:00 repair
    expect(o.reason).toContain('even with a 100 MWh battery');
    expect(runDesign(spec, 'global', [...base, ...islandBattery('bess-4h-50')], { frozen: null }).track.islandNightMWh!).toBeGreaterThan(80);
  });
  it('the energy the island drew while its feeder was open is the oracle number (within 1 %)', () => {
    const r = runDesign(spec, 'global', reference4h);
    near(r.track.islandNightMWh!, EXP['F-3'].delivered_MWh, 0.01);
  });
});

describe('oracles', () => {
  it('F-1 demand energy of the three days and the ENS limit', () => {
    const r = runDesign(spec, 'global', reference4h);
    near(r.track.demandMWh!, EXP['F-1'].energy_MWh, 1e-4); near(FINALE.energyMWh, EXP['F-1'].energy_MWh, 1e-12);
    near(r.track.peakDemandMW!, EXP['F-1'].peak_MW, 1e-3);
    expect(r.state.rules.maxEnsMWh).toBeCloseTo(EXP['F-1'].ens_limit_MWh, 6);
  });
  it('F-2 the 400 kV ring charges like a capacitor: the engine branch susceptances against the exact pi (within 3 %)', () => {
    const s = fresh().state as GridState;
    const q = s.branches.filter((b) => s.buses.find((x) => x.id === b.from)!.kvNom === 400).reduce((a, b) => a + b.bc * 100, 0);
    near(q, EXP['F-2'].ring_Mvar, 0.03);
  });
});

describe('the scenario', () => {
  it('26 buses, nine plants, twelve towns and the datacentre, 300 MW flat; Saltmarsh has one feeder', () => {
    const s = fresh().state as GridState;
    expect(s.buses.length).toBe(26); expect(s.map.w).toBe(100); expect(s.terrain).toBeNull();
    expect(new Set(s.units.map((u) => u.bus)).size + 1).toBeGreaterThanOrEqual(9);
    expect(s.loads.filter((l) => l.shape === null).length).toBeGreaterThanOrEqual(12);
    const dc = s.loads.find((l) => l.bus === BUS.dc)!; expect(dc.Ppeak).toBe(300);
    expect(s.branches.filter((b) => b.from === BUS.saltmarsh || b.to === BUS.saltmarsh).map((b) => b.id)).toEqual([LINE_ID.causeway]);
  });
  it('Day 2 queues the storm, three trips and a Day 3 trip; the lightning is a protection-cleared branch opening (no event window), the crews repair at 06:00', () => {
    const q = (fresh().state as GridState).events.queue.map((e) => e.kind);
    expect(q.filter((k) => k === 'trip-branch').length).toBe(2); expect(q).toContain('storm'); expect(q.filter((k) => k === 'trip-unit').length).toBe(2);
    const e = play(reference4h); run(e);
    expect(e.state.metrics.track.lightning).toBe(1);
    expect(e.state.events.log.some((x) => x.causeKey === 'finale.repaired' && x.element === LINE_ID.causeway && x.day === 2 && x.block === 24)).toBe(true);
  });
  it('the frequency star counts excursions of 15 minutes or more, never the 60 s event dips (reported as dips)', () => {
    const r = runDesign(spec, 'global', reference4h);
    expect(r.track.freqViolBlocks).toBe(0); expect(r.track.freqDips!).toBeGreaterThanOrEqual(3);
  });
});

describe('lesson, hint, coach, determinism, speed', () => {
  it('the lesson prints the three days in the player\'s numbers; the try hint names the lost day', () => {
    const e = run(play(reference4h)); const li = info(e).lesson as string;
    expect(li).toMatch(/Day 1: demand peaked at (\d+) MW and the lowest voltage was ([\d.]+) pu/);
    expect(Number(li.match(/peaked at (\d+) MW/)![1])).toBe(Math.round(e.state.metrics.track.peakDemandMW!));
    expect(li).toMatch(/Saltmarsh Island stayed lit: from 23:30 to 06:00 it drew [\d.]+ MWh through a battery: 124\.\d MWh of nameplate/);
    expect(li).toMatch(/Day 3: highest voltage [\d.]+ pu at \d\d:\d\d on Day [123]; losses over the three days [\d.]+ %.*0 quarter-hours spent outside (49\.\d\d) to 50\.05 Hz/);
    expect(Number(li.match(/outside (49\.\d\d) to/)![1])).toBe(e.state.metrics.track.bandLoHz);   // the band the count used (it was always printed as 49.90)
    const lost = run(play([])); expect(info(lost).tryHint).toMatch(/A bus fell below 0\.95 pu/);
    // the island's hint gives the draw and the battery's usable window, never the size to buy (DECISIONS 20)
    const isl = run(play([...tapsEastgate, ...capsEastgate, ...spinCcgt, ...islandBattery('bess-2h-50')])); const th = info(isl).tryHint as string;
    expect(th).toContain(`draws ${FINALE.nightMWh.toFixed(0)} MWh`); expect(th).toMatch(/middle 80 % of its rated energy \(10 to 90 % charge\)/); expect(th).toContain(`about ${Math.round(100 * (1 - Math.sqrt(0.86)))} % is lost`);
    expect(th).not.toMatch(/at least|125|holds only|2-hour|4-hour/);
  });
  it('a shed the operator ordered is named in the lesson as not counting against the third lamp (DECISIONS 24)', () => {
    const e = run(play(spec.lesson)); const li = info(e).lesson as string;
    expect(li).toMatch(/^.*The \d+\.\d MWh you left off by your own order do not count against the third lamp/);
    expect(info(run(play(reference4h))).lesson as string).not.toContain('by your own order');
  });
  it('a dark bus is not a voltage reading: with the island dark, the lesson prints the lowest live voltage and the day it happened', () => {
    // taps and capacitors, no reserve and no island fix: Saltmarsh goes dark at 23:30 on Day 2. The oracle walks the run block by block and takes the minimum
    // over the energised buses of the watched voltages (400, 220, 132 kV) straight from the load-flow solution, with the day of that block.
    const e = play([...tapsEastgate, ...capsEastgate]);
    const kv = new Set([400, 220, 132]);
    let vmin = Infinity, vminDay = -1, darkSeen = false;
    for (let i = 0; i < 292 && e.state.status === 'playing'; i++) {
      e.step(TICK);
      const sv = solvedOf(e.state); if (!sv) continue;
      for (const b of e.state.buses) {
        if (!kv.has(b.kvNom)) continue;
        if (sv.sol.energised[b.id] === false) { darkSeen = true; continue; }
        const v = sv.sol.V[b.id]!; if (v < vmin) { vmin = v; vminDay = e.state.clock.day; }
      }
    }
    expect(e.state.metrics.track.islandDarkDay).toBe(1); expect(darkSeen).toBe(true);
    const tr = e.state.metrics.track;
    expect(tr.vMinPu!).toBeCloseTo(vmin, 9); expect(tr.vMinPu!).toBeGreaterThan(0.5);
    const li = info(e).lesson as string;
    expect(li).not.toMatch(/lowest voltage was 0\.000 pu/);
    const m = li.match(/lowest voltage was ([\d.]+) pu at (\d\d:\d\d) on Day (\d)/);
    expect(m, li).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(vmin, 3); expect(Number(m![3])).toBe(vminDay + 1);
  });
  it('coach: volt, reserve, island, run', () => {
    expect(spec.coach.map((c) => c.id)).toEqual(['volt', 'reserve', 'island', 'run']);
    const e = fresh(); const q = (): string | null => (e.engine.q('coach') as any).id;
    expect(q()).toBe('volt');
    for (const a of reference4h.filter((x) => x.name !== 'tick' && x.name !== 'spinUnit')) e.step(a);   // the plan; the reference's spin waits for the radio's call
    expect(q()).toBe('run');
  });
  it('same actions, same hash; a full three-day run (288 blocks, 26 buses, five events) under 2.5 s', () => {
    const go = (): string => hashOf(run(play(spec.reference)).state);
    const t0 = performance.now(); const h = go(); const ms = performance.now() - t0;
    expect(go()).toBe(h); expect(ms).toBeLessThan(2500);
  });
});
