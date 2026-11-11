// Chapter 5 (Load Flow & Voltage), engine side: each level's key numbers against the independent oracle (tools/oracles/ch5_oracles.py -> ch5_expected.json), the lesson gates
// beyond the generic ones in level.test.ts (hunting, Ferranti, loop flow, the nose, the exam bridge), the new rules, determinism, the levelInfo lesson.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import { specOf } from './index';
import { runDesign } from './run';
import { examTruth, EXAM_IDS, n1Table } from '../sim/ch5';
import { expectOracle } from '../oracles/expected';
import exp from '../../tools/oracles/ch5_expected.json';
import type { GridState } from '../types';
import { en } from '../locales/en';

const E = exp as any;
const near = (a: number, b: number, tol: number, what = ''): void => { expect(Math.abs(a - b), `${what} ${a} vs ${b}`).toBeLessThanOrEqual(tol); };
const fresh = (id: string, region = 'global', acts: { name: string; args: unknown[] }[] = []): Env<GridState> => {
  const e = new Env(GAME); e.reset({ seed: 1, level: id, region });
  for (const a of acts) expect(e.step(a).info.ok, a.name).toBe(true);
  return e as Env<GridState>;
};
const toBlock = (e: Env<GridState>, block: number): void => { e.state.rules.vWatch = null; e.state.rules.maxLoading = null; e.engine.act('tick', [block - e.state.clock.block]); };
const volt = (e: Env<GridState>, id: string): number => e.state.solution!.buses.find((b) => b.id === id)!.vPu;
const opt = (id: string, site: string, o: string) => specOf(id)!.sites.find((x) => x.id === site)!.options.find((x) => x.id === o)!.actions;

describe('L14 Per Unit, Please', () => {
  it('oracle: the radial chain at 20:00 with the taps at 0 and at +3 / +4 (V at 132, 33 and the three 11 kV towns)', () => {
    for (const [key, up, down] of [['tap0', 0, 0], ['tap3_4', 3, 4]] as const) {
      const acts = [...(up ? [{ name: 'setTap', args: ['T2', up] }] : []), ...(down ? ['T3', 'T4', 'T5'].map((id) => ({ name: 'setTap', args: [id, down] })) : [])];
      const e = fresh('L14', 'global', acts); toBlock(e, 80);
      const o = E.L14[key];
      near(volt(e, 'B2'), o.V132, 2e-4, key); near(volt(e, 'B3'), o.V33, 2e-4, key);
      ['B4', 'B5', 'B6'].forEach((id, i) => { near(volt(e, id), o.V11[i], 2e-4, key + id); near(volt(e, id) * 11, o.kV11[i], 3e-3, 'kV ' + id); });
    }
  });
  it('tap direction: +n raises the low-voltage side (G-17 convention), a negative tap lowers it', () => {
    const up = fresh('L14', 'global', [{ name: 'setTap', args: ['T3', 4] }]), dn = fresh('L14', 'global', [{ name: 'setTap', args: ['T3', -4] }]), z = fresh('L14');
    for (const e of [up, dn, z]) toBlock(e, 20);
    expect(volt(up, 'B4')).toBeGreaterThan(volt(z, 'B4') + 0.04); expect(volt(dn, 'B4')).toBeLessThan(volt(z, 'B4') - 0.04);
  });
  it('hunting: the same two automatic changers cost far more operations with equal delays and a narrow dead-band than staggered, and cost money to automate', () => {
    const spec = specOf('L14')!;
    const hunt = runDesign(spec, 'global', [...opt('L14', 'substation', 'auto-d1'), ...opt('L14', 'towns', 'auto-d1-narrow')]);
    const calm = runDesign(spec, 'global', [...opt('L14', 'substation', 'auto-d1'), ...opt('L14', 'towns', 'auto-d4')]);
    expect(hunt.track.tapOps).toBeGreaterThan(3 * calm.track.tapOps!); expect(calm.track.tapOps).toBeLessThanOrEqual(30);
    expect(calm.capex).toBeCloseTo(0.05 * (250000 * 0 + 252500) + 3 * 0.05 * 600000, 0);   // 5 % of the 132/33 price (5,050 US$/MVA x 50) plus three 33/11 kV at 0.6 M
  });
  it('no fixed tap holds the day: upstream +3 alone browns out, the lesson passes, one stage alone is not enough', () => {
    const spec = specOf('L14')!;
    expect(runDesign(spec, 'global', spec.naive.actions).failKind).toBe('brownout');
    expect(runDesign(spec, 'global', [...opt('L14', 'substation', 'auto-d1')]).status).toBe('lost');
    expect(runDesign(spec, 'global', spec.lesson).status).toBe('won');
  });
});

describe('L15 The Long Line', () => {
  it('oracle: |A|, SIL, charging, the Ferranti rise, and the receiving voltage at 03:00 and at 20:00 with and without compensation', () => {
    const line = E.L15.line; near(line.absA, 0.9321, 1e-4); near(line.SIL_MW, 516.7, 0.1);
    const e0 = fresh('L15'); toBlock(e0, 12); near(volt(e0, 'B2'), E.L15.cases.night_none, 1e-4);
    const e1 = fresh('L15', 'global', [{ name: 'placeShunt', args: ['B2', 'reactor-400-80', 1] }, { name: 'setShuntSteps', args: ['C1', 1] }]); toBlock(e1, 12); near(volt(e1, 'B2'), E.L15.cases.night_reactor80, 1e-4);
    const e2 = fresh('L15', 'global', [{ name: 'placeShunt', args: ['B2', 'cap-400-50', 3] }, { name: 'setShuntSteps', args: ['C1', 3] }]); toBlock(e2, 80); near(volt(e2, 'B2'), E.L15.cases.peak_cap150, 1e-4);
    const e3 = fresh('L15'); toBlock(e3, 80); near(volt(e3, 'B2'), E.L15.cases.peak_none, 1e-3);
  });
  it('the naive build overvolts at night by more than the 5 % band and the reactor reads as a reactor (absorbs Q), not a capacitor', () => {
    const spec = specOf('L15')!, o = runDesign(spec, 'global', []);
    expect(o.failKind).toBe('overvoltage'); expect(o.track.vMaxPu!).toBeGreaterThan(1.07);
    const e = fresh('L15', 'global', [{ name: 'placeShunt', args: ['B2', 'reactor-400-80', 1] }]); expect(e.state.shunts[0]!.mvarStep).toBe(-80);
  });
  it('an SVC does the whole day with no switching operation; the lesson (reactor + capacitors) takes switching and still passes', () => {
    const spec = specOf('L15')!, ref = runDesign(spec, 'global', spec.reference), les = runDesign(spec, 'global', spec.lesson);
    expect(ref.stars).toBe(3); expect(ref.track.switchOps).toBe(0); expect(les.stars).toBeLessThan(3); expect(les.track.switchOps!).toBeGreaterThan(2);
  });
});

describe('L16 Loop Flow', () => {
  it('oracle: loading of the seven lines at 20:00 as built and with the Eastgate plant committed', () => {
    for (const [acts, key] of [[[], 'asBuiltLoading'], [[{ name: 'commit', args: ['U2', true, 0] }], 'commitLoading']] as [{ name: string; args: unknown[] }[], string][]) {
      const e = fresh('L16', 'global', [...acts]), rate0 = e.state.branches.map((b) => b.ratingMVA);
      e.state.branches.forEach((b) => { b.ratingMVA = 1e5; });   // look at the flows without the thermal timers tripping the overloaded chord on the way to 20:00
      toBlock(e, 80);
      const want = E.L16[key] as number[];
      e.state.branches.forEach((b, i) => { const q = e.engine.q('branchInfo', [b.id]) as { pFromMW: number; qFromMVAr: number }; near(Math.hypot(q.pFromMW, q.qFromMVAr) / rate0[i]!, want[i]!, 1.5e-2, `${key} ${b.id}`); });
    }
    near(E.L16.ratio, 7, 1e-9); expect(E.L16.dcFlowMW[6]).toBeGreaterThan(200);   // the DC approximation also puts the chord far over its 210 MVA
  });
  it('three styles pass, a new line in the wrong place does not, and only a secure design earns the third star', () => {
    const spec = specOf('L16')!;
    const styles: { name: string; args: unknown[] }[][] = [spec.lesson as never, [{ name: 'commit', args: ['U2', true, 0] }], [{ name: 'switchBranch', args: ['T3', false] }]];
    for (const a of styles) expect(runDesign(spec, 'global', a).status, JSON.stringify(a)).toBe('won');
    expect(runDesign(spec, 'global', spec.naive.actions).status).toBe('lost');
    expect(runDesign(spec, 'global', spec.lesson).track.n1Max!).toBeGreaterThan(1);       // the reconductored chord alone is not N-1 secure
    expect(runDesign(spec, 'global', spec.reference).track.n1Max!).toBeLessThanOrEqual(1);
  });
  it('N-1 table: the chord line is the outage that matters, and islanding a load reports 9.99', () => {
    const e = fresh('L16'); toBlock(e, 70); const t = n1Table(e.state);
    expect(Object.keys(t).length).toBe(7); expect(Math.max(...Object.values(t))).toBeGreaterThan(1);
  });
});

describe('L17 Nose of the Curve', () => {
  it('oracle: the margin to the nose after the trip for six builds equals the independent closed form (0.05 points)', () => {
    const spec = specOf('L17')!, ids: [string, string][] = [['none', 'none'], ['caps100', 'caps100'], ['caps50+statcom100', 'caps50+statcom100'], ['caps100+statcom100', 'caps100+statcom100'], ['svc100', 'svc100'], ['caps100+svc100', 'caps100+svc100']];
    for (const [o, key] of ids) {
      const acts = spec.sites[0]!.options.find((x) => x.id === o)!.actions;
      const r = runDesign(spec, 'global', acts, { frozen: null });
      near(r.track.marginMinPct!, E.L17[key].marginPct, 0.05, key);
    }
  });
  it('an SVC at its limit is a capacitor (same margin as the 100 Mvar bank); a STATCOM beside a bank wins; the engine collapses past the nose', () => {
    const spec = specOf('L17')!, m = (id: string): number => runDesign(spec, 'global', spec.sites[0]!.options.find((x) => x.id === id)!.actions, { frozen: null }).track.marginMinPct!;
    near(m('svc100'), m('caps100'), 1e-6); expect(m('caps100+statcom100')).toBeGreaterThan(12);
    const o = runDesign(spec, 'global', spec.naive.actions); expect(o.failKind).toBe('collapse'); expect(o.state.metrics.ensMWh).toBeGreaterThan(0);
  });
  it('the gate refuses more than two bank steps (the level\'s cap on capacitors)', () => {
    const e = fresh('L17'); expect(e.engine.act('placeShunt', ['B3', 'cap-220-50', 4]).key).toBe('level.part.notAllowed'); expect(e.engine.act('placeShunt', ['B3', 'cap-220-50']).ok).toBe(false);
    expect(e.engine.act('placeShunt', ['B3', 'cap-220-50', 2]).ok).toBe(true);
  });
});

describe('L18 Exam Bridge', () => {
  it('the engine\'s answers to the three predictions are PS-14, PS-15 and PS-16', () => {
    const t = examTruth();
    expectOracle('PS-15', 'V2_pu', t[EXAM_IDS.v2]!); expectOracle('PS-16', 'slackP_MW', t[EXAM_IDS.pslack]!);
    near(Math.hypot(1.01331, -0.0310), t[EXAM_IDS.gs1]!, 1e-4);
  });
  it('oracle: the task case V2 and the PV bus\'s Q limit for the capacitor, set-point and re-dispatch builds', () => {
    const cases: [string, unknown[]][] = [['cap0', []], ['cap0_v3_1.08', [{ name: 'setVSet', args: ['B3', 1.08] }]], ['cap100', opt('L18', 'capacitor', 'cap100')], ['cap100_v3_1.08', [...opt('L18', 'capacitor', 'cap100'), { name: 'setVSet', args: ['B3', 1.08] }]]];
    for (const [key, acts] of cases) {
      const e = fresh('L18', 'global', acts as never[]); toBlock(e, 82);
      near(volt(e, 'B2'), E.L18[key].V2, 2e-4, key); near(e.state.units[1]!.Q, E.L18[key].Q3, 0.5, key + ' Q3');
    }
  });
  it('predictions: graded against the textbook truth at 0.5 %, never a gate; setVSet refuses what is not a generator bus or out of range', () => {
    const spec = specOf('L18')!, r = runDesign(spec, 'global', spec.reference);
    expect(r.state.metrics.predictions.every((p) => p.actual !== null)).toBe(true); expect(r.track.predHits).toBe(3); expect(r.stars).toBe(3);
    const none = runDesign(spec, 'global', spec.lesson); expect(none.status).toBe('won'); expect(none.stars).toBeLessThan(3);
    const e = fresh('L18'); expect(e.engine.act('setVSet', ['B2', 1.05]).key).toBe('act.vset.notGen'); expect(e.engine.act('setVSet', ['B3', 1.5]).key).toBe('act.vset.range'); expect(e.engine.act('setVSet', ['B3', 1.07]).ok).toBe(true);
  });
  it('the set-point alone cannot do it: the unit runs out of reactive range (V2 identical at 1.05 and 1.08)', () => {
    const a = fresh('L18'), b = fresh('L18', 'global', [{ name: 'setVSet', args: ['B3', 1.08] }]); toBlock(a, 82); toBlock(b, 82);
    near(volt(a, 'B2'), volt(b, 'B2'), 1e-9); expect(volt(a, 'B2')).toBeLessThan(1);
  });
});

describe('chapter 5 rules, report and determinism', () => {
  it('every level\'s incident report and shift report carry the player\'s numbers (no unfilled braces), in both packs', () => {
    for (const id of ['L14', 'L15', 'L16', 'L17', 'L18']) for (const region of ['global', 'in']) {
      const spec = specOf(id)!;
      for (const acts of [spec.naive.actions, spec.lesson]) {
        const o = runDesign(spec, region, acts), info = (): { lesson: string; tryHint: string } => { const e = new Env(GAME); e.reset({ seed: 1, level: id, region }); e.engine.setState(o.state); return e.engine.q('levelInfo') as never; };
        const li = info(); expect(li.lesson, id).not.toMatch(/\{/); expect(li.tryHint, id).not.toMatch(/\{/);
        if (o.status === 'won') expect(li.lesson.length, id + ' lesson').toBeGreaterThan(40); else expect(li.tryHint.length, id + ' try').toBeGreaterThan(40);
      }
    }
  });
  it('lost verdicts have their own strings, with the time and the number', () => {
    for (const [id, key, re] of [['L14', 'level.lost.voltageLow', /fell to/], ['L15', 'level.lost.voltageHigh', /rose to/], ['L16', 'level.lost.loading', /% of its rating/], ['L17', 'level.lost.collapse', /nose/]] as const) {
      const spec = specOf(id)!, o = runDesign(spec, 'global', spec.naive.actions);
      expect(o.state.block.verdictKey, id).toBe(key); expect(o.reason).toMatch(re); expect(o.reason).not.toMatch(/\{/); expect(en[key]).toBeTruthy();
    }
  });
  it('the same actions give the same state hash for every level', () => {
    for (const id of ['L14', 'L15', 'L16', 'L17', 'L18']) {
      const run = (): string => { const e = fresh(id); for (const a of specOf(id)!.lesson) e.step(a); for (let i = 0; i < 12; i++) e.step(TICK); return hashOf(e.state); };
      expect(run(), id).toBe(run());
    }
  });
  it('chapter 5 tracks nothing in other levels (their states are as before)', () => {
    const e = fresh('L07'); for (let i = 0; i < 4; i++) e.step(TICK);
    expect(Object.keys(e.state.metrics.track).some((k) => /^(vMinPu|n1Max|tapBase|marginPct)$/.test(k))).toBe(false);
  });
});

describe('ch5Panel query', () => {
  it('L17: the P-V curve rises to the nose, falls in voltage, and the operating point sits under the nose by the margin; L18: GS converges to Newton', () => {
    const spec = specOf('L17')!, e = fresh('L17', 'global', spec.reference as never); e.state.rules.collapseLoses = false; e.engine.act('tick', [4]);
    const q = e.engine.q('ch5Panel') as any;
    expect(q.active).toBe(true); expect(q.pv.points.length).toBeGreaterThan(10);
    const pts = q.pv.points as { pMW: number; v: number }[];
    for (let i = 1; i < pts.length; i++) { expect(pts[i]!.pMW).toBeGreaterThan(pts[i - 1]!.pMW); expect(pts[i]!.v).toBeLessThan(pts[i - 1]!.v + 1e-9); }
    near(q.pv.noseMW, 0.01 * Math.round(100 * q.pv.loadMW * (1 + q.pv.marginPct / 100)), 0.5);
    const g = (fresh('L18').engine.q('ch5Panel') as any).gs;
    expect(g.nrIterations).toBeLessThanOrEqual(4); expect(g.gsIterations).toBeGreaterThan(g.nrIterations * 3);
    expect(g.sweeps[1].v2).toBeCloseTo(examTruth()[EXAM_IDS.gs1]!, 5);
    expect(g.sweeps[16].mismatch).toBeLessThan(g.sweeps[2].mismatch);
    expect((fresh('L07').engine.q('ch5Panel') as any).active).toBe(false);
  });
});

describe('chapter 5 fix wave: reactor dwell, thin margins, new-line length', () => {
  it('an automatic reactor rests after each operation: operations are at least REACTOR_DWELL + 1 blocks apart, and it switches IN on high voltage', async () => {
    const { REACTOR_DWELL } = await import('../sim/tick');
    const e = fresh('L15', 'global', [{ name: 'placeShunt', args: ['B2', 'reactor-400-80', 3] }, { name: 'setShuntSteps', args: ['C1', 0] }, { name: 'setShuntAuto', args: ['C1', 0.975, 1.005, 1] }]);
    e.state.rules.vWatch = null;
    const ops: number[] = []; let last = e.state.shunts[0]!.on, first = -1;
    for (let i = 0; i < 90; i++) { e.step(TICK); const on = e.state.shunts[0]!.on; if (on !== last) { ops.push(i); if (first < 0) first = on - last; last = on; } }
    expect(first, 'the first move is IN (more reactors) because the night voltage is high').toBeGreaterThan(0);
    expect(ops.length).toBeGreaterThan(1);
    for (let k = 1; k < ops.length; k++) expect(ops[k]! - ops[k - 1]!, `ops ${ops}`).toBeGreaterThanOrEqual(REACTOR_DWELL + 1);
  });
  it('L17: a margin that is positive but thin is reported as thin, with the number and the floor, and a negative one as past the nose', () => {
    const spec = specOf('L17')!, run = (id: string) => runDesign(spec, 'global', spec.sites[0]!.options.find((x) => x.id === id)!.actions, { frozen: null });
    const thin = run('statcom100'); expect(thin.status).toBe('lost'); expect(thin.state.block.verdictKey).toBe('level.lost.collapseThin');
    expect(thin.reason).toMatch(/only 3\.6 %.*under the 5 %/); expect(thin.failKind).toBe('collapse');
    const gone = run('caps100'); expect(gone.state.block.verdictKey).toBe('level.lost.collapse'); expect(gone.reason).toMatch(/was -2\.4 %/);
  });
  it('L16: a line the player strings takes its length from the map distance of its buses (10 km tiles): B2-B5 about 63 km, a parallel chord about 32 km', () => {
    const e = fresh('L16'); e.engine.act('stringLine', ['B1', 'B4', 'l220-zebra-htls', 1]);
    const b = e.state.branches[e.state.branches.length - 1]!; near(b.lengthKm, 31.6, 1, 'chord km'); expect(b.x).toBeGreaterThan(0.02);
  });
});
