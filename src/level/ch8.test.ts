// Chapter 8 (L31-L36): the engine's numbers against independent hand calculations (and the oracle scenarios of src/sim/distrib/oracles.test.ts), the lesson gates in both region packs, one-click designs,
// the actions' validation, every string the chapter emits, determinism and the frozen targets.
import { describe, expect, it } from 'vitest';
import { Env, TICK, hashOf } from '@core/kit';
import { GAME } from '../game';
import { i18n } from '../i18n';
import { specOf } from './index';
import { runDesign } from './run';
import { botPopulation } from './population';
import { examAnswers } from '../sim/ch8/exam';
import { L31, L32, L33, L34, L36 } from '../sim/ch8/data';
import { studyVoltage, defaultFeeder, handDropPct } from '../sim/ch8/feeder';
import { studyL32, defaultL32 } from '../sim/ch8/reliab';
import { studyL33, defaultL33 } from '../sim/ch8/protect';
import { studyL34, defaultL34 } from '../sim/ch8/subst';
import type { GridState } from '../types';

const IDS = ['L31', 'L32', 'L33', 'L34', 'L35', 'L36'];
const REGIONS = ['global', 'in'];
const near = (a: number, b: number, rel = 1e-6): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(Math.abs(b), 1e-9)); };

describe('hand calculations', () => {
  it('L36 exam answers: textbook drop and a by-hand FMEA of three sections', () => {
    const a = examAnswers();
    // A 4 km, B 5 km, C 3 km of Rabbit (0.552 + j0.39 ohm/km) carrying 900/330, 500/180 and 200/80 kW/kvar through them
    const dv = (r: number, x: number, p: number, q: number): number => (r * p * 1000 + x * q * 1000) / (11 * 11 * 1e6);
    near(a.dropPct, 100 * (dv(0.552 * 4, 0.39 * 4, 900, 330) + dv(0.552 * 5, 0.39 * 5, 500, 180) + dv(0.552 * 3, 0.39 * 3, 200, 80)));
    // fault on A (0.6/yr): all 600 customers out 4 h; on B (0.75/yr): A 1 h, B and C 4 h; on C (0.45/yr, fuse): C's 100 for 4 h
    near(a.saifi, 0.6 + 0.75 + 0.45 * 100 / 600);
    near(a.saidi, 0.6 * 240 + 0.75 * (300 * 60 + 300 * 240) / 600 + 0.45 * 100 * 240 / 600);
    near(a.caidi, a.saidi / a.saifi);
  });
  it('L31: the load flow drop is the textbook sum of (R P + X Q) / V^2 to within the second-order term', () => {
    const w = defaultFeeder(L31), st = studyVoltage(L31, w, 1.1);
    const sweep = 100 * (1 - st.peak.byId['N5']!.vPu);   // the trunk node N5: no transformer drop
    expect(Math.abs(sweep - handDropPct(L31, w)) / sweep).toBeLessThan(0.2);   // first order: the textbook sum ignores the voltage drop's own effect on the current
    // taps shift every voltage of a customer by the same percentage and change no current
    const t = studyVoltage(L31, { ...w, tap: [5, 5, 5, 5, 5] }, 1.1);
    expect(t.minV / st.minV).toBeGreaterThan(1.04); expect(t.minV / st.minV).toBeLessThan(1.06);
    near(t.lossPct, st.lossPct, 0.03);
  });
  it('L32: SAIDI = SAIFI x CAIDI, momentary interruptions (remote switching) are not counted, a tie shortens the outage', () => {
    const n = studyL32(defaultL32()).rel;
    near(n.saidi, n.saifi * n.caidi);
    near(n.saifi, 3.225, 1e-3);   // no device: every fault hits every customer once: lambda x length = 0.15 x 21.5 km
    const man = studyL32({ ...defaultL32(), sect: { T2: 'manual', T3: 'none', T4: 'none' } }).rel, rem = studyL32({ ...defaultL32(), sect: { T2: 'remote', T3: 'none', T4: 'none' } }).rel;
    expect(man.saifi).toBeCloseTo(n.saifi, 9);   // a manual switch restores in an hour: still an interruption
    expect(rem.saifi).toBeLessThan(n.saifi - 0.3); expect(rem.saidi).toBeLessThan(man.saidi);
    const sw = { T2: 'none', T3: 'manual', T4: 'none' } as const;   // a tie feeds the customers beyond a switch from the other side: alone (no switch) it changes nothing
    expect(studyL32({ ...defaultL32(), sect: sw, tie: true }).rel.saidi).toBeLessThan(studyL32({ ...defaultL32(), sect: sw }).rel.saidi);
    near(studyL32({ ...defaultL32(), tie: true }).rel.saidi, n.saidi, 1e-9);
  });
  it('L33: the fast curve beats the fuse minimum melt and the slow curve loses to total clearing where the margins say so', () => {
    const ok = studyL33({ pickupA: 200, fastTd: 0.05, slowTd: 3, fastShots: 2, fuse: { S1: 65, S2: 65, S3: 40 } });
    expect(ok.kind).toBeNull(); expect(ok.marginS).toBeGreaterThanOrEqual(L33.marginStarS);
    expect(studyL33(defaultL33()).kind).toBe('miscoordination');
    expect(studyL33({ pickupA: 200, fastTd: 0.25, slowTd: 3, fastShots: 0, fuse: { S1: 65, S2: 65, S3: 65 } }).kind).toBe('fuseBlown');
    expect(studyL33({ pickupA: 200, fastTd: 0.25, slowTd: 3, fastShots: 2, fuse: { S1: 6, S2: 65, S3: 65 } }).kind).toBe('fuseLoad');
    expect(studyL33({ pickupA: 100, fastTd: 0.25, slowTd: 3, fastShots: 2, fuse: { S1: 65, S2: 65, S3: 65 } }).kind).toBe('nuisance');
    expect(studyL33({ pickupA: 300, fastTd: 0.25, slowTd: 3, fastShots: 2, fuse: { S1: 65, S2: 65, S3: 65 } }).kind).toBe('blind');
  });
  it('L34: firm capacity, relief cools the survivor, ageing doubles every 6 K', () => {
    const n = studyL34(defaultL34()), tie = studyL34({ ...defaultL34(), tie: 'remote' });
    near(n.firmMva, 20); expect(n.overheat).toBe(true); expect(tie.hotPeakC).toBeLessThan(n.hotPeakC); expect(tie.lolDays).toBeLessThan(n.lolDays);
    expect(studyL34({ ...defaultL34(), third: true }).firmMva).toBe(40);
    // 1.1: no single relief carries the 36.5 MVA peak; bigger units, the remote tie and the large demand response together do
    expect(studyL34({ ...defaultL34(), sizeMva: 24 }).overheat).toBe(true);
    expect(studyL34({ ...defaultL34(), sizeMva: 24, tie: 'remote', dr: 'large' }).overheat).toBe(false);
    expect(L34.hotSpotLimitC).toBe(140);
  });
});

describe.each(IDS)('%s lesson gate', (id) => {
  const spec = specOf(id)!;
  it.each(REGIONS)('naive fails with its mechanism, lesson passes, reference earns 3 stars (%s)', (region) => {
    const n = runDesign(spec, region, spec.naive.actions), l = runDesign(spec, region, spec.lesson), r = runDesign(spec, region, spec.reference);
    expect(n.status).toBe('lost'); expect(n.failKind).toBe(spec.naive.failKind); expect(n.rejected).toBeNull();
    expect(l.status, l.reason).toBe('won'); expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3); expect(l.stars).toBeLessThan(3);
    expect(spec.chapter).toBe(8);
  });
  it('is deterministic: same seed and actions, same hash', () => {
    const run = (): string => { const e = new Env(GAME); e.reset({ seed: 1, level: id }); for (const a of spec.reference) e.step(a); e.step(TICK); return hashOf(e.state); };
    expect(run()).toBe(run());
  });
  it('the shift report carries the player\'s numbers and every string resolves', () => {
    i18n.clearMissing();
    for (const region of REGIONS) {
      for (const acts of [spec.lesson, spec.naive.actions]) {
        const e = new Env(GAME); e.reset({ seed: 1, level: id, region }); for (const a of acts) e.step(a); e.step(TICK);
        const li = e.engine.q('levelInfo') as { lesson: string; tryHint: string }; expect(li.lesson.length).toBeGreaterThan(40); expect(li.lesson).not.toMatch(/\{/);
        if (e.state.status === 'lost') { expect(li.tryHint.length).toBeGreaterThan(20); expect(li.tryHint).not.toMatch(/\{/); expect(e.state.statusReason).not.toMatch(/\{/); }
        const st = e.engine.q('ch8Study') as { active: boolean; id: string }; expect(st.active).toBe(true); expect(st.id).toBe(id);
        expect(JSON.stringify(st, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NF__' : v))).not.toContain('__NF__');
        expect((e.engine.q('ch8Kit') as { active: boolean }).active).toBe(true);
      }
    }
    expect(i18n.missingKeys()).toEqual([]); expect(i18n.missingVars()).toEqual([]);
  });
});

describe('one-click designs earn the pass lamp at most', () => {
  const act = (name: string, ...args: unknown[]) => ({ name, args });
  const cases: [string, ReturnType<typeof act>[]][] = [
    ['L31', [act('setDtTap', 'all', 5)]],
    ['L32', [act('setTie', true)]],
    ['L33', ['S1', 'S2', 'S3'].map((s) => act('setFuseLink', s, 65))],
    ['L34', [act('setTransfer', 'manual')]],
    ['L35', [act('setPvLimit', 1000), act('setOltc', 1.04, false)]],
  ];
  it.each(cases)('%s', (id, acts) => {
    for (const region of REGIONS) { const o = runDesign(specOf(id)!, region, acts); expect(o.stars, `${id} ${region}: ${o.status}`).toBeLessThanOrEqual(1); }
  });
  it('L35: a set-point alone passes for $0 in the global pack and earns the pass lamp only', () => {
    const o = runDesign(specOf('L35')!, 'global', [{ name: 'setPvLimit', args: [1000] }, { name: 'setOltc', args: [1.04, false] }]);
    expect(o.status).toBe('won'); expect(o.capex).toBe(0); expect(o.stars).toBe(1);
  });
});

describe('actions', () => {
  const play = (id: string, region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: id, region }); return e; };
  it('refuse the wrong level, unknown parts, and too many sectionalisers', () => {
    const e = play('L32');
    expect(e.step({ name: 'setDtTap', args: ['N1', 2.5] }).info.ok).toBe(false);
    expect(e.step({ name: 'placeSwitch', args: ['T2', 'manual'] }).info.ok).toBe(true); expect(e.step({ name: 'placeSwitch', args: ['T3', 'remote'] }).info.ok).toBe(true);
    expect(e.step({ name: 'placeSwitch', args: ['P1', 'remote'] }).info.ok).toBe(false);
    const f = play('L33'); expect(f.step({ name: 'setFuseLink', args: ['S1', 7] }).info.ok).toBe(false); expect(f.step({ name: 'setFuseLink', args: ['S1', 40] }).info.ok).toBe(true);
    expect(f.step({ name: 'setRecloser', args: [200, 0.25, 3, 2] }).info.ok).toBe(true); expect(f.step({ name: 'setRecloser', args: [201, 0.25, 3, 2] }).info.ok).toBe(false);
    const g = play('L31'); expect(g.step({ name: 'setDtTap', args: ['N1', 3] }).info.ok).toBe(false); expect(g.step({ name: 'setConductor', args: ['N9', 'Dog'] }).info.ok).toBe(false);
    expect(g.step({ name: 'placeRegulator', args: ['N1', 1.0] }).info.ok).toBe(false);   // not a site of the level
    expect(g.step({ name: 'placeRegulator', args: ['N2', 1.0] }).info.ok).toBe(true); expect(g.step({ name: 'removeRegulator', args: [] }).info.ok).toBe(true);
  });
  it('prices are the same US$ build in the pack\'s currency (the Indian pack scales by 83)', () => {
    const cost = (region: string): number => { const e = play('L31', region); e.step({ name: 'placeRegulator', args: ['N2', 1.0] }); return e.state.budget.spent; };
    near(cost('in') / cost('global'), 83);
  });
  it('L36: the why card and the predictions score stars 1, 2 and 3', () => {
    const s = specOf('L36')!, a = examAnswers();
    const preds = (f: number) => [{ name: 'predict', args: ['dropPct', a.dropPct * f, '%'] }, { name: 'predict', args: ['saifi', a.saifi * f, '/yr'] }, { name: 'predict', args: ['saidi', a.saidi * f, 'min'] }];
    const why = (c: string) => [{ name: 'answerWhy', args: [c] }];
    expect(runDesign(s, 'global', [...preds(1.2), ...why('dv-rp-xq')]).stars).toBe(1);
    expect(runDesign(s, 'global', [...preds(1.04), ...why('dv-rp-xq')]).stars).toBe(2);
    expect(runDesign(s, 'global', [...preds(1.005), ...why('dv-ir-only')]).stars).toBe(2);
    expect(runDesign(s, 'global', [...preds(1.005), ...why('dv-rp-xq')]).stars).toBe(3);
    expect(runDesign(s, 'global', preds(1).slice(0, 2)).status).toBe('lost');
    expect(L36.tolPct).toBe(5);
  });
});

describe('frozen targets', () => {
  it.each(IDS)('%s pinned to the bot population', (id) => {
    const spec = specOf(id)!;
    for (const region of REGIONS) { const p = botPopulation(spec, region), f = spec.frozen![region]!; near(f.budget, p.budget, 0.02); near(f.starA, p.starA, 0.02); near(f.starB, p.starB, 0.02); }
  });
});
void L32;
