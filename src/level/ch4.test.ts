// Chapter 4 (L10 Balance the Phases, L11 Star or Delta, L12 Over the Hill, L13 Exam Bridge): the engine against tools/oracles/ch4_oracles.py (independent numpy
// re-derivation: ch4_expected.json), the lesson gates of the four levels in both packs (naive fails for the right reason, lesson passes, reference earns three stars),
// the part gate and the refusals, the shift report's numbers, determinism.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import expected from '../../tools/oracles/ch4_expected.json';
import { specOf } from './index';
import { runDesign } from './run';
import { ASSIGN } from './levels/l10';
import { solveFeeder } from '../sim/ch4/feeder';
import { bankBursts, bankQvar, cPerPhaseUF, qcNeeded, solvePfc } from '../sim/ch4/pfc';
import { hydroNumbers, runSwing } from '../sim/ch4/hydro';
import { nightAt, nightExcitationFor, ratedAnswers } from '../sim/ch4/exam';
import { PHASES, type Phase } from '../sim/ch4/data';
import { balancedSum } from '../sim/bench';
import type { GridState } from '../types';

const E: any = expected;
const near = (a: number, b: number, rel = 1e-9): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b))); };
const phases = (s: string): Phase[] => s.split('') as Phase[];
const fresh = (level: string, region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level, region }); return e as Env<GridState>; };
const act = (e: Env<GridState>, name: string, ...args: unknown[]) => e.engine.act(name, args);
const q = (e: Env<GridState>, name: string, ...args: unknown[]): any => e.engine.q(name, args);
const REGIONS = ['global', 'in'];

describe('L10 the four-wire street = the oracle', () => {
  it('the assignment strings of the levels are the oracle\'s (greedy by kW, by kVA, fewest moves)', () => {
    expect(ASSIGN.none).toBe(E.L10.assignments.allA); expect(ASSIGN.rr).toBe(E.L10.assignments.roundRobin);
    expect(ASSIGN.kw).toBe(E.L10.assignments.greedyKW); expect(ASSIGN.kva).toBe(E.L10.assignments.greedyKVA); expect(ASSIGN.min).toBe(E.L10.assignments.minMoves);
  });
  it.each(Object.keys(E.L10.cases))('%s: neutral and phase currents, far-pole voltages, losses at the evening peak', (name) => {
    const o = E.L10.cases[name], r = solveFeeder(phases(E.L10.assignments[name]), 54.6, 1)!;
    near(r.iN, o.iN, 1e-9); near(r.iMax, o.iMax, 1e-9); near(r.iNpct, o.iNpct, 1e-9); near(r.lossPct, o.lossPct, 1e-8); near(r.pSupplyW, o.pSupplyW, 1e-9); near(r.shiftFarV, o.neutralShiftFarV, 1e-8);
    for (const p of PHASES) { near(r.iPhase[p], o.iPhase[p], 1e-9); near(r.vFar[p], o.vFar[p], 1e-9); }
  });
  it('I_N = I_a + I_b + I_c as phasors (G-05), and a balanced set sums to zero; the all-on-a street is the whole current in the neutral', () => {
    const r = solveFeeder(phases(ASSIGN.kva), 54.6, 1)!;
    near(r.iNc.re, r.iPh.a.re + r.iPh.b.re + r.iPh.c.re, 1e-9); near(r.iNc.im, r.iPh.a.im + r.iPh.b.im + r.iPh.c.im, 1e-9);
    expect(r.iN).toBeLessThan(r.iPhase.a + r.iPhase.b + r.iPhase.c);
    expect(balancedSum()).toBeLessThan(1e-12); near(E.L10.balancedSumMag, 0, 1); expect(E.L10.g05.iN).toBeCloseTo(Math.sqrt(28), 9);   // G-05: 10 A at 0, 6 A at -120, 4 A at +120 sum to 5.29 A, not 20 A
    const a = solveFeeder(phases(ASSIGN.none), 54.6, 1)!;
    near(a.iN, a.iMax, 1e-9); expect(a.iNpct).toBeCloseTo(100, 6);
  });
  it('a burnt-through neutral floats the star point: the lightly loaded phases rise (oracle, neutral open at the first pole)', () => {
    const o = E.L10.neutralOpenAllA, r = solveFeeder(phases(ASSIGN.none), 54.6, 1, true)!;
    for (const p of PHASES) near(r.vFar[p], o.vFar[p], 1e-6);
    expect(Math.max(r.vFar.b, r.vFar.c)).toBeGreaterThan(1.5 * 230 * 0.9);
  });
});

describe('L11 the bank and the pump = the oracle', () => {
  it('PS-05 rule: Q_c = P (tan phi1 - tan phi2), C_Y and C_delta = C_Y / 3 at 400 V', () => {
    const need = qcNeeded(500, 0.7, 0.95);
    near(need / 1000, E.L11.qcNeedKvar, 1e-9); near(cPerPhaseUF(need, 50, 'Y'), E.L11.cYuF, 1e-9); near(cPerPhaseUF(need, 50, 'D'), E.L11.cDuF, 1e-9);
    near(cPerPhaseUF(need, 50, 'D') * 3, cPerPhaseUF(need, 50, 'Y'), 1e-12);
  });
  it.each(Object.entries(E.L11.banks))('bank %s: kVAr, can voltage, power factor and the dip for each starter', (name, o: any) => {
    const m = /^([YD])(\d+)x(\d+)$/.exec(name)!, bank = { unitUF: 100, count: Number(m[3]), conn: m[1] as 'Y' | 'D', ratedV: Number(m[2]) };
    near(bankQvar(bank, 50) / 1000, o.qKvar, 1e-9); expect(bankBursts(bank)).toBe(o.burst);
    for (const st of ['dol', 'yd', 'soft'] as const) {
      const r = solvePfc(bank, st, 50);
      near(r.pf, o[st].pf, 1e-9); near(r.dipPct, o[st].dipPct, 1e-9); near(r.vBusPu, o[st].vBusPu, 1e-9); near(r.iStartA, o[st].iStartA, 1e-9);
    }
  });
  it('star-delta starts on a third of the DOL current; the dip shrinks with it; no bank leaves the bus lower', () => {
    const b = { unitUF: 100, count: 72, conn: 'Y' as const, ratedV: 250 };
    const dol = solvePfc(b, 'dol', 50), yd = solvePfc(b, 'yd', 50), soft = solvePfc(b, 'soft', 50);
    near(yd.iStartA * 3, dol.iStartA, 1e-12); expect(yd.dipPct).toBeLessThan(soft.dipPct); expect(soft.dipPct).toBeLessThan(dol.dipPct);
    near(solvePfc(null, 'dol', 50).pf, 0.7, 1e-9); expect(solvePfc(null, 'dol', 50).vBusPu).toBeLessThan(dol.vBusPu);
    for (const k of ['dol', 'yd', 'soft'] as const) near(solvePfc(null, k, 50).dipPct, E.L11.nocap[k].dipPct, 1e-9);
  });
});

describe('L12 the swing = the oracle', () => {
  it.each(Object.entries(E.L12.cases))('%s: E\', P_max pre and post, the post angle, the RK4 peak', (name, o: any) => {
    const m = /^(?:night)?v?(0\.90|0\.95|1\.00|1\.05)(?:s(\d+))?(?:r(\d+))?(third)?$/.exec(name);
    const vref = name === 'night0.90' ? 0.9 : Number(m![1]), series = Number(m![2] ?? 0), red = Number(m![3] ?? 0), third = name.includes('third');
    const b = { vref, seriesPct: series, third, reduceMW: name === 'v0.90r60' ? 60 : red };
    const n = hydroNumbers(b);
    expect(n.ok).toBe(true);
    near(n.E, o.E, 1e-9); near(n.pmaxPre, o.pmaxPre, 1e-9); near(n.pmaxPost, o.pmaxPost, 1e-9); near(n.delta0Deg, o.delta0Deg, 1e-9); near(n.xPre, o.xPre, 1e-9); near(n.xPost, o.xPost, 1e-9);
    const sw = runSwing(b).out;
    expect(sw.stable).toBe(!o.lost);
    near(sw.peakDeltaDeg, o.deltaMaxDeg, 1e-7);
    if (!o.lost) near(sw.deltaUDeg, o.deltaUDeg, 1e-9);
  });
  it('the numbers of DESIGN: at V_ref 1.05 the reactance is 0.349 then 0.478 pu, P_max 3.40 then 2.48 pu, post angle 53.6 degrees; excitation, series compensation and a third circuit all lift the curve', () => {
    const n = hydroNumbers({ vref: 1.05, seriesPct: 0, third: false, reduceMW: 0 });
    expect(n.xPre).toBeCloseTo(0.349, 3); expect(n.xPost).toBeCloseTo(0.478, 3); expect(n.pmaxPre).toBeCloseTo(3.40, 2); expect(n.pmaxPost).toBeCloseTo(2.48, 2); expect(n.deltaPostDeg!).toBeCloseTo(53.6, 1);
    const lo = hydroNumbers({ vref: 0.95, seriesPct: 0, third: false, reduceMW: 0 }), s30 = hydroNumbers({ vref: 1.05, seriesPct: 30, third: false, reduceMW: 0 }), c3 = hydroNumbers({ vref: 1.05, seriesPct: 0, third: true, reduceMW: 0 });
    expect(n.pmaxPost).toBeGreaterThan(lo.pmaxPost); expect(s30.pmaxPost).toBeGreaterThan(n.pmaxPost); expect(c3.pmaxPost).toBeGreaterThan(n.pmaxPost);
  });
});

describe('L13 the generator on paper = the oracle (PS-27, PS-28)', () => {
  it('E, delta and P_max of the rated case; the night excitation for Q = -0.2 pu at P = 0.6 pu', () => {
    const a = ratedAnswers();
    near(a.E, E.L13.E, 1e-9); near(a.deltaDeg, E.L13.deltaDeg, 1e-9); near(a.pmax, E.L13.pmax, 1e-9);
    expect(a.E).toBeCloseTo(1.9698, 4); expect(a.deltaDeg).toBeCloseTo(29.17, 2); expect(a.pmax).toBeCloseTo(1.6415, 4);
    near(nightExcitationFor(-0.2), E.L13.night.E, 1e-9);
    const n = nightAt(nightExcitationFor(-0.2))!; near(n.q, -0.2, 1e-9); near(n.deltaDeg, E.L13.night.deltaDeg, 1e-9);
    for (const [k, e] of [['1.00', 1], ['1.04', 1.04], ['1.05', 1.05], ['1.20', 1.2]] as const) { const o = nightAt(e)!; near(o.q, E.L13.atE[k].q, 1e-9); near(o.deltaDeg, E.L13.atE[k].deltaDeg, 1e-9); }
    expect(nightAt(0.5)).toBeNull();
  });
});

describe.each(REGIONS)('chapter 4 lesson gates in region %s', (region) => {
  const play = (id: string, kind: 'naive' | 'lesson' | 'reference') => { const spec = specOf(id)!; return runDesign(spec, region, kind === 'naive' ? spec.naive.actions : spec[kind]); };
  it('L10: all on phase a burns the neutral (100 % of the phase current, 152 A on a 150 A wire at 19:00); the kVA balance passes; the fewest moves earns three stars at 7 crew visits', () => {
    const n = play('L10', 'naive');
    expect(n.status).toBe('lost'); expect(n.state.block.verdictKey).toBe('level.lost.b4.neutralBurn'); expect(n.track.neutralPct).toBeCloseTo(100, 6);
    expect(n.reason).toMatch(/neutral carried 15\d\.\d A, but a 54.6 mm² neutral is rated 150 A/);
    const l = play('L10', 'lesson'), r = play('L10', 'reference');
    expect(l.status).toBe('won'); expect(l.track.neutralPct).toBeLessThan(10); expect(r.status).toBe('won'); expect(r.stars).toBe(3); expect(r.capex).toBeLessThan(l.capex);
    expect(r.track.vDevPct).toBeLessThanOrEqual(5); expect(r.track.lossPct).toBeLessThanOrEqual(3);
  });
  it('L10: counting houses is not balancing (round robin leaves 38 % in the neutral and loses); a thicker neutral does not rescue an unbalanced street', () => {
    const spec = specOf('L10')!;
    const rr = runDesign(spec, region, ASSIGN.rr.split('').flatMap((p, i) => (p === 'a' ? [] : [{ name: 'assignPhase', args: [`H${i + 1}`, p] }])));
    expect(rr.status).toBe('lost'); expect(rr.track.neutralPct).toBeGreaterThan(37);
    const fat = runDesign(spec, region, [{ name: 'setNeutral', args: [95] }], { frozen: null });
    expect(fat.status).toBe('lost'); expect(fat.state.block.verdictKey).toBe('level.lost.b4.neutral');
  });
  it('L10: the first block of the peak burns a 54.6 mm2 neutral through when all the street is on phase a (the report says what the star point does)', () => {
    const spec = specOf('L10')!;
    const o = runDesign(spec, region, []);   // the street starts at the peak: 0.95 of 160 A on a 150 A wire
    expect(o.status).toBe('lost'); expect(o.state.block.verdictKey).toBe('level.lost.b4.neutralBurn'); expect(o.ticks).toBe(1);
    expect(o.reason).toMatch(/burnt through.*rise to 4\d\d V instead of 230 V/);
  });
  it('L11: the right bank with a direct-on-line pump dips the bus 11.5 % and the other motors trip; star-delta passes with three stars; a 250 V can in delta bursts; the idle estate fails on its power factor', () => {
    const n = play('L11', 'naive');
    expect(n.status).toBe('lost'); expect(n.state.block.verdictKey).toBe('level.lost.b4.dip'); expect(n.track.dipPct).toBeCloseTo(E.L11.banks.Y250x72.dol.dipPct, 6);
    const r = play('L11', 'reference'), l = play('L11', 'lesson');
    expect(r.status).toBe('won'); expect(r.stars).toBe(3); expect(r.track.dipPct).toBeLessThanOrEqual(6); expect(l.status).toBe('won'); expect(l.track.dipPct).toBeGreaterThan(6); expect(l.stars).toBeLessThan(3);
    const spec = specOf('L11')!;
    const burst = runDesign(spec, region, [{ name: 'setBank', args: [100, 24, 'D', 250] }, { name: 'setStarter', args: ['yd'] }]);
    expect(burst.state.block.verdictKey).toBe('level.lost.b4.canBurst'); expect(burst.ticks).toBe(1); expect(burst.reason).toMatch(/400 V.*burst/);
    expect(runDesign(spec, region, []).status).toBe('lost');   // idle: no bank, direct-on-line
    const small = runDesign(spec, region, [{ name: 'setBank', args: [100, 55, 'Y', 250] }, { name: 'setStarter', args: ['yd'] }]);
    expect(small.state.block.verdictKey).toBe('level.lost.b4.pfLow'); expect(small.reason).toMatch(/power factor at the estate bus was 0\.9\d/);
    const over = runDesign(spec, region, [{ name: 'setBank', args: [100, 110, 'Y', 250] }, { name: 'setStarter', args: ['yd'] }]);
    expect(over.state.block.verdictKey).toBe('level.lost.b4.pfLead');
  });
  it('L12: the night set-point loses the plant at 19:30 (P_max after the trip 2.01 pu against 2.0 pu); raising excitation passes; the reference keeps the swing under 70 degrees', () => {
    const n = play('L12', 'naive');
    expect(n.status).toBe('lost'); expect(n.state.block.verdictKey).toBe('level.lost.b4.outOfStep'); expect(n.ticks).toBe(6); expect(n.track.outOfStep).toBe(1);
    expect(n.reason).toMatch(/19:30.*slipped a pole/);
    const r = play('L12', 'reference'), l = play('L12', 'lesson');
    expect(r.status).toBe('won'); expect(r.stars).toBe(3); expect(r.track.peakDeltaDeg).toBeLessThanOrEqual(70); expect(l.status).toBe('won'); expect(l.stars).toBeLessThan(3);
    const spec = specOf('L12')!, free = runDesign(spec, region, [{ name: 'setAvrRef', args: [1] }]);
    expect(free.status).toBe('won'); expect(free.track.peakDeltaDeg).toBeGreaterThan(70);   // excitation alone passes but is not three stars
    const avr = runDesign(spec, region, [{ name: 'setAvrRef', args: [1.05] }]);
    expect(avr.status).toBe('won'); expect(avr.stars).toBe(1);   // 1.1: the $0 set-point alone (73 degree swing) earns the pass lamp only; the spend lamp also needs the swing under 70
    const lowAvr = runDesign(spec, region, [{ name: 'setAvrRef', args: [0.95] }]);
    expect(lowAvr.status).toBe('lost');   // 0.95 pu still loses: the first swing reaches 112.3 degrees against 112.28
    const third = runDesign(spec, region, [{ name: 'addCircuit', args: [true] }], { frozen: null });
    expect(third.status).toBe('won');   // a third circuit saves the plant at any set-point, for 411 M
  });
  it('L13: adding the lengths (2.2 pu) fails the exam; 3 % off with the night task done is two stars; within 1 % and 1 % is three; no night task is one star', () => {
    const n = play('L13', 'naive');
    expect(n.status).toBe('lost'); expect(n.state.block.verdictKey).toBe('level.lost.b4.examPredict'); expect(n.reason).toMatch(/E = \|V \+ jX_s I\| = 1\.97 pu/);
    const l = play('L13', 'lesson'), r = play('L13', 'reference');
    expect(l.stars).toBe(2); expect(r.stars).toBe(3);
    const spec = specOf('L13')!;
    const noTask = runDesign(spec, region, [...spec.reference.filter((a) => a.name === 'predict')]);
    expect(noTask.status).toBe('won'); expect(noTask.stars).toBe(1);
    const e = fresh('L13', region);
    for (const a of spec.reference) act(e, a.name, ...(a.args as unknown[]));
    act(e, 'tick', 1);
    const p = e.state.metrics.predictions.find((x) => x.id === 'L13.E')!;
    expect(p.actual).toBeCloseTo(1.9698, 4);
  });
});

describe('the engine teaches: part gate, argument checks, event order', () => {
  const refuse = (e: Env<GridState>, name: string, args: unknown[], key: string): void => {
    const r = e.engine.act(name, args);
    expect(r.ok, `${name} ${key}`).toBe(false); expect(r.key).toBe(key); expect(en[key], key).toBeTruthy(); expect(r.message).not.toMatch(/\{/);
  };
  it('L10', () => {
    const e = fresh('L10');
    refuse(e, 'assignPhase', ['H99', 'a'], 'ch4.house'); refuse(e, 'assignPhase', ['H1', 'x'], 'ch4.phase'); refuse(e, 'setNeutral', [40], 'ch4.neutralSize');
    refuse(e, 'setBank', [100, 10, 'Y', 250], 'level.action.notAllowed'); expect(act(e, 'assignPhase', 'H1', 'b').ok).toBe(true);
    expect(act(e, 'setNeutral', 70).ok).toBe(true); expect(e.state.budget.spent).toBeCloseTo(85 + (3.9 - 3.0) * 420 + 300, 6);
    expect(q(e, 'ch4Status').moved).toBe(1);
  });
  it('L11', () => {
    const e = fresh('L11');
    refuse(e, 'setBank', [30, 10, 'Y', 250], 'ch4.unit'); refuse(e, 'setBank', [100, 999, 'Y', 250], 'ch4.count'); refuse(e, 'setBank', [100, 10, 'X', 250], 'ch4.conn'); refuse(e, 'setBank', [100, 10, 'Y', 300], 'ch4.rated');
    refuse(e, 'setStarter', ['rocket'], 'ch4.starter'); refuse(e, 'assignPhase', ['H1', 'a'], 'level.action.notAllowed');
    expect(act(e, 'setBank', 100, 72, 'Y', 250).ok).toBe(true); expect(q(e, 'ch4Status').bank.qKvar).toBeCloseTo(361.9, 1);
  });
  it('L12: the build is frozen once the circuit has tripped; bad set-points are refused', () => {
    const e = fresh('L12');
    refuse(e, 'setAvrRef', [1.2], 'ch4.vref'); refuse(e, 'setSeriesComp', [20], 'ch4.series'); refuse(e, 'addCircuit', ['yes'], 'ch4.circuitArg'); refuse(e, 'setRedispatch', [25], 'ch4.redispatch');
    expect(act(e, 'setAvrRef', 1.05).ok).toBe(true);
    for (let i = 0; i < 8; i++) e.step(TICK);
    expect(e.state.ch4!.l12!.fired).toBe(true); refuse(e, 'setAvrRef', [1], 'ch4.afterEvent');
  });
  it('L13', () => {
    const e = fresh('L13');
    refuse(e, 'setExcitation', [9], 'ch4.excitation'); refuse(e, 'setAvrRef', [1], 'level.action.notAllowed'); expect(act(e, 'setExcitation', 1.0469).ok).toBe(true);
    const s = q(e, 'ch4Status'); expect(s.answers).toBeNull();   // the answers are not given away before the exam is marked
    expect(s.night.q).toBeCloseTo(-0.2, 3);
  });
});

describe('the report and determinism', () => {
  it('levelInfo carries the player\'s numbers (lesson) and, after a loss, what to try', () => {
    const e = fresh('L10'); for (const a of specOf('L10')!.lesson) act(e, a.name, ...(a.args as unknown[]));
    const info = q(e, 'levelInfo');
    expect(info.lesson).toMatch(/phase a carried \d+(\.\d)? A, phase b \d+(\.\d)? A and phase c \d+(\.\d)? A/); expect(info.lesson).toMatch(/phasor sum/); expect(info.kind).toBe('bench');
    const lost = fresh('L10'); for (let i = 0; i < 6; i++) lost.step(TICK);
    expect(lost.state.status).toBe('lost'); expect(q(lost, 'levelInfo').tryHint).toMatch(/Move houses off phase a/);
    const l12 = fresh('L12'); for (let i = 0; i < 8; i++) l12.step(TICK);
    expect(q(l12, 'levelInfo').tryHint).toMatch(/excitation/); expect(q(l12, 'levelInfo').lesson).toMatch(/E′ = 0\.96 pu/);
    const l11 = fresh('L11'); act(l11, 'setBank', 100, 72, 'Y', 250); expect(q(l11, 'levelInfo').lesson).toMatch(/345\.8 kVAr.*6879 µF per phase wired in star or 2293 µF per phase in delta/);
    const l13 = fresh('L13'); expect(q(l13, 'levelInfo').lesson).toMatch(/= 1\.97 pu at δ = 29\.2°/);
    const l11n = fresh('L11'); const ln = String(q(l11n, 'levelInfo').lesson);   // 11-28b playtest: with no bank it printed '(0 µF per phase, -, cans at 0 V of a rating of 0 V)'
    expect(ln).toMatch(/No capacitor bank stood on the bus/); expect(ln).not.toMatch(/0 V of a rating of 0 V|, -,/); expect(ln).toMatch(/345\.8 kVAr/);
  });
  it('the same design twice gives the same state (the swing, the street and the exam are deterministic)', () => {
    for (const id of ['L10', 'L11', 'L12', 'L13']) {
      const spec = specOf(id)!, a = runDesign(spec, 'global', spec.reference), b = runDesign(spec, 'global', spec.reference);
      expect(hashOf(a.state), id).toBe(hashOf(b.state));
    }
  });
  it('free play and the other chapters never see the chapter: no ch4 state', () => {
    const e = new Env(GAME); e.reset({ seed: 1 }); expect((e.state as GridState).ch4).toBeUndefined();
    expect(q(e as Env<GridState>, 'ch4Status').active).toBe(false);
  });
});
