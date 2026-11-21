// Chapter 7 (L23-L27): engine vs the independent Python oracles (tools/oracles/ch7_expected.json), lesson gates, determinism.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import { specOf } from './index';
import { runDesign } from './run';
import { studyL23, grownBoard } from '../sim/ch7/board';
import { studyL24 } from '../sim/ch7/feeder';
import { critical, studyL25 } from '../sim/ch7/swing';
import { studyL26, hydroSchedule } from '../sim/ch7/merit';
import { examAnswers } from '../sim/ch7/exam';
import { SC } from '../sim/ch7/data';
import { botPopulation } from './population';
import exp from '../../tools/oracles/ch7_expected.json';
import type { GridState } from '../types';

const E = exp as any;
const near = (a: number, b: number, rel = 1e-6): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(Math.abs(b), 1e-9)); };

describe('L23 oracle', () => {
  it('all 36 designs: fault kA, pass, cost, N-1', () => {
    for (const [k, v] of Object.entries<any>(E.l23.designs)) {
      const [r, u, cp, re] = k.split('/');
      const st = studyL23({ rating: SC.l23.breakers.ratingsKA[+r!]!, uk: SC.l23.xfmr.ukPct[+u!]!, coupler: cp as 'open', reactor: [0, 0.1, 0.2][+re!]! });
      near(st.fault.threePhKA, v.faultKA, 1e-6); expect(st.ok).toBe(v.ok); expect(st.capexUSD).toBe(v.cost); expect(st.n1Secure).toBe(v.n1Secure); near(st.n1VPu, v.n1VPu, 1e-6);
    }
  });
});
describe('L24 oracle', () => {
  it('fault currents and the case table', () => {
    const mk = (c: any, p: number, t: number[]) => ({ relays: t.map((tms) => ({ curve: c, pct: p, tms })) });
    for (const [k, v] of Object.entries<any>(E.l24.cases)) {
      const cfg: any = { naive: ['SI', 100, [0.15, 0.15, 0.15, 0.15]], lesson: ['SI', 100, [0.35, 0.25, 0.15, 0.05]], low: ['SI', 75, [0.35, 0.25, 0.15, 0.05]], slowR1: ['SI', 100, [0.75, 0.25, 0.15, 0.05]] }[k];
      const st = studyL24(mk(cfg[0], cfg[1], cfg[2]));
      st.faults.forEach((f, i) => near(f.amps, v.amps[i], 1e-6));
      expect(st.kind === null).toBe(v.ok);
      if (v.total !== null) near(st.totalS, v.total, 1e-6);
    }
  });
});
describe('L25 oracle', () => {
  it('t_cr, delta_cr and every design', () => {
    const c = critical();
    near(c.tCrS, E.l25.tCrS, 1e-6); near(c.deltaCrDeg, E.l25.deltaCrDeg, 1e-6);
    for (const [k, v] of Object.entries<any>(E.l25.designs)) {
      const [relay, cy, rc] = k.split('/');
      const st = studyL25({ relay: relay!, cycles: +cy!, reclose: rc === '1' });
      near(st.clearS, v.tClearS, 1e-9); expect(st.stable, k).toBe(v.stable); near(st.marginMs, v.marginMs, 1e-6); expect(st.capexUSD).toBe(v.cost);
    }
  });
});
describe('L26 oracle', () => {
  it('water value and the 1296 designs', () => {
    near(hydroSchedule().nu, E.l26.nu, 1e-4);
    const names = Object.keys(SC.l26.windows);
    for (const [k, v] of Object.entries<any>(E.l26.designs)) {
      const [mode, combo] = k.split('/');
      const windows = Object.fromEntries(names.map((n, i) => [n, SC.l26.windows[n]![+combo!.split('.')[i]!]!]));
      const st = studyL26({ mode: mode as 'merit', windows: windows as never });
      expect(st.ok, k).toBe(v.ok); near(st.costUSD, v.cost, 1e-4);
    }
    near(E.l26.optCost, SC.l26.optCost!, 1e-9);
  });
});
describe('L27 oracle', () => {
  it('exam answers = oracles; grown board duty', () => {
    const a = examAnswers(), o = E.l27;
    near(a.ps17.kA, o.ps17.kA); near(a.ps18.kA, o.ps18.kA); near(a.ps20.lambda, o.ps20.lambda, 1e-5); near(a.ps21.lambda, o.ps21.lambda, 1e-5); near(a.ps21.cost, o.ps21.cost, 1e-6);
    near(a.ps22.lambda, o.ps22.lambda, 1e-4); near(a.ps24.tCrS, o.ps24.tCrS, 1e-6); near(a.ps24.deltaCrDeg, o.ps24.deltaCrDeg, 1e-6);
    const g = grownBoard(); near(g.threePhKA, o.board.threePhKA, 1e-6); near(g.slgKA, o.board.slgKA, 1e-6);
  });
});

const REGIONS = ['global', 'in'];
describe.each(['L23', 'L24', 'L25', 'L26', 'L27'])('%s lesson gate', (id) => {
  const spec = specOf(id)!;
  it.each(REGIONS)('naive fails, lesson passes, reference 3 stars (%s)', (region) => {
    const n = runDesign(spec, region, spec.naive.actions), l = runDesign(spec, region, spec.lesson), r = runDesign(spec, region, spec.reference);
    expect(n.status).toBe('lost'); expect(n.failKind).toBe(spec.naive.failKind); expect(n.rejected).toBeNull();
    expect(l.status, l.reason).toBe('won'); expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3);
  });
  it('is deterministic', () => {
    const run = (): string => { const e = new Env(GAME); e.reset({ seed: 1, level: id }); for (const a of spec.reference) e.step(a); e.step(TICK); return hashOf(e.state); };
    expect(run()).toBe(run());
  });
  it('lesson text carries the player\'s numbers after the run', () => {
    const e = new Env(GAME); e.reset({ seed: 1, level: id }); for (const a of spec.lesson) e.step(a); e.step(TICK);
    const li = e.engine.q('levelInfo') as { lesson: string }; expect(li.lesson.length).toBeGreaterThan(40); expect(li.lesson).not.toMatch(/\{/);
  });
});
describe('L23 lesson recomputes', () => {
  it('I_f = ipu x kA/pu', () => {
    const e = new Env(GAME); e.reset({ seed: 1, level: 'L23' }); e.step({ name: 'setBreakerRating', args: [31.5] }); e.step(TICK);
    const t = (e.engine.q('levelInfo') as { lesson: string }).lesson, m = t.match(/= ([\d.]+) pu, and one pu is ([\d.]+) kA at 33 kV: ([\d.]+) kA/)!;
    expect(Math.abs(+m[1]! * +m[2]! - +m[3]!)).toBeLessThan(0.1);
  });
});
describe('frozen targets', () => {
  it.each(['L23', 'L24', 'L25', 'L26', 'L27'])('%s pinned to the bot population', (id) => {
    const spec = specOf(id)!;
    for (const region of REGIONS) { const p = botPopulation(spec, region), f = spec.frozen![region]!; near(f.budget, p.budget, 0.02); near(f.starA, p.starA, 0.02); near(f.starB, p.starB, 0.02); }
  });
});
void ({} as GridState);

describe('1.6 Retry keeps chapter 7 designs and predictions (controlDesign)', () => {
  const env = (id: string, actions: { name: string; args: unknown[] }[]): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: id, region: 'global' }); for (const a of actions) expect(e.step(a as any).info.ok, a.name).toBe(true); return e; };
  for (const [id, design] of [
    ['L27', [{ name: 'setBreakerRating', args: [40] }, { name: 'setDispatch3', args: [400, 300, 300] }, { name: 'predict', args: ['ps17', 0.91, 'kA'] }, { name: 'predict', args: ['ps24', 0.5, 's'] }]],
    ['L23', [{ name: 'setBreakerRating', args: [40] }, { name: 'setBusCoupler', args: [true] }, { name: 'setSeriesReactor', args: [0.1] }, { name: 'predict', args: ['faultKA', 30, 'kA'] }]],
    ['L26', [{ name: 'setDispatchMode', args: ['corridor'] }, { name: 'setCommitment', args: ['ocgt', 17, 23] }, { name: 'predict', args: ['lambda20', 59.2, '$/MWh'] }]],
  ] as [string, { name: string; args: unknown[] }[]][]) {
    it(`${id}: the design and every prediction come back on a fresh level`, () => {
      const a = env(id, design);
      const allowed = specOf(id)!.allowed.actions as readonly string[];
      const cd = ((GAME.queries!.controlDesign as any)(a.state) as { name: string; args: unknown[] }[]).filter((x) => allowed.includes(x.name) || x.name === 'predict');
      const b = env(id, cd);
      expect(b.state.ch7).toEqual(a.state.ch7);
      expect(b.state.metrics.predictions.map((p) => [p.id, p.predicted])).toEqual(a.state.metrics.predictions.map((p) => [p.id, p.predicted]));
    });
  }
});

describe('1.6 L27 breaker sizing from the givens', () => {
  it('the grown board\'s Z1, Z2, Z0 give its 3-phase and SLG fault currents by the textbook formulas', () => {
    const g = grownBoard(), ib = 100 / (Math.sqrt(3) * 33);
    expect(Math.abs(ib / g.z1 - g.threePhKA) / g.threePhKA).toBeLessThan(0.01);
    expect(Math.abs(3 * ib / (g.z1 + g.z2 + g.z0) - g.slgKA) / g.slgKA).toBeLessThan(0.03);
  });
});
