// Chapter 2's benches: L04 Spin the Alternator and L06 Exam Bridge: The Town Line. The numbers are the numbers of tools/oracles/ch2_expected.json (ch2_oracles.py, written
// independently in Python): lesson gates (naive fails for the right reason, lesson passes, reference earns three stars), frozen targets against the oracle's replay of the
// population rule and the engine's own, refusals that teach, the shift-report lesson in the player's numbers, determinism.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import oracle from '../../tools/oracles/ch2_expected.json';
import { GAME } from '../game';
import { en } from '../locales/en';
import type { GridState } from '../types';
import { LEVEL_SPECS, specOf } from './index';
import { runDesign } from './run';
import { botPopulation } from './population';
import { machineNumbers, MACHINE } from './ch2/machine';
import { townNumbers, TOWN } from './ch2/town';

const L04 = specOf('L04')!, L06 = specOf('L06')!;
const fresh = (level: string, region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level, region }); return e as Env<GridState>; };
const near = (a: number, b: number, rel = 1e-9): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b))); };
const act = (e: Env<GridState>, name: string, ...args: unknown[]) => e.engine.act(name, args);
const play = (e: Env<GridState>): void => { for (let i = 0; i < 14 && e.state.status === 'playing'; i++) e.step(TICK); };

describe('campaign order', () => {
  it('L04 stands just before L05 and L06 just after it, both in chapter 2', () => {
    const ids = LEVEL_SPECS.map((l) => l.id), i = ids.indexOf('L05');
    expect(ids[i - 1]).toBe('L04'); expect(ids[i + 1]).toBe('L06');
    expect(L04.chapter).toBe(2); expect(L06.chapter).toBe(2); expect(L04.kind).toBe('bench');
  });
});

describe('L04 Spin the Alternator: the machine against the oracle', () => {
  const o = oracle.L04;
  it('the fixed inputs and the design numbers (f = pN/120, e0 = NBAw, E = e0/sqrt 2, copper cost)', () => {
    near(o.inputs.section_mm2, 145); near(o.poles_for_50Hz, 12); near(o.peak_target_V, 325.2691193458119, 1e-12);
    for (const [region, pack] of [['global', o.global], ['in', o.in]] as const) {
      for (const k of ['naive', 'lesson', 'reference'] as const) {
        const d = pack.designs[k], e = fresh('L04', region);
        act(e, 'setPoles', d.poles); act(e, 'setTurns', d.turns); act(e, 'setField', d.field_T); act(e, 'setArea', d.area_m2);
        const n = machineNumbers(e.state.bench!.machine!);
        near(n.fHz, d.f); near(n.omega, d.omega); near(n.nba, d.nba); near(n.e0V, d.e0); near(n.eRmsV, d.erms); near(n.bandUsed, d.band); near(n.cost, d.cost, 1e-9); near(n.copperKg, d.copper_kg);
        near(e.state.budget.spent, d.cost, 1e-9);
      }
    }
  });
  it('naive: 4 poles at 500 rpm make 16.7 Hz (not 50), the shaft speed is 500 rpm', () => {
    const e = fresh('L04'); near(e.state.bench!.machine!.rpm, 500);
    const out = runDesign(L04, 'global', L04.naive.actions);
    expect(out.status).toBe('lost'); expect(out.failKind).toBe('brownout');
    near(out.track.freqHz!, o.naive_f_Hz); expect(out.reason).toMatch(/16\.67 Hz from 4 poles at 500 rpm; it needs 49\.75 to 50\.25 Hz/);
    expect(out.ticks).toBeLessThanOrEqual(5);
  });
  it('lesson: 12 poles make exactly 50 Hz and e0 of 329.9 V; the reference keeps a margin and three stars; the prediction is checked against e0', () => {
    const l = runDesign(L04, 'global', L04.lesson);
    expect(l.status, l.reason).toBe('won'); near(l.track.freqHz!, 50, 1e-12); near(l.track.vPeakV!, o.global.designs.lesson.e0);
    expect(l.stars).toBeLessThan(3);   // no prediction made
    const r = runDesign(L04, 'global', L04.reference);
    expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3); expect(r.track.predErrPct!).toBeLessThan(1);
    near(r.state.metrics.predictions[0]!.actual!, o.global.designs.reference.e0);
  });
  it('a perfect frequency with the wrong voltage is lost for the voltage, with the number to aim at', () => {
    const o2 = runDesign(L04, 'global', [{ name: 'setPoles', args: [12] }, { name: 'setTurns', args: [15] }, { name: 'setField', args: [0.7] }, { name: 'setArea', args: [0.05] }]);
    expect(o2.status).toBe('lost'); expect(o2.state.block.verdictKey).toBe('level.lost.machineVolt');
    const e = fresh('L04'); for (const a of [['setPoles', 12], ['setTurns', 15], ['setField', 0.7], ['setArea', 0.05]] as const) act(e, a[0], a[1]); play(e);
    const hint = (e.engine.q('levelInfo') as { tryHint: string }).tryHint;
    expect(hint).toContain('= 1.035'); expect(hint).toContain('yours makes 0.525'); expect(hint).toMatch(/325\.3 ÷ 314\.2/);
  });
  it('the frequency tolerance is 0.5 %: 11 poles are not allowed, 14 poles make 58.3 Hz and fail on frequency first', () => {
    expect(act(fresh('L04'), 'setPoles', 11).key).toBe('ch2.poles.range');
    const e = fresh('L04'); for (const a of [['setPoles', 14], ['setTurns', 30], ['setField', 0.7], ['setArea', 0.05]] as const) act(e, a[0], a[1]); play(e);
    expect(e.state.block.verdictKey).toBe('level.lost.machineFreq'); expect(e.state.statusReason).toMatch(/58\.33 Hz from 14 poles/);
    expect((e.engine.q('levelInfo') as { tryHint: string }).tryHint).toContain('120 × 50 ÷ 500 = 12 poles');
  });
  it('refusals teach: every out-of-range value has its key and a message without a hole', () => {
    for (const [name, arg, key] of [['setTurns', 5, 'ch2.turns.range'], ['setTurns', 20.5, 'ch2.turns.range'], ['setField', 1.4, 'ch2.field.range'], ['setField', 'x', 'ch2.field.range'], ['setArea', 0.5, 'ch2.area.range'], ['setPoles', 26, 'ch2.poles.range']] as const) {
      const e = fresh('L04'), before = JSON.stringify(e.state.bench), r = act(e, name, arg);
      expect(r.ok).toBe(false); expect(r.key).toBe(key); expect(en[key]).toBeTruthy(); expect(r.message).not.toMatch(/\{/); expect(JSON.stringify(e.state.bench)).toBe(before);
    }
    expect(act(fresh('L06'), 'setPoles', 12).ok).toBe(false);   // not on this level's part list
    expect(act(fresh('L04'), 'setLineRatio', 5).key).toBe('level.action.notAllowed');
  });
  it('the shift-report lesson prints the player\'s numbers and they recompute', () => {
    const e = fresh('L04'); for (const a of L04.lesson) act(e, a.name, ...a.args as unknown[]); play(e);
    expect(e.state.status).toBe('won');
    const li = (e.engine.q('levelInfo') as { lesson: string; tryHint: string });
    const m = li.lesson.match(/12 poles at 500 rpm give f = p × N ÷ 120 = 12 × 500 ÷ 120 = ([\d.]+) Hz\. Its coil peaks at e₀ = N × B × A × ω = (\d+) × ([\d.]+) × ([\d.]+) × ([\d.]+) = ([\d.]+) V, which is ([\d.]+) V rms/)!;
    expect(m).not.toBeNull();
    const [, f, n, b, a, w, e0, erms] = m.map(Number) as number[];
    near(f!, 50); near(n! * b! * a! * w!, e0!, 1e-3); near(e0! / Math.sqrt(2), erms!, 2e-3);
    expect(li.lesson).toContain('a peak of 325.3 V'); expect(li.tryHint).toBe('');
  });
  it('the live query carries what the scope draws: e0, E_rms, f, the band and the copper', () => {
    const e = fresh('L04'); const q = e.engine.q('ch2Bench') as any;
    expect(q.kind).toBe('machine'); expect(q.poles).toBeUndefined(); expect(q.machine.poles).toBe(MACHINE.start.poles); near(q.fHz, 4 * 500 / 120);
    near(q.e0V, 30 * 0.5 * 0.05 * 2 * Math.PI * q.fHz); near(q.vPeakTargetV, 325.2691193458119, 1e-12); expect(q.ok).toBe(false);
    expect(JSON.stringify(q)).not.toContain('null,"kg"');
    expect((fresh('L05').engine.q('ch2Bench') as any).active).toBe(false);
  });
});

describe('L06 Exam Bridge: The Town Line against AC-15 / AC-16', () => {
  const o = oracle.L06;
  it('the textbook numbers: 600 kW at 4 kV (AC-15), 6 kW at 40 kV (AC-16), the rest of the table', () => {
    near(o.predict_4kV_loss_kW, 600); near(o.predict_40kV_loss_kW, 6);
    for (const [r, row] of Object.entries(o.table)) {
      const e = fresh('L06'); act(e, 'setLineRatio', Number(r)); act(e, 'setTransformerKva', 1000);
      const n = townNumbers(e.state.bench!.town!);
      near(n.vLineV, row.v_line_V); near(n.iA, row.i_A); near(n.lossKw, row.loss_kW); near(n.lossPct, row.loss_pct); near(n.vTownPu, row.v_town_pu); near(n.loading, Number(r) === 1 ? 0 : row.loading);
    }
    near(o.need_kv_for_2pct, 24.494897427831788, 1e-12);
  });
  it('naive (no transformers): 600 kW lost, 75 %, the town sees 25 % of its voltage; lost in a few blocks', () => {
    const out = runDesign(L06, 'global', L06.naive.actions);
    expect(out.status).toBe('lost'); expect(out.failKind).toBe('brownout');
    near(out.track.lossKw!, 600); near(out.track.lossPct!, 75); near(out.track.vTownPu!, 0.25);
    expect(out.reason).toMatch(/lost 600 kW, 75 % of what was sent .* only 25 % of its voltage/);
    expect(out.ticks).toBeLessThanOrEqual(5);
  });
  it('lesson: 10:1 to 40 kV loses 6 kW (0.75 %) and passes; the reference (7:1, 28 kV) is cheapest and with the 600 kW prediction earns three stars', () => {
    const l = runDesign(L06, 'global', L06.lesson);
    expect(l.status, l.reason).toBe('won'); near(l.track.lossKw!, 6); near(l.track.lossPct!, 0.75); expect(l.stars).toBeLessThan(3);
    const r = runDesign(L06, 'global', L06.reference);
    expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3); near(r.track.predErrPct!, 0);
    near(r.capex, o.global.reference.cost, 1e-9); near(l.capex, o.global.lesson.cost, 1e-9);
    near(runDesign(L06, 'in', L06.reference).capex, o.in.reference.cost, 1e-9);
    expect(r.state.metrics.predictions[0]!.actual).toBe(600);
  });
  it('a 6:1 line loses 2.08 %: just over the limit; a 630 kVA transformer cooks at 127 %', () => {
    const six = runDesign(L06, 'global', [{ name: 'setLineRatio', args: [6] }]);
    expect(six.status).toBe('lost'); near(six.track.lossPct!, (100 * 15 * (800e3 / 24000) ** 2) / 800e3, 1e-9);
    const cook = runDesign(L06, 'global', [{ name: 'setLineRatio', args: [10] }, { name: 'setTransformerKva', args: [630] }]);
    expect(cook.status).toBe('lost'); expect(cook.failKind).toBe('overload'); expect(cook.reason).toBe('The step-up transformer carried 127 % of its 630 kVA rating and cooked.');
    const e = fresh('L06'); act(e, 'setLineRatio', 10); act(e, 'setTransformerKva', 630); play(e);
    expect((e.engine.q('levelInfo') as { tryHint: string }).tryHint).toContain('above 800 kVA');
  });
  it('the hint after a loss names the voltage that is enough, from the printed formula', () => {
    const e = fresh('L06'); act(e, 'setLineRatio', 5); play(e);
    const h = (e.engine.q('levelInfo') as { tryHint: string }).tryHint;
    expect(h).toContain('V ≥ √(P × R ÷ 2 %) = 24.5 kV'); expect(h).toContain('at least 6.1');
  });
  it('the shift-report lesson prints the player\'s numbers (I = P/V, loss = I²R) and the 4 kV comparison', () => {
    const e = fresh('L06'); for (const a of L06.lesson) act(e, a.name, ...a.args as unknown[]); play(e);
    const li = (e.engine.q('levelInfo') as { lesson: string }).lesson;
    expect(li).toContain('I = P ÷ V = 800 kW ÷ 40 kV = 20 A'); expect(li).toContain('P_loss = I² × R = 20² × 15 Ω = 6 kW, 0.75 %');
    expect(li).toContain('needs 200 A and loses 600 kW (75 %)'); expect(li).toContain('the current falls 10 times and the loss 100 times');
    const n = fresh('L06'); play(n);
    expect((n.engine.q('levelInfo') as { lesson: string }).lesson).toContain('600 kW, 75 % of what was sent');
  });
  it('refusals teach', () => {
    for (const [name, arg, key] of [['setLineRatio', 0, 'ch2.ratio.range'], ['setLineRatio', 2.5, 'ch2.ratio.range'], ['setLineRatio', 21, 'ch2.ratio.range'], ['setTransformerKva', 700, 'ch2.kva.range']] as const) {
      const e = fresh('L06'), before = JSON.stringify(e.state.bench), r = act(e, name, arg);
      expect(r.ok).toBe(false); expect(r.key).toBe(key); expect(r.message).not.toMatch(/\{/); expect(JSON.stringify(e.state.bench)).toBe(before);
    }
    expect(TOWN.kvas).toContain(1000);
  });
  it('the live query: line kV, amps, loss, the town\'s voltage, loading and the prediction', () => {
    const e = fresh('L06'); act(e, 'predict', TOWN.predictId, 590, 'kW'); act(e, 'setLineRatio', 10);
    const q = e.engine.q('ch2Bench') as any;
    expect(q.kind).toBe('town'); near(q.vLineV, 40000); near(q.iA, 20); near(q.lossKw, 6); near(q.predict4kvKw, 600); expect(q.prediction.predicted).toBe(590); expect(q.ok).toBe(true);
    play(e); expect(e.state.metrics.track.predErrPct).toBeCloseTo((100 * 10) / 600, 9);
  });
});

describe.each(['global', 'in'])('frozen targets in region %s equal the oracle\'s replay and the engine\'s population', (region) => {
  for (const [spec, key] of [[L04, 'L04'], [L06, 'L06']] as const) {
    it(`${key}: budget, star A and star B`, () => {
      const f = spec.frozen![region]!, ex = (oracle as any)[key][region].population, pop = botPopulation(spec, region);
      for (const [a, b] of [[f.budget, ex.budget], [f.starA, ex.starA], [f.starB, ex.starB], [pop.budget, ex.budget], [pop.starA, ex.starA], [pop.starB, ex.starB]] as const) expect(Math.abs(a - b), `${key} ${a} vs ${b}`).toBeLessThanOrEqual(0.005 * b);
      expect(pop.passing).toBe(ex.passing); near(pop.cheapestPass, ex.cheapest, 1e-9);
    });
  }
});

describe('determinism and free play', () => {
  it('the same actions give the same state hash', () => {
    const run = (): string => { const e = fresh('L04'); for (const a of L04.reference) e.step(a); play(e); return hashOf(e.state); };
    expect(run()).toBe(run());
    const run2 = (): string => { const e = fresh('L06'); for (const a of L06.reference) e.step(a); play(e); return hashOf(e.state); };
    expect(run2()).toBe(run2());
  });
  it('free play has no chapter-2 bench and the actions refuse politely', () => {
    const e = new Env(GAME); e.reset({ seed: 1 });
    expect(e.state.bench).toBeNull(); expect(act(e, 'setPoles', 12).ok).toBe(false);
  });
});

// 1.19 (Dagny's fun pass, DECISIONS 29): the prediction binds. The first prediction for a design is the one that counts; a second one for the same design is refused;
// a prediction counts for the lamp only while the design it was made for is the one that runs. L06's answer does not depend on the design: once only.
describe('the prediction binds (predictOnce)', () => {
  const A = [['setPoles', 12], ['setTurns', 13], ['setField', 0.8], ['setArea', 0.1]] as const;
  const B = [['setPoles', 12], ['setTurns', 15], ['setField', 0.86], ['setArea', 0.08]] as const;
  const build = (e: Env<GridState>, d: typeof A | typeof B): void => { for (const [n, v] of d) act(e, n, v); };
  it('L06: re-predicting after the reveal is refused; the first prediction stays', () => {
    const e = fresh('L06');
    expect(act(e, 'predict', TOWN.predictId, 6, 'kW').ok).toBe(true);
    const r = act(e, 'predict', TOWN.predictId, 600, 'kW');
    expect(r.ok).toBe(false); expect(r.key).toBe('act.predict.again'); expect(r.message).toBe('You already predicted this design.');
    act(e, 'setLineRatio', 10); act(e, 'setTransformerKva', 1000);
    expect(act(e, 'predict', TOWN.predictId, 600, 'kW').ok, 'L06 asks about 4 kV whatever the ratio: once only').toBe(false);
    expect(e.state.metrics.predictions.map((p) => p.predicted)).toEqual([6]);
    play(e); expect(e.state.status).toBe('won'); expect(e.state.metrics.track.predErrPct).toBeGreaterThan(98);
  });
  it('L04: a prediction for design A does not earn the lamp when design B runs; the coach asks again; a new prediction for B counts', () => {
    const e = fresh('L04'); build(e, A);
    const eA = machineNumbers(e.state.bench!.machine!).e0V;
    expect(act(e, 'predict', 'L04.vpeak', Math.round(eA * 10) / 10, 'V').ok).toBe(true);
    expect(act(e, 'predict', 'L04.vpeak', 300, 'V').ok, 'same design: refused').toBe(false);
    expect((e.engine.q('ch2Bench') as { predictedThis: boolean }).predictedThis).toBe(true);
    build(e, B);
    expect((e.engine.q('ch2Bench') as { predictedThis: boolean }).predictedThis, 'a new design hides the numbers again').toBe(false);
    expect((e.engine.q('coach') as { id: string }).id).toBe('predict');
    const stale = runDesign(L04, 'global', [...A.map(([n, v]) => ({ name: n, args: [v] })), { name: 'predict', args: ['L04.vpeak', 325] }, ...B.map(([n, v]) => ({ name: n, args: [v] }))]);
    expect(stale.status, stale.reason).toBe('won'); expect(stale.track.predErrPct, 'no lamp for a prediction of another design').toBeUndefined(); expect(stale.stars).toBeLessThan(3);
    const eB = machineNumbers(e.state.bench!.machine!).e0V;
    expect(act(e, 'predict', 'L04.vpeak', Math.round(eB * 10) / 10, 'V').ok, 'a new design may be predicted').toBe(true);
    play(e); expect(e.state.status).toBe('won'); expect(e.state.metrics.track.predErrPct!).toBeLessThan(1);
    expect((e.engine.q('levelInfo') as { lesson: string }).lesson).toContain(`You predicted ${Math.round(eB * 10) / 10} V, it was ${Math.round(eB * 10) / 10} V.`);
  });
  it('the report names the prediction, or says it was for another design', () => {
    const e = fresh('L06'); act(e, 'predict', TOWN.predictId, 590, 'kW'); act(e, 'setLineRatio', 10); act(e, 'setTransformerKva', 1000); play(e);
    expect((e.engine.q('levelInfo') as { lesson: string }).lesson).toContain('You predicted 590 kW, it was 600 kW.');
    const s = runDesign(L04, 'global', [...A.map(([n, v]) => ({ name: n, args: [v] })), { name: 'predict', args: ['L04.vpeak', 325] }, ...B.map(([n, v]) => ({ name: n, args: [v] }))]);
    expect(s.state.status).toBe('won');
  });
});

describe('L06 coach names the check that failed', () => {
  it('an undersized transformer pair: the coach asks for a bigger rating, not a higher voltage', () => {
    const e = fresh('L06'); act(e, 'predict', TOWN.predictId, 600, 'kW'); act(e, 'setLineRatio', 7); act(e, 'setTransformerKva', 630);
    const n = townNumbers(e.state.bench!.town!); expect(n.overload).toBe(true); expect(n.lossPct).toBeLessThan(2);
    const c = e.engine.q('coach') as { id: string; text: string };
    expect(c.id).toBe('rating'); expect(c.text).toMatch(/800 kW/); expect(c.text).not.toMatch(/raise the line voltage/i);
    act(e, 'setTransformerKva', 1000); expect((e.engine.q('coach') as { id: string }).id).toBe('run');
    act(e, 'setLineRatio', 2); expect((e.engine.q('coach') as { id: string }).id).toBe('loss');
  });
  it('old saves: the rating step is added after loss, so a carry from before it (0 to 3) still means the same steps', () => {
    const ids = L06.coach.map((c) => c.id); expect(ids.slice(0, 3)).toEqual(['predict', 'ratio', 'loss']);
    const e = fresh('L06'); act(e, 'predict', TOWN.predictId, 600, 'kW'); act(e, 'setLineRatio', 7); act(e, 'setTransformerKva', 630);
    e.state.coach.carry = 3;   // an old save that had finished predict, ratio and loss: it lands on the rating check, not on run
    expect((e.engine.q('coach') as { id: string }).id).toBe('rating');
    act(e, 'setTransformerKva', 1000); expect((e.engine.q('coach') as { id: string }).id).toBe('run');
  });
  it('both checks failing: the rating is named first, then the loss', () => {
    const e = fresh('L06'); act(e, 'predict', TOWN.predictId, 600, 'kW'); act(e, 'setLineRatio', 2); act(e, 'setTransformerKva', 630);
    expect((e.engine.q('coach') as { id: string }).id).toBe('rating');
    act(e, 'setTransformerKva', 1000); expect((e.engine.q('coach') as { id: string }).id).toBe('loss');
  });
});
