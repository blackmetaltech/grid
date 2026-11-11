// Chapter 6 (frequency & renewables): L19-L22 against the independent oracle tools/oracles/ch6_oracles.py (ch6_expected.json), the lesson numbers, the actions, determinism.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf, type Action } from '@core/kit';
import { GAME } from '../game';
import { specOf } from './index';
import { runDesign } from './run';
import { spin, ffr } from './levels/l19';
import { makeLevel } from './spec';
import { spinFuel } from '../freq-actions';
import { coalHold, condensers, gfm, rideThrough } from './levels/l21';
import { peakers, shift } from './levels/l20';
import { droops, ORACLE_ANSWERS, answers } from './levels/l22';
import { examTruth } from '../sim/freqtrack';
import type { GridState } from '../types';

const EXP = JSON.parse(readFileSync(fileURLToPath(new URL('../../tools/oracles/ch6_expected.json', import.meta.url)), 'utf8'));
const near = (a: number, b: number, abs: number): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(abs); };
const play = (id: string, acts: Action[], region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: id, region }); for (const a of acts) expect(e.step(a).info.ok, a.name).toBe(true); return e as Env<GridState>; };
const run = (e: Env<GridState>): Env<GridState> => { for (let i = 0; i < 100 && e.state.status === 'playing'; i++) e.step(TICK); return e; };
const info = (e: Env<GridState>): any => e.engine.q('levelInfo');

describe('L19 Fifty Hertz against the oracle', () => {
  for (const region of ['global', 'in']) {
    it(`${region}: naive, spin and spin+FFR windows equal the independent RK4`, () => {
      const spec = specOf('L19')!;
      for (const [name, acts] of [['naive', []], ['spin', spin], ['spin_ffr100', [...spin, ...ffr(2)]]] as const) {
        const o = runDesign(spec, region, [...acts], { frozen: null }), x = EXP.L19[region][name];
        near(o.track.nadirHz!, x.nadir, 0.004); near(o.track.rocof0!, -x.rocof0, 1e-3); near(o.track.shedMW!, x.shed, 1);
        near(o.track.hSys!, x.hsys, 1e-3); near(o.track.headroomMW!, x.headroom_mw, 0.5); near(o.track.reserveCover!, x.reserve_cover, 2e-3); near(o.track.lostMW!, x.trip_mw, 0.5);
      }
    });
  }
  it('the headroom rule: capacity is not the fix, a spinning unit is; the battery alone holds the first seconds but not the island', () => {
    const spec = specOf('L19')!;
    expect(runDesign(spec, 'global', [...ffr(3)]).status).toBe('lost');
    const z = { budget: 0, starA: 0, starB: 0 };
    const env = new Env({ ...GAME, levels: [makeLevel({ ...spec, frozen: { global: z, in: z } })] }); env.reset({ seed: 1, level: 'L19', region: 'global' });
    for (const a of ffr(5)) env.step(a);
    const e = run(env as Env<GridState>); expect(e.state.status).toBe('lost');
    expect(info(e).tryHint).toMatch(/is 400 MW short for good: 6500 MW of units left for 6900 MW of load/);
  });
  it('the lesson prints dP f0 / (2 H S) in the player\'s numbers and they recompute', () => {
    const e = run(play('L19', [])); const li = info(e).lesson as string;
    const m = li.match(/carrying (\d+) MW.*held (\d+) MVA at H = ([\d.]+) s.*= (\d+) x 50 \/ \(2 x ([\d.]+) x (\d+)\) = ([\d.]+) Hz\/s/)!;
    expect(m).not.toBeNull();
    near(Number(m[1]) * 50 / (2 * Number(m[3]) * Number(m[2])), Number(m[7]), 0.006);
    expect(li).toMatch(/not enough/); expect(info(e).tryHint).toMatch(/92 MW of headroom against 492 MW lost/);
    const w = run(play('L19', spin)); expect(info(w).lesson).toMatch(/That is enough/);
  });
  it('spinUnit costs a year of evenings, ffr parts are the only battery, refusals', () => {
    const e = play('L19', []);
    const r = e.engine.act('placeStorage', ['B1', 'bess-gfm-50']); expect(r.ok).toBe(false);
    const before = e.state.budget.spent; expect(e.step(spin[0]!).info.ok).toBe(true);
    const u = e.state.units.find((x) => x.id === 'U17')!;
    near(e.state.budget.spent - before, 365 * (u.startCost + spinFuel(u, 22 / 4)), 1);
    expect(e.step(spin[0]!).info.ok).toBe(false);
  });
  it('same actions, same hash', () => { const go = (): string => hashOf(run(play('L19', spin)).state); expect(go()).toBe(go()); });
});

describe('L20 Sun Goes Down against the oracle', () => {
  for (const region of ['global', 'in']) {
    it(`${region}: noon curtailment = fleet minimum - (demand - sun); the evening arithmetic of the naive and the cheapest design`, () => {
      const x = EXP.L20, y = x[region];
      const e = play('L20', [], region); while (e.state.clock.block < 48) e.step(TICK);
      near(e.state.block.demandMW, x.demand_12h, 1e-6); near(e.state.block.curtailedMW, y.curtail_12h_mw, 0.01);
      expect(y.shortfall_19h_coal_only_mw).toBe(900); expect(y.margin_4_peakers_noon_pumps_mw).toBeGreaterThan(0); expect(y.margin_2_peakers_noon_pumps_mw).toBeLessThan(0);
      const r = play('L20', [...peakers(4), ...shift], region); while (r.state.clock.block < 76) r.step(TICK);
      near(r.state.block.demandMW, x.demand_19h_noon, 1e-6); near(r.state.block.reserveMW + r.state.block.demandMW - x.coal_capacity_evening - 420, 0, 1);
    });
  }
  it('the pumps move to noon (free) and the dusk is not their hour; refusals: only an irrigation load can be shifted', () => {
    const e = play('L20', []); expect(e.engine.act('shiftLoad', ['L1', 'noon']).ok).toBe(false);
    expect(e.engine.act('shiftLoad', ['L2', 'noon']).ok).toBe(true); expect(e.state.budget.spent).toBe(0);
    expect(e.state.loads[1]!.shape!.p[44]).toBe(1); expect(e.state.loads[1]!.shape!.p[76]).toBe(0.05);
  });
  it('a store runs on its operator clock: charge 10-14, discharge 15-21', () => {
    const e = play('L20', [{ name: 'placeStorage', args: ['B1', 'psp-250'] }, { name: 'setStoreClock', args: ['S1', 10, 14, 15, 21] }]);
    while (e.state.clock.block < 44) e.step(TICK); expect(e.state.storage[0]!.P).toBeLessThan(-249);
    while (e.state.clock.block < 68) e.step(TICK); expect(e.state.storage[0]!.P).toBeGreaterThan(0);
    expect(e.engine.act('setStoreClock', ['S1', 5, 5, 6, 6]).ok).toBe(false);
  });
  it('lesson numbers: curtailment, ramp, share of blocks in range', () => {
    const e = run(play('L20', [...peakers(4), ...shift])); expect(e.state.status).toBe('won');
    const li = info(e).lesson as string; const m = li.match(/At noon ([\d.]+) % of what the sun could have made was curtailed.*below (\d+) % of their rating.*climbed (\d+) MW\/min at (\d\d):(\d\d).*in {1,2}(?:the standard range in )?([\d.]+) % of the blocks/)!;
    expect(m).not.toBeNull(); expect(Number(m[2])).toBe(40); near(Number(m[1]), e.state.metrics.track.curtailPct!, 0.06); expect(Number(m[3])).toBeGreaterThan(10);
    expect(info(run(play('L20', []))).tryHint).toMatch(/peakers ordered before the ramp/);
  });
});

describe('L21 Inertia Matters against the oracle', () => {
  for (const region of ['global', 'in']) {
    it(`${region}: naive (rooftops trip), ride-through only, lesson and reference equal the independent window`, () => {
      const spec = specOf('L21')!, x = EXP.L21[region];
      for (const [name, acts] of [['naive', []], ['ride_only', rideThrough], ['lesson', [...coalHold(2), ...gfm(8)]], ['reference', [...coalHold(2), ...gfm(10)]]] as const) {
        const o = runDesign(spec, region, [...acts], { frozen: null }), y = x[name];
        near(o.track.nadirHz!, y.nadir, 0.01); near(o.track.rocof0!, -y.rocof0, 0.01); expect((o.track.derTripped ?? 0) > 0, name).toBe(y.der_tripped);
        near(o.track.hSys! * o.track.sSys!, y.hs_mws, 5);
      }
    });
  }
  it('RoCoF = dP f0 / (2 H S) on the naive grid is 3.54 Hz/s (500 x 50 / (2 x 3529)) and the lesson prints it', () => {
    near(EXP.L21.global.naive.rocof0, -500 * 50 / (2 * 3529.4118), 1e-3);
    const e = run(play('L21', [])); const li = info(e).lesson as string;
    console.log('LI', li); expect(li).toMatch(/= 3\.5\d Hz\/s/); expect(li).toMatch(/rooftop PV went off/); expect(li).not.toMatch(/stayed on/);
    expect(info(e).tryHint).toMatch(/grid-forming battery adds 50 MW in 50 ms/);
    const w = run(play('L21', [...coalHold(2), ...gfm(10)])); expect(w.state.stars).toBe(3); expect(info(w).lesson).toMatch(/under their 1.0 Hz\/s, so the rooftops stayed on/);
  });
  it('ride-through is paid in the pack\'s PV price, condensers spin without fuel', () => {
    const e = play('L21', []); const r = e.step(rideThrough[0]!); expect(r.info.ok).toBe(true);
    near(e.state.budget.spent, 0.06 * 1448 * 1200 * 1000, 1); expect(e.step(rideThrough[0]!).info.ok).toBe(false);
    const c = play('L21', [{ name: 'placeUnit', args: ['synccon-100', 'B1', 300] }, { name: 'spinUnit', args: ['U11'] }]); expect(c.state.units.find((u) => u.id === 'U11')!.online).toBe(true);
  });
});

describe('L22 Exam Bridge against the oracle', () => {
  it('the engine answers the three textbook cases like the book (PS-23, PS-25, PS-26)', () => {
    const t = examTruth(), p = EXP.L22;
    near(t.examA, p.PS23_rocof_hz_s, 1e-9); near(t.examB, p.PS25_df_hz, 1e-6); near(t.examCdf, p.PS26_df_hz, 1e-6);
    near(t.examC, p.PS26_share_g1_mw, 1e-4); near(t.examCg2, p.PS26_share_g2_mw, 1e-4);
    near(p.task_R2_for_60_40_at_R1_4pct, 0.036, 1e-12);
  });
  for (const region of ['global', 'in']) {
    it(`${region}: textbook droops share 67.6 : 32.4 and fail; 4 % / 3.6 % share 60 : 40; stars follow the predictions`, () => {
      const spec = specOf('L22')!;
      const n = runDesign(spec, region, []); expect(n.failKind).toBe('share'); near(n.track.shareG1!, 0.6757, 2e-3);
      const l = runDesign(spec, region, droops(4, 3.6)); expect(l.status).toBe('won'); expect(l.stars).toBe(1); near(l.track.shareG1!, 0.6, 1e-4);
      expect(runDesign(spec, region, [...ORACLE_ANSWERS, ...droops(4, 3.6)]).stars).toBe(3);
      expect(runDesign(spec, region, [...answers(1.5, -0.024038, 67.57), ...droops(4, 3.6)]).stars).toBe(2);
      expect(runDesign(spec, region, [...answers(1.5, -0.1, 67.57), ...droops(4, 3.6)]).stars).toBe(1 + 0);
    });
  }
  it('the lesson and the try hint', () => {
    const e = run(play('L22', droops(4, 3.6))); expect(info(e).lesson).toMatch(/= 1\.200 Hz\/s.*G1 took 60\.0 % of the step/);
    const f = run(play('L22', [])); expect(info(f).tryHint).toMatch(/= 4 x 300 x 3 \/ \(500 x 2\) = 3\.60 %/);
  });
});

describe('L21 engine invariants: shed within the load, a sane gauge, more help never hurts the nadir', () => {
  const spec = specOf('L21')!;
  const designsL21 = (): { name: string; acts: Action[]; c: number; k: number; g: number; r: number }[] => {
    const out = [];
    for (const c of [0, 2]) for (const k of [0, 2]) for (const g of [0, 4, 8]) for (const r of [0, 1]) out.push({ name: `coal${c} cond${k} gfm${g} ride${r}`, acts: [...coalHold(c), ...condensers(k), ...gfm(g), ...(r ? rideThrough : [])], c, k, g, r });
    return out;
  };
  for (const region of ['global', 'in']) {
    it(`${region}: shed <= load, the gauge stays between 40 and 52 Hz, and each added help (coal, condenser, battery, ride-through) leaves the nadir no worse`, () => {
      const res = new Map<string, number>();
      for (const d of designsL21()) {
        const o = runDesign(spec, region, d.acts, { frozen: null });
        expect(o.track.shedMW!, d.name).toBeLessThanOrEqual(5200 + 1e-6);
        expect(o.state.freq.fHz, d.name).toBeGreaterThan(40); expect(o.state.freq.fHz, d.name).toBeLessThan(52);
        res.set(`${d.c}/${d.k}/${d.g}/${d.r}`, o.track.nadirHz!);
      }
      for (const [key, v] of res) {
        const [c, k, g, r] = key.split('/').map(Number) as [number, number, number, number];
        for (const nxt of [`${c === 0 ? 2 : c}/${k}/${g}/${r}`, `${c}/${k === 0 ? 2 : k}/${g}/${r}`, `${c}/${k}/${g === 0 ? 4 : g === 4 ? 8 : g}/${r}`, `${c}/${k}/${g}/1`]) {
          const w = res.get(nxt); if (w !== undefined && v >= 47.5) expect(w, `${key} -> ${nxt}`).toBeGreaterThanOrEqual(v - 0.005);
        }
      }
    });
  }
});

describe('L21 is winnable with the controls the card shows', () => {
  it('two coal units held and ten grid-forming batteries placed (no per-battery setting) earn three stars at the reference price', () => {
    const acts: Action[] = [...coalHold(2), ...Array.from({ length: 10 }, () => ({ name: 'placeStorage', args: ['B1', 'bess-gfm-50'] }) as Action)];
    for (const region of ['global', 'in']) { const o = runDesign(specOf('L21')!, region, acts); expect(o.status, o.reason).toBe('won'); expect(o.stars).toBe(3); if (region === 'global') { near(o.track.nadirHz!, 49.613, 0.01); near(o.capex, 298.3e6, 0.2e6); } }
  });
});
