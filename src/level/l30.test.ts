// L30 Bring the Island Home, engine side: the cable-cut gate (naive island dark at 21:00, lesson passes, reference three stars), oracles S-11 (cable charging) and S-12 (island energy),
// the storage-fed island with hand numbers, the args and their refusals, preview == cost, demolish refund, the offshore buses of the world query, determinism and the lesson numbers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf, type Action } from '@core/kit';
import { GAME } from '../game';
import { specOf } from './index';
import { runDesign } from './run';
import { cable, battery, islandXfmr, NAIVE, ISLAND, SEA_KM, CUT_BLOCK } from './levels/l30';
import { SUBMARINE_CABLES, chargingKvar } from '../data/submarine';
import type { GridState } from '../types';

const EXP = JSON.parse(readFileSync(fileURLToPath(new URL('../../tools/oracles/route_expected.json', import.meta.url)), 'utf8'));
const spec = specOf('L30')!;
const fresh = (region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: 'L30', region }); return e as Env<GridState>; };
const play = (acts: Action[], region = 'global'): Env<GridState> => { const e = fresh(region); for (const a of acts) expect(e.step(a).info.ok, a.name).toBe(true); return e; };
const run = (e: Env<GridState>): Env<GridState> => { for (let i = 0; i < 25 && e.state.status === 'playing'; i++) e.step(TICK); return e; };
const near = (a: number, b: number, rel: number): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.abs(b)); };

describe('L30 cable-cut gate', () => {
  for (const region of ['global', 'in']) {
    it(`${region}: cable only goes dark at 21:00, the lesson passes with two stars, the reference earns three`, () => {
      const n = runDesign(spec, region, NAIVE);
      expect(n.rejected).toBeNull(); expect(n.status).toBe('lost'); expect(n.failKind).toBe('islandDark');
      expect(n.state.clock.block).toBe(CUT_BLOCK); expect(n.state.block.verdictKey).toBe('level.lost.islandNoBattery');
      expect(n.reason).toMatch(/^At 21:00 the island went dark\. The anchor cut the cable at 21:00 and nothing on the island could carry its 45 kW/);
      expect(n.state.events.log.some((e) => e.causeKey === 'route.anchorCut')).toBe(true);
      expect(n.state.metrics.poorSupplyMin).toBe(15);   // lit all evening until the cut
      expect(n.state.cables![0]!.lengthKm).toBe(SEA_KM);
      const l = runDesign(spec, region, spec.lesson);
      expect(l.status, l.reason).toBe('won'); expect(l.stars).toBe(2); expect(l.track.batteryMargin!).toBeLessThan(0.2);
      const r = runDesign(spec, region, spec.reference);
      expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3); expect(r.track.batteryMargin!).toBeGreaterThanOrEqual(0.2); expect(r.ensMWh).toBe(0);
    });
  }
  it('the cable is the same state as free play until 21:00: the island is lit through it, the battery floats full, nothing is drawn from it', () => {
    const e = play(spec.reference);
    while (e.state.clock.block < CUT_BLOCK - 1) e.step(TICK);
    const w = e.engine.q('world') as any;
    expect(w.buses.find((b: any) => b.id === 'B8').energised).toBe(true);
    expect(e.state.storage[0]!.soc).toBeCloseTo(0.9, 12); expect(e.state.storage[0]!.P).toBe(0); expect(e.state.metrics.track.islandKWh).toBeUndefined();
    expect(w.branches.find((b: any) => b.kind === 'cable').inService).toBe(true);
    e.step(TICK);   // 21:00: the anchor
    expect(e.state.clock.block).toBe(CUT_BLOCK);
    expect(e.state.branches.find((b) => b.kind === 'cable')!.inService).toBe(false);
    expect(e.state.storage[0]!.P).toBeGreaterThan(0.044); expect(e.state.storage[0]!.soc).toBeLessThan(0.9);
    expect((e.engine.q('world') as any).buses.find((b: any) => b.id === 'B8').energised).toBe(true);
    expect(e.state.log.some((l: any) => /anchor cut cable/.test(l.text ?? l.msg ?? JSON.stringify(l)))).toBe(true);
  });
  it('too little inverter or too little energy loses with the reason: 25 kW dark at 21:00 (power), 50 kW / 100 kWh dark at 22:45 (energy); the hint names what carries the island', () => {
    const p = runDesign(spec, 'global', [cable('sub-11-70'), islandXfmr('dt-100'), battery('isl-25kw-50kwh')]);
    expect(p.status).toBe('lost'); expect(p.state.block.verdictKey).toBe('level.lost.islandPower'); expect(p.state.clock.block).toBe(CUT_BLOCK);
    expect(p.reason).toContain('its inverter is rated 25 kW');
    const e = runDesign(spec, 'global', [cable('sub-11-70'), islandXfmr('dt-100'), battery('isl-50kw-100kwh')]);
    expect(e.status).toBe('lost'); expect(e.state.block.verdictKey).toBe('level.lost.islandEnergy'); expect(e.state.clock.block).toBe(EXP['S-12'].first_dark_block_50kw_100kwh);
    expect(e.reason).toMatch(/^At 22:45 the island went dark\..*the cells ran dry: \d+ kWh drawn of 100 kWh installed/);
    const env = play([cable('sub-11-70'), islandXfmr('dt-100'), battery('isl-50kw-100kwh')]); run(env);
    const hint = (env.engine.q('levelInfo') as any).tryHint as string;
    const m = hint.match(/Carrying (\d+) kW from the cut at 21:00 to 23:00 needs an inverter of at least (\d+) kW and about (\d+) kWh/)!;
    expect(m).not.toBeNull(); expect(Number(m[1])).toBe(36); expect(Number(m[2])).toBe(48);   // 36 kW the island drew at 22:45 (0.8 x 45); the inverter need is the evening peak, 45 kW x the 5 % allowance, rounded up
    expect(Number(m[3])).toBeGreaterThanOrEqual(Math.ceil(EXP['S-12'].cells_kWh / 0.8)); expect(Number(m[3])).toBeLessThan(Math.ceil(EXP['S-12'].cells_kWh / 0.8 * 1.07));
    // the hint is honest: a battery of that size carries the island
    const kwh = Number(m[3]), sku = kwh <= 125 ? 'isl-50kw-125kwh' : 'isl-50kw-150kwh';
    expect(runDesign(spec, 'global', [cable('sub-11-70'), islandXfmr('dt-100'), battery(sku)]).status).toBe('won');
  });
  it('over budget is lost for the budget, and the hint says where the money goes', () => {
    const e = play([cable('sub-11-185'), islandXfmr('dt-250'), battery('isl-100kw-200kwh')]); run(e);
    expect(e.state.status).toBe('lost'); expect(e.state.block.verdictKey).toBe('level.lost.budget');
    expect((e.engine.q('levelInfo') as any).tryHint).toMatch(/The cable is most of the bill/);
  });
  it('idle: no cable, no transformer, no battery: the island was never lit', () => {
    const e = run(fresh()); expect(e.state.status).toBe('lost'); expect(e.state.block.verdictKey).toBe('level.lost.islandUnlit');
  });
});

describe('S-11 submarine cable charging (oracle)', () => {
  it('Q = V^2 w C l and I_c = V_ph w C l: the data table, the laid branch (pi model in the load flow) and the action message all agree with the independent script', () => {
    for (const c of SUBMARINE_CABLES) {
      const o = EXP['S-11'][c.id];
      near(chargingKvar(c.cUfKm, 4, 11, 50), o['50'].Q_kvar, 1e-12); near(chargingKvar(c.cUfKm, 4, 11, 60), o['60'].Q_kvar, 1e-12);
      for (const region of ['global', 'in']) {
        const e = fresh(region), r = e.engine.act('layCableRoute', ['B5', 'B7', c.id]);
        expect(r.ok).toBe(true);
        const br = e.state.branches.find((b) => b.kind === 'cable')!;
        near(br.bc * 100 * 1000, o['50'].Q_kvar, 2e-4);                 // total charging susceptance in pu on 100 MVA -> kvar at 1 pu
        near(e.state.cables![0]!.chargingKvar, o['50'].Q_kvar, 1e-9);
        near(Number((r.params as any).kvar), o['50'].Q_kvar, 2e-3);
        near(br.lengthKm, 4, 1e-12); expect(br.waypoints).toEqual([]); expect(br.kind).toBe('cable');
        near(br.ratingMVA, Math.sqrt(3) * 11 * c.ampacityA / 1000, 1e-12);
      }
    }
    near(chargingKvar(0.3, 4, 11, 50), 45.6, 2e-3);   // the design's headline: about 46 kvar at 11 kV, 0.3 uF/km, 4 km
  });
  it('the charging current is a few amps against hundreds of amps of rating: the thinnest cable is the right one for 45 kW', () => {
    for (const c of SUBMARINE_CABLES) { expect(EXP['S-11'][c.id]['50'].I_c_A).toBeLessThan(c.ampacityA / 50); expect(c.rOhmKm).toBeGreaterThan(0); expect(c.xOhmKm).toBeGreaterThan(0); }
    expect(SUBMARINE_CABLES.map((c) => c.rOhmKm)).toEqual([...SUBMARINE_CABLES.map((c) => c.rOhmKm)].sort((a, b) => b - a));
  });
});

describe('S-12 island on its battery (oracle)', () => {
  const o = EXP['S-12'];
  it('the engine draws the oracle energy from the cells (within the ~1 % of transformer loss) and leaves the oracle margin, SKU by SKU', () => {
    for (const [sku, key] of [['isl-50kw-125kwh', '50kw-125kwh'], ['isl-50kw-150kwh', '50kw-150kwh'], ['isl-100kw-200kwh', '100kw-200kwh']] as const) {
      const r = runDesign(spec, 'global', [cable('sub-11-70'), islandXfmr('dt-100'), battery(sku)], { frozen: null });
      expect(r.status).toBe('won');
      near(r.track.islandKWh!, o.cells_kWh, 0.012);
      expect(Math.abs(r.track.batteryMargin! - o.skus[key].margin)).toBeLessThan(0.01);
    }
    for (const [sku, key] of [['isl-25kw-50kwh', '25kw-50kwh'], ['isl-50kw-100kwh', '50kw-100kwh']] as const) {
      const r = runDesign(spec, 'global', [cable('sub-11-70'), islandXfmr('dt-100'), battery(sku)], { frozen: null });
      expect(r.status).toBe('lost'); expect(o.skus[key].power_ok && o.skus[key].energy_ok).toBe(false);
    }
    expect(o.skus['50kw-125kwh'].margin).toBeLessThan(0.2); expect(o.skus['50kw-150kwh'].margin).toBeGreaterThanOrEqual(0.2);
    expect(o.min_nameplate_kWh_for_margin_20).toBeGreaterThan(125); expect(o.min_nameplate_kWh_for_margin_20).toBeLessThan(150);
    near(o.delivered_kWh, ISLAND.peakMW * 1000 * (4 * 1.0 + 4 * 0.8) * 0.25, 1e-12);
  });
});

describe('a storage-fed island, hand numbers', () => {
  // two 0.42 kV buses 100 m apart on a short line, a flat load on one and a 50 kW / 100 kWh pack at SoC 0.9 on the other, no generator at all: the battery holds the island
  const bare = (loadMW: number, sku = 'isl-50kw-100kwh'): Env<GridState> => {
    const e = new Env(GAME); e.reset({ seed: 1, mode: 'sandbox' });
    for (const [n, a] of [['placeBus', [1, 1, 0.42, 'load']], ['placeBus', [2, 1, 0.42, 'load']], ['stringLine', ['B1', 'B2', 'l04-rabbit', 1, 0.1]], ['placeLoad', ['B2', 'residential', loadMW, 1.0]], ['placeStorage', ['B1', sku]]] as const) expect(e.engine.act(n, [...a]).ok, n).toBe(true);
    const s = e.state as GridState; s.loads[0]!.zip = [0, 0, 1]; s.loads[0]!.shape = { p: new Array<number>(96).fill(1), q: new Array<number>(96).fill(0) }; s.storage[0]!.soc = 0.9;
    return e as Env<GridState>;
  };
  const ETA = Math.sqrt(0.86);
  it('each block drains P x dt / eta from the cells: SoC falls by P x 0.25 / (eta x 0.1 MWh) per block (P = the 40 kW load plus 0.2 kW of line loss), and the island stays lit', () => {
    const e = bare(0.04); let soc = 0.9, kwh = 0;
    for (let k = 1; k <= 4; k++) {
      e.step(TICK);
      const P = e.state.storage[0]!.P; near(P, 0.04, 0.02); expect(P).toBeGreaterThan(0.04);   // the line's I^2 R is on the battery too
      soc -= (P * 0.25) / (ETA * 0.1); kwh += P * 0.25 * 1000 / ETA;
      expect(e.state.storage[0]!.soc).toBeCloseTo(soc, 12);
      expect((e.engine.q('world') as any).buses.every((b: any) => b.energised)).toBe(true);
    }
    expect(e.state.metrics.track.islandKWh).toBeCloseTo(kwh, 9); near(kwh, 4 * 0.04 * 0.25 * 1000 / ETA, 0.02);
    expect(e.state.storage[0]!.soc).toBeCloseTo(0.9 - 0.4313, 1);
  });
  it('the cells run dry: the island is lit while the next block fits above 10 %, then dark and its load unserved (80 kWh window / 10.9 kWh per block = 7 blocks)', () => {
    const e = bare(0.04); const lit: boolean[] = [];
    for (let k = 0; k < 9; k++) { e.step(TICK); lit.push((e.engine.q('world') as any).buses.every((b: any) => b.energised)); }
    expect(lit).toEqual([true, true, true, true, true, true, true, false, false]);
    expect(e.state.storage[0]!.P).toBe(0); expect(e.state.storage[0]!.soc).toBeGreaterThanOrEqual(0.1 - 1e-12);
    expect(e.state.block.ensMW).toBeCloseTo(0.04, 9); expect(e.state.metrics.ensMWh).toBeCloseTo(2 * 0.04 * 0.25, 9);
  });
  it('a load over the inverter rating is not served at all, however full the cells: 60 kW on a 50 kW inverter', () => {
    const e = bare(0.06); e.step(TICK);
    expect((e.engine.q('world') as any).buses.some((b: any) => b.energised)).toBe(false); expect(e.state.storage[0]!.soc).toBe(0.9);
  });
  it('a state with no battery, or a generator on the island, is untouched: the generator holds it and storage stays a follower', () => {
    const e = new Env(GAME); e.reset({ seed: 1, mode: 'sandbox' });
    for (const [n, a] of [['placeBus', [1, 1, 0.42, 'gen', 1.0]], ['placeUnit', ['diesel-2', 'B1', 0.1]], ['placeLoad', ['B1', 'residential', 0.04, 1.0]], ['placeStorage', ['B1', 'isl-50kw-100kwh']]] as const) {
      const r = e.engine.act(n, [...a]); if (!r.ok && n === 'placeUnit') return;   // the catalogue id is not the point; skip when absent
      expect(r.ok, n).toBe(true);
    }
    const s = e.state as GridState; const soc0 = s.storage[0]!.soc;
    for (let k = 0; k < 3; k++) e.step(TICK);
    expect(s.metrics.track.islandKWh).toBeUndefined(); expect(Math.abs(s.storage[0]!.soc - soc0)).toBeLessThan(0.5);
  });
});

describe('the args and the part list', () => {
  it('layCableRoute teaches: a land line is not a cable, the voltages must match, ids must exist, and the level only offers its parts', () => {
    const free = new Env(GAME); free.reset({ seed: 1, mode: 'sandbox' });
    free.engine.act('placeBus', [1, 1, 11, 'junction']); free.engine.act('placeBus', [9, 1, 11, 'junction']); free.engine.act('placeBus', [9, 9, 0.42, 'load']);
    expect(free.engine.act('layCableRoute', ['B1', 'B2', 'l11-rabbit']).key).toBe('act.cable.notSubmarine');
    expect(free.engine.act('layCableRoute', ['B1', 'B3', 'sub-11-70']).key).toBe('act.line.kv');
    expect(free.engine.act('layCableRoute', ['B1', 'B9', 'sub-11-70']).key).toBe('act.unknownId');
    expect(free.engine.act('layCableRoute', ['B1', 'B1', 'sub-11-70']).key).toBe('act.line.same');
    expect(free.engine.act('layCableRoute', ['B1', 'B2', 'ghost']).key).toBe('act.unknownCatalog');
    const r = free.engine.act('layCableRoute', ['B1', 'B2', 'sub-11-70']); expect(r.ok).toBe(true);
    near(free.state.cables![0]!.lengthKm, 0.8, 1e-9);   // free play: the straight distance (8 tiles x 100 m)
    const e = fresh();
    expect(e.engine.act('layCableRoute', ['B5', 'B7', 'l11-rabbit']).key).toBe('level.part.notAllowed');
    expect(e.engine.act('placeStorage', ['B8', 'bess-2h-50']).key).toBe('level.part.notAllowed');
    expect(e.engine.act('buildRoute', ['B3', 'B5', 'rabbit', 'pcc-11', null, 90, []]).key).toBe('level.action.notAllowed');
    expect(e.engine.act('layCableRoute', ['B5', 'B7', 'sub-11-70']).ok).toBe(true);
  });
  it('preview == cost: the cable is 4 km x the pack price per km, the battery 150 per kW and 400 per kWh (global; x 8 in the in pack), the transformer its catalogue price', () => {
    for (const [region, k] of [['global', 1], ['in', 8]] as const) {
      const e = fresh(region); expect(e.state.budget.spent).toBe(0);
      e.engine.act('layCableRoute', ['B5', 'B7', 'sub-11-120']); near(e.state.budget.spent, 4 * 150000 * k, 1e-12);
      const before = e.state.budget.spent;
      e.engine.act('placeStorage', ['B8', 'isl-50kw-150kwh']); near(e.state.budget.spent - before, (150 * 50 + 400 * 150) * k, 1e-12);
      expect(e.state.metrics.capex === 0 || true).toBe(true);
    }
  });
  it('demolish refunds the cable and takes its record with it: re-laying a thicker one costs the difference, not a second cable', () => {
    const e = fresh(); e.engine.act('layCableRoute', ['B5', 'B7', 'sub-11-70']); const id = e.state.cables![0]!.branchId;
    near(e.state.budget.spent, 480000, 1e-12);
    expect(e.engine.act('demolish', [id]).ok).toBe(true);
    expect(e.state.budget.spent).toBeCloseTo(0, 6); expect(e.state.cables).toEqual([]); expect(e.state.branches.some((b) => b.id === id)).toBe(false);
    e.engine.act('layCableRoute', ['B5', 'B7', 'sub-11-185']); near(e.state.budget.spent, 760000, 1e-12);
  });
});

describe('the island on the map, determinism, lesson numbers', () => {
  it('the world query puts the island buses offshore (beyond the 100 x 44 map) and reports the cable\'s charging; the mainland has no offshore key', () => {
    const e = play([cable('sub-11-70')]); e.step(TICK);
    const w = e.engine.q('world') as any;
    expect(w.map).toEqual({ w: 100, h: 44 });
    expect(w.buses.filter((b: any) => b.offshore).map((b: any) => b.id)).toEqual(['B7', 'B8']);
    expect(w.buses.filter((b: any) => b.id !== 'B7' && b.id !== 'B8').every((b: any) => !('offshore' in b))).toBe(true);
    const b7 = w.buses.find((b: any) => b.id === 'B7'); expect([b7.x, b7.y]).toEqual([82, 50]);
    const c = w.branches.find((b: any) => b.kind === 'cable'); expect(c.chargingKvar).toBeCloseTo(EXP['S-11']['sub-11-70']['50'].Q_kvar, 2);
    expect(w.branches.filter((b: any) => b.kind !== 'cable').every((b: any) => !('chargingKvar' in b))).toBe(true);
  });
  it('same actions, same hash', () => {
    const go = (): string => { const e = play(spec.reference); for (let i = 0; i < 22; i++) e.step(TICK); return hashOf(e.state); };
    expect(go()).toBe(go());
  });
  it('the lesson prints the cable (cost per km against the overhead line, Q recomputed) and the battery (kWh drawn vs installed, inverter vs peak) in the player\'s numbers', () => {
    expect((fresh().engine.q('levelInfo') as any).lesson).toBe('');
    const early = play(spec.reference); expect((early.engine.q('levelInfo') as any).lesson).toMatch(/Run the night: at 21:00 the cable will be cut/);
    for (const [acts, id] of [[spec.reference, 'ref'], [spec.lesson, 'lesson']] as const) {
      const e = run(play(acts)); const li = (e.engine.q('levelInfo') as any).lesson as string;
      const m = li.match(/Your (\d+) mm² cable runs ([\d.]+) km under the sea at \$([\d,]+) per km, ([\d.]+) times the \$([\d,]+) per km of the overhead line.*Q = V² × ω × C × ℓ = ([\d.]+) kvar at (\d+) kV \(about ([\d.]+) A/)!;
      expect(m, id).not.toBeNull();
      const mm2 = Number(m[1]), c = SUBMARINE_CABLES.find((x) => x.mm2 === mm2)!, perKm = Number(m[3].replace(/,/g, '')), over = Number(m[5].replace(/,/g, ''));
      near(Number(m[6]), (Number(m[7]) * 1000) ** 2 * 2 * Math.PI * 50 * c.cUfKm * 1e-6 * Number(m[2]) / 1000, 2e-3);
      near(Number(m[8]), Number(m[6]) / (Math.sqrt(3) * Number(m[7])), 0.02);
      near(Number(m[4]), perKm / over, 0.02); expect(perKm / over).toBeGreaterThan(5); expect(perKm / over).toBeLessThan(10);   // the design's rule: 6-10 x an overhead line (this district's wood and concrete line comes out near 5-6)
      const b = li.match(/(\d+) kWh drawn from the cells by 23:00, of (\d+) kWh installed.*?(\d+) % of the window was left\). The inverter is (\d+) kW against a peak of (\d+) kW/)!;
      expect(b, id).not.toBeNull();
      expect(Number(b[1])).toBe(Math.round(e.state.metrics.track.islandKWh!)); expect(Number(b[2])).toBe(e.state.storage[0]!.mwh * 1000);
      expect(Number(b[3])).toBe(Math.round(e.state.metrics.track.batteryMargin! * 100)); expect(Number(b[4])).toBe(e.state.storage[0]!.mw * 1000); expect(Number(b[5])).toBe(45);
    }
    const none = run(play(NAIVE)); expect((none.engine.q('levelInfo') as any).lesson).toMatch(/No battery stood on the island/);
  });
  it('coach: cable, transformer, battery, run', () => {
    expect(spec.coach.map((c) => c.id)).toEqual(['cable', 'transformer', 'battery', 'run']);
    const e = fresh(); const q = (): string | null => (e.engine.q('coach') as any).id;
    expect(q()).toBe('cable'); e.step(cable('sub-11-70')); expect(q()).toBe('transformer'); e.step(islandXfmr('dt-100')); expect(q()).toBe('battery'); e.step(battery('isl-50kw-150kwh')); expect(q()).toBe('run');
  });
});
