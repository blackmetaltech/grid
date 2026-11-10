// Chapter 3 (Phasors & Power Factor, Mill Town) engine side: L07 The Lagging Mill, L08 Resonance at the Fifth, L09 The Hundred-Percent Trap.
// Lesson gates (naive fails for the right reason, lesson passes, reference earns three stars) in both region packs, the numbers of the independent oracle
// (tools/oracles/ch3_oracles.py -> ch3_expected.json), the actions' refusals, the lessons in the player's own numbers, the hints, determinism.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Env, TICK, checkAllLevels, hashOf, type Action } from '@core/kit';
import { GAME } from '../game';
import { en } from '../locales/en';
import { REGIONS } from '../regions';
import type { GridRegionData } from '../regions/data';
import { specOf } from './index';
import { runDesign } from './run';
import type { GridState } from '../types';
import { harmonicStudy } from '../sim/ch3/harmonics';
import { faultStudy } from '../sim/ch3/series';
import { solvedOf } from '../sim/solved';
import { hResonance, hParallelDetuned, hSeries, qEffective } from '../sim/bench/harmonics';
import { bank, SUPPLY, FACTORY } from './levels/l08';
import { series, QUARRY, FEEDER, LINE_KM } from './levels/l09';
import { FILTER_PCT, DETUNE_COST, SERIES_FIXED_KVAR } from '../ch3-actions';

const EXP = JSON.parse(readFileSync(fileURLToPath(new URL('../../tools/oracles/ch3_expected.json', import.meta.url)), 'utf8'));
const REGION_IDS = ['global', 'in'];
const near = (a: number, b: number, rel: number, what = ''): void => { expect(Math.abs(a - b), `${what} ${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.abs(b)); };
const fresh = (id: string, region = 'global'): Env<GridState> => { const e = new Env(GAME); e.reset({ seed: 1, level: id, region }); return e as Env<GridState>; };
const play = (id: string, acts: Action[], region = 'global'): Env<GridState> => { const e = fresh(id, region); for (const a of acts) expect(e.step(a).info.ok, `${a.name} ${a.args}`).toBe(true); return e; };
const run = (e: Env<GridState>, n = 100): Env<GridState> => { for (let i = 0; i < n && e.state.status === 'playing'; i++) e.step(TICK); return e; };
const info = (e: Env<GridState>): any => e.engine.q('levelInfo');

/** Play to `block` with the level's own losses switched off (and a rating no feeder trips on) to read the instantaneous numbers the oracle prints. */
function at(id: string, acts: Action[], block: number, region = 'global'): Env<GridState> {
  const e = fresh(id, region), s = e.state;
  s.budget.capexLimit = 0;
  const c = s.rules.ch3!; if (c.harmonics) { c.harmonics.capRmsMax = 99; c.harmonics.thdMaxPct = 999; } c.pfPeakMin = null; c.loadVMinPu = null; if (c.fault) c.fault.breakerKA = 99;
  for (const b of s.branches) b.ratingMVA = 1e4;
  for (const a of acts) expect(e.step(a).info.ok).toBe(true);
  for (let i = s.tick; i < block; i++) e.step(TICK);
  return e;
}

describe('chapter 3 registration', () => {
  it('L07, L08, L09 are chapter 3 grid levels with their strings', () => {
    for (const id of ['L07', 'L08', 'L09']) {
      const spec = specOf(id)!;
      expect(spec.chapter).toBe(3); expect(spec.kind).toBe('grid');
      for (const k of [spec.titleKey, spec.briefKey, spec.story!.placeKey, ...spec.story!.lineKeys, spec.story!.lessonKey, ...spec.coach.flatMap((c) => [c.textKey, c.whyKey])]) expect(en[k], `${id} ${k}`).toBeTruthy();
    }
  });
  it('core solvability harness: the solver passes, idling does not, and no 2-action win is random luck, for the three levels', () => {
    for (const region of REGION_IDS) {
      const reports = checkAllLevels(GAME, { seed: 1, full: true, region }).filter((r) => ['L07', 'L08', 'L09'].includes(r.level));
      expect(reports.length).toBe(3);
      for (const r of reports) expect(r.problems, `${r.level} ${region}`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------- L07
describe('L07 The Lagging Mill: the power triangle', () => {
  const o = EXP.L07;
  it('the oracle numbers: the mill at the peak (pf 0.70) and at lunch (P 0.15 MW, Q 0.9 MVAr, pf 0.16, current almost 90 degrees behind the voltage)', () => {
    near(o.mill_peak.S_MVA, 1.2 / 0.7, 1e-12); near(o.mill_peak.Q_MVAr, 1.224, 5e-4); near(o.mill_peak.phi_deg, 45.57, 1e-3);
    near(o.lunch.S_MVA, Math.hypot(0.15, 0.9), 1e-12); near(o.lunch.pf, 0.1644, 1e-3); near(o.lunch.phi_deg, 80.54, 1e-3);
    near(o.qc_rule_to_0p95_MVAr, 0.8298, 1e-3);
    // the same kilovars at 13:00 draw {lunch.I_mill_A} A of a peak {peak_mill_A} A mill: amps stay while kW fall by 8x
    near(o.lunch.I_mill_A / o.peak_mill_A, o.lunch.S_MVA / o.mill_peak.S_MVA, 1e-12); expect(o.lunch.I_mill_A / o.peak_mill_A).toBeGreaterThan(0.5);
  });
  it('the engine at 13:00: the feeder carries P of the mill and village but hundreds of kvar: amps are high and the power factor low', () => {
    const e = play('L07', []); e.state.branches[0]!.ratingMVA = 1e4;
    while (e.state.clock.block < 52) e.step(TICK);
    const tr = e.state.metrics.track;
    expect(tr.noonPf).toBeLessThan(0.45); expect(tr.noonMVAr!).toBeGreaterThan(0.85); expect(tr.noonMW!).toBeLessThan(0.5); expect(tr.noonAmps!).toBeGreaterThan(45);
    // the mill's 13:00 reactive power is the design's 0.9 MVAr
    expect(e.state.loads[0]!.Q).toBeCloseTo(0.9, 9); expect(e.state.loads[0]!.P).toBeCloseTo(0.15, 9);
  });
  it('the shift report names S = P + jQ in the player\'s numbers and recomputes: without a bank (rated against the 115 A feeder)', () => {
    const e = run(play('L07', []));
    expect(e.state.status).toBe('lost');
    const l = info(e).lesson as string;
    const m = l.match(/the loads asked for P = ([\d.]+) MW of real power and Q = ([\d.]+) MVAr of reactive power\. S = √\(P² \+ Q²\) = ([\d.]+) MVA and the power factor cos φ = P ÷ S = ([\d.]+), so the current is I = S ÷ \(√3 · V\) = (\d+) A at ([\d.]+) pu, against (\d+) A of rating\./)!;
    expect(m, l).not.toBeNull();
    const [p, q, s, pf, i, v, rated] = m.slice(1).map(Number) as [number, number, number, number, number, number, number];
    near(s, Math.hypot(p, q), 0.01); near(pf, p / s, 0.01); near(i, s * 1000 / (Math.sqrt(3) * 11 * v), 0.01); expect(rated).toBe(115);
    expect(l).toMatch(/No capacitor stood at the mill/); expect(l).toMatch(/wattless current/);
    expect(info(e).tryHint).toMatch(/Q_c = P \(tan φ₁ − tan φ₂\) is about 0\.8\d MVAr/);
  });
  it('with the lesson bank the same sentence shows the feeder\'s Q cut by the bank and the amps under 115', () => {
    const e = run(play('L07', specOf('L07')!.lesson));
    expect(e.state.status).toBe('won');
    const l = info(e).lesson as string;
    const m = l.match(/Your (\d+) kVAr of capacitors supplied ([\d.]+) MVAr of that Q right at the mill, so the feeder carried only Q = ([\d.]+) MVAr: S = ([\d.]+) MVA, power factor ([\d.]+), so I = S ÷ \(√3 · V\) = (\d+) A at ([\d.]+) pu/)!;
    expect(m, l).not.toBeNull();
    expect(Number(m[1])).toBe(900); near(Number(m[2]), 0.9 * 0.96 ** 2 * 1.0, 0.08); expect(Number(m[6])).toBeLessThan(115); expect(Number(m[5])).toBeGreaterThan(0.94);
    near(Number(m[4]), Math.hypot(e.state.metrics.track.peakLoadMW!, Number(m[3])), 0.01); near(Number(m[6]), Number(m[4]) * 1000 / (Math.sqrt(3) * 11 * Number(m[7])), 0.01);
    expect(info(e).tryHint).toBe('');
  });
  it('a fixed bank earns two stars (leading at night), the switched reference three', () => {
    const spec = specOf('L07')!;
    const fixed = runDesign(spec, 'global', spec.lesson); expect(fixed.stars).toBe(2); expect(fixed.track.pfDay).toBeLessThan(0.95);
    expect(runDesign(spec, 'global', spec.reference).stars).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------- L08
describe('L08 Resonance at the Fifth: lesson gate', () => {
  for (const region of REGION_IDS) {
    it(`${region}: the L07 bank blows its fuse at 08:00, the 7 % detuned bank passes, the 4.7 filter of 1200 kVAr earns three stars`, () => {
      const spec = specOf('L08')!;
      const n = runDesign(spec, region, spec.naive.actions);
      expect(n.rejected).toBeNull(); expect(n.status).toBe('lost'); expect(n.failKind).toBe('capFuse');
      expect(n.state.clock.block).toBe(32);   // 08:00 + the block the drives start in
      expect(n.state.block.verdictKey).toBe('level.lost.capFuse');
      expect(n.reason).toMatch(/^At 08:00 the 900 kVAr bank blew its fuse\. Its parallel resonance with the supply sat at h = 5\.0, next to the 5th harmonic \(250 Hz\)/);
      expect(n.state.shunts[0]!.blown).toBe(true); expect(n.state.shunts[0]!.on).toBe(0);
      expect(n.state.events.log.some((e) => e.causeKey === 'ch3.capFuse')).toBe(true);
      expect(n.track.capRmsRatio!).toBeGreaterThan(1.3 * 1.02);
      const l = runDesign(spec, region, spec.lesson);
      expect(l.status, l.reason).toBe('won'); expect(l.stars).toBe(2);
      expect(l.track.capRmsRatio!).toBeLessThan(1.3 * 0.98); expect(l.track.thdPct!).toBeLessThan(5); expect(l.track.thdPct!).toBeGreaterThan(3);
      const r = runDesign(spec, region, spec.reference);
      expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3); expect(r.track.thdPct!).toBeLessThanOrEqual(3);
      expect(r.state.metrics.track.pfAtPeak!).toBeGreaterThanOrEqual(0.95);
    });
  }
  it('every design of the site list ends for its own reason: plain banks blow, a bare bus or a 14 % reactor breaks the THD limit, a small bank misses the power factor', () => {
    const spec = specOf('L08')!;
    const kind = (acts: Action[]): string | null => runDesign(spec, 'global', acts, { frozen: null }).failKind;
    expect(kind([])).toBe('thd');
    expect(kind(bank('B2', 600, 0))).toBe('capFuse'); expect(kind(bank('B2', 900, 0))).toBe('capFuse');
    expect(kind(bank('B2', 900, 14))).toBe('thd'); expect(kind(bank('B2', 600, FILTER_PCT))).toBe('pfPeak');
    for (const kvar of [600, 900, 1200]) expect(kind(bank('B1', kvar, 7)), `B1 ${kvar}`).not.toBeNull();   // relocating the bank to the substation bus never passes
    // a bank that stays on its own 1200 kVAr plain is a different story: its resonance (h = 4.2) is between the 3rd and the 5th, the current stays under the fuse limit, the THD does not
    expect(kind(bank('B2', 1200, 0))).toBe('thd');
  });
});

describe('L08 harmonic study against the independent oracle (tools/oracles/ch3_oracles.py)', () => {
  it('G-03 (50 MVA, 2 MVAr: h = 5, 250 Hz) and G-04 (7 % reactor: series 3.78, parallel and Q_eff) are the closed forms the engine uses', () => {
    const o = EXP.L08;
    near(hResonance(50, 2), o.G03.h_r, 1e-12); expect(hResonance(50, 2) * 50).toBeCloseTo(250, 9);
    near(hSeries(0.07), o.G04.h_series, 1e-12); near(hParallelDetuned(50, 2, 0.07), o.G04.h_parallel, 1e-12); near(qEffective(2, 0.07), o.G04.q_eff_MVAr, 1e-12);
    expect(o.G04.h_series).toBeCloseTo(3.78, 2); expect(o.filter.p_pct).toBeCloseTo(FILTER_PCT, 2);
  });
  it('THD at the mill bus, the bank\'s rms current / rated, the load-flow voltage and the power factor at the evening peak match the oracle for all 13 bank designs', () => {
    const designs: [string, Action[]][] = [['B2-0-0.0', []]];
    for (const q of [600, 900, 1200]) for (const p of [0, 0.0453, 0.07, 0.14]) designs.push([`B2-${q}-${p === 0 ? '0.0' : p}`, bank('B2', q, p === 0.0453 ? FILTER_PCT : Math.round(p * 100))]);
    expect(Object.keys(EXP.L08.designs).sort()).toEqual(designs.map((d) => d[0]).sort());
    for (const [key, acts] of designs) {
      const o = EXP.L08.designs[key];
      const e = at('L08', acts, 80);   // 20:00: mill, village and drives at full load
      const st = e.state, sol = solvedOf(st)!;
      expect(st.clock.block).toBe(80);
      const r = harmonicStudy(st, st.rules.ch3!.harmonics!, 50, (b) => sol.sol.V[b])!;
      near(sol.sol.V.B2!, o.lf.V, 2e-3, `${key} V`);
      near(r.thdPct, o.thd_pct, 0.01, `${key} THD`);
      near(r.i1A, o.i1_A, 5e-3, `${key} I1`);
      if (acts.length > 0) {
        const bk = r.banks[0]!;
        near(bk.ratio, o.rms_ratio, 0.01, `${key} rms`); near(bk.hParallel, o.h_parallel, 1e-3, `${key} h`);
        for (const h of [5, 7, 11, 13]) near(bk.harmA[h]!, o.ch_A[String(h)], 0.02, `${key} I_c${h}`);
      } else expect(r.banks).toEqual([]);
      const tr = st.metrics.track;
      expect(tr.peakBlock!).toBeGreaterThanOrEqual(76); expect(tr.peakBlock!).toBeLessThanOrEqual(84);
      near(tr.pfAtPeak!, o.lf.pf, 0.01, `${key} pf`);
    }
  });
  it('the study runs on the real network: a 6-pulse drive injects I1/h, so the 5th is 20 % of I1 and a bank sitting on the 5th amplifies it ~ x5 more than a detuned one', () => {
    const e = at('L08', bank('B2', 900, 0), 80), st = e.state, sol = solvedOf(st)!;
    const r = harmonicStudy(st, st.rules.ch3!.harmonics!, 50, (b) => sol.sol.V[b])!;
    near(r.banks[0]!.harmA[5]!, r.i1A / 5 * 5.5, 0.5);   // the bank carries several times the injected 5th (resonance)
    expect(r.banks[0]!.harmA[5]!).toBeGreaterThan(r.i1A / 5 * 3);
    const d = at('L08', bank('B2', 900, 7), 80), sd = d.state, sold = solvedOf(sd)!;
    const rd = harmonicStudy(sd, sd.rules.ch3!.harmonics!, 50, (b) => sold.sol.V[b])!;
    expect(rd.banks[0]!.harmA[5]!).toBeLessThan(r.i1A / 5 * 1.3);   // the detuned bank sinks no more than about the 5th the drives inject
    expect(rd.banks[0]!.hParallel).toBeLessThan(3.5);
  });
});

describe('L08 placeBank, prices and the fuse', () => {
  it('a bank costs the catalogue price per kVAr times 1 (plain), 1.8 (7 % or 14 %, the catalogue\'s cap-detuned-7/14 costFactor) or 2.6 (the tuned filter), in both packs', () => {
    for (const region of REGION_IDS) {
      const pack = REGIONS.get(region) as { data: GridRegionData };
      const base = pack.data.catalogues.compensation.find((c) => c.id === 'cap-11-900')!.pricePerKvar!;
      for (const id of ['cap-detuned-7', 'cap-detuned-14']) expect(pack.data.catalogues.compensation.find((c) => c.id === id)!.costFactor).toBe(DETUNE_COST[id.slice(-1) === '7' ? '7' : '14']);
      for (const [p, f] of [[0, 1], [7, 1.8], [14, 1.8], [FILTER_PCT, 2.6]] as const) {
        const e = fresh('L08', region), before = e.state.budget.spent, r = e.engine.act('placeBank', ['B2', 'cap-11-300', 3, p]);
        expect(r.ok).toBe(true); near(e.state.budget.spent - before, base * 900 * f, 1e-9, `${region} ${p}`);
      }
    }
  });
  it('refusals teach: a reactor share that is not offered, a bus that is not there, a part outside the level, a bank that is not a capacitor', () => {
    const e = fresh('L08');
    const r1 = e.engine.act('placeBank', ['B2', 'cap-11-300', 3, 9]); expect(r1.ok).toBe(false); expect(r1.key).toBe('level.part.notAllowed');
    const r2 = e.engine.act('placeBank', ['B9', 'cap-11-300', 3, 0]); expect(r2.ok).toBe(false); expect(r2.key).toBe('act.unknownId');
    const r3 = e.engine.act('placeBank', ['B2', 'cap-11-900', 1, 0]); expect(r3.ok).toBe(false); expect(r3.key).toBe('level.part.notAllowed');
    const r4 = e.engine.act('placeShunt', ['B2', 'cap-11-300', 1]); expect(r4.ok).toBe(false); expect(r4.key).toBe('level.action.notAllowed');
    const free = new Env(GAME); free.reset({ seed: 1 });
    expect(free.engine.act('placeBus', [1, 1, 11, 'gen', 1.0]).ok).toBe(true);
    const r5 = free.engine.act('placeBank', ['B1', 'cap-11-300', 2, 3]); expect(r5.ok).toBe(false); expect(r5.key).toBe('ch3.bank.detune'); expect(en[r5.key as string]).toBeTruthy(); expect(r5.message).not.toMatch(/\{/);
    const r6 = free.engine.act('placeBank', ['B1', 'cap-11-300', 2, 7]); expect(r6.ok).toBe(true); expect(r6.message).toMatch(/series resonance at h = 3\.78/);
  });
  it('a detuned bank delivers Q / (1 - p) at its terminals: the load flow sees 900 / 0.93 kVAr', () => {
    const e = play('L08', bank('B2', 900, 7));
    e.step(TICK);
    const sol = solvedOf(e.state)!, flows = sol.flows;
    const plain = play('L08', bank('B2', 900, 0)); plain.step(TICK);
    const qDet = sol.net.shunts[0]!.b, qPlain = solvedOf(plain.state)!.net.shunts[0]!.b;
    near(qDet / qPlain, 1 / 0.93, 1e-12); expect(flows).toBeTruthy();
  });
  it('a blown bank stays blown (no auto reconnect) and the verdict ends the level that block', () => {
    const e = run(play('L08', bank('B2', 900, 0)), 40);
    expect(e.state.status).toBe('lost'); expect(e.state.shunts[0]!.blown).toBe(true);
    const set = e.engine.act('setShuntSteps', ['C1', 3]); void set;
    expect(e.state.status).toBe('lost');
  });
});

describe('review fixes: stacking refused, hints say what the bank did', () => {
  it('a second bank on a bus that has one is refused with the way out', () => {
    const e = fresh('L08'); expect(e.engine.act('placeBank', ['B2', 'cap-11-300', 2, 0]).ok).toBe(true);
    const r = e.engine.act('placeBank', ['B2', 'cap-11-300', 3, 7]); expect(r.ok).toBe(false); expect(r.key).toBe('ch3.bank.exists'); expect(r.message).toMatch(/already has bank C1/);
    expect(e.state.shunts.length).toBe(1);
  });
  it('L07: a bank at the substation end, or left switched out, is named in the what-to-try; the buses carry names', () => {
    const wrong = run(play('L07', [{ name: 'placeShunt', args: ['B1', 'cap-11-900', 1] }, { name: 'setShuntSteps', args: ['C1', 1] }]));
    expect(wrong.state.status).toBe('lost'); expect(info(wrong).tryHint).toMatch(/stood at B1, the substation end/);
    const out = run(play('L07', [{ name: 'placeShunt', args: ['B2', 'cap-11-900', 1] }]));
    expect(info(out).tryHint).toMatch(/switched out at the peak/);
    expect(info(run(play('L07', []))).tryHint).toMatch(/No capacitor stood on the mill bus/);
    expect(out.state.buses[1]!.name).toBe('Mill bus (B2): banks go here');
  });
});

describe('L08 shift report and hints', () => {
  it('the fuse lesson: parallel resonance h = sqrt(Ssc/Qc) in the player\'s numbers (plain bank), the detuned bank\'s series tuning and lowered parallel resonance, a bare bus', () => {
    const e = run(play('L08', bank('B2', 900, 0)));
    const l = info(e).lesson as string;
    const m = l.match(/Your (\d+) kVAr bank is a plain capacitor\. With the supply \(short-circuit level (\d+) MVA at its bus\) it makes a parallel resonance at h = √\(S_sc ÷ Q_c\) = ([\d.]+), that is (\d+) Hz\. The drives inject I₅ = I₁ ÷ 5 = ([\d.]+) A \(I₁ = ([\d.]+) A\) of 5th harmonic, and at resonance the bank's rms current reached ([\d.]+) × rated \(([\d.]+) A against ([\d.]+) A\)\. Voltage THD peaked at ([\d.]+) %\./)!;
    expect(m, l).not.toBeNull();
    const [kvar, ssc, h, hz, i5, i1, ratio, cap, rated] = m.slice(1, 10).map(Number) as number[];
    near(h!, Math.sqrt(ssc! / (kvar! / 1000)), 0.01); expect(hz).toBe(Math.round(h! * 50)); near(i5!, i1! / 5, 0.02); near(ratio!, cap! / rated!, 0.01);
    const h7 = info(e).tryHint as string;
    expect(h7).toMatch(/resonance sat at h = 4\.9\d, next to the 5th harmonic/); expect(h7).toMatch(/7 % of the capacitor's reactance moves it down to about h = 3\.\d\d/);
    const d = run(play('L08', specOf('L08')!.lesson)); const ld = info(d).lesson as string;
    expect(ld).toMatch(/has a 7 % reactor in series: it is a series circuit tuned at h = 1 ÷ √p = 3\.78, below the 5th/); expect(ld).toMatch(/pulled down to h = √\(1 ÷ \(Q_c ÷ S_sc \+ p\)\) = 3\.\d\d/);
    expect(info(d).tryHint).toBe('');
    const n = run(play('L08', []));
    expect(info(n).lesson).toMatch(/^No bank stood on the bus/); expect(info(n).tryHint).toMatch(/Voltage THD reached 8\.\d %, over the 5 % limit/);
    const small = run(play('L08', bank('B2', 600, FILTER_PCT)));
    expect(info(small).tryHint).toMatch(/power factor was 0\.9\d.*more at the bus/);
  });
  it('the verdict strings fill every placeholder', () => {
    for (const acts of [bank('B2', 900, 0), [], bank('B2', 600, FILTER_PCT)]) { const e = run(play('L08', acts)); expect(e.state.statusReason).not.toMatch(/\{/); expect(info(e).lesson).not.toMatch(/\{/); expect(info(e).tryHint).not.toMatch(/\{/); }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------- L09
describe('L09 The Hundred-Percent Trap: lesson gate', () => {
  for (const region of REGION_IDS) {
    it(`${region}: no capacitor and 25 % leave the far end under 0.95 pu, 55 % passes with two stars, 70 % earns three, 100 % fails at the 21:00 fault`, () => {
      const spec = specOf('L09')!;
      const n = runDesign(spec, region, spec.naive.actions);
      expect(n.status).toBe('lost'); expect(n.failKind).toBe('brownout'); expect(n.state.block.verdictKey).toBe('level.lost.farVoltage');
      expect(n.reason).toMatch(/^The far end of the feeder sagged to 0\.9[23]\d pu, under the 0\.95 pu the crushers need/);
      expect(runDesign(spec, region, series(25)).failKind).toBe('brownout');
      const l = runDesign(spec, region, spec.lesson);
      expect(l.status, l.reason).toBe('won'); expect(l.stars).toBe(2); expect(l.track.loadVMinPu!).toBeLessThan(0.97);
      const r = runDesign(spec, region, spec.reference);
      expect(r.status, r.reason).toBe('won'); expect(r.stars).toBe(3); expect(r.track.loadVMinPu!).toBeGreaterThanOrEqual(0.97);
      const trap = runDesign(spec, region, series(100));
      expect(trap.status).toBe('lost'); expect(trap.failKind).toBe('breakerFail'); expect(trap.state.clock.block).toBe(84);
      expect(trap.state.block.verdictKey).toBe('level.lost.breakerFail');
      expect(trap.reason).toMatch(/^At 21:00 a three-phase fault hit the quarry bus\. 1\.46 kA flowed, more than the old feeder breaker's 1\.40 kA rating/);
      expect(trap.state.events.log.some((e) => e.causeKey === 'ch3.breakerFail')).toBe(true);
      expect(trap.capex, 'the trap is affordable: it is lost at the fault, not at the till').toBeLessThanOrEqual(spec.frozen![region]!.budget);
    });
  }
  it('every k from 25 to 70 % clears the fault (the breaker holds) and a 70 % design still has 8 % of margin', () => {
    const spec = specOf('L09')!;
    for (const k of [40, 55, 70]) { const o = runDesign(spec, 'global', series(k)); expect(o.track.faultKA!).toBeLessThan(FEEDER.breakerKA); expect(o.state.events.log.some((e) => e.causeKey === 'ch3.faultCleared')).toBe(true); }
    near(runDesign(spec, 'global', series(70)).track.faultKA!, 1.29, 0.01); expect(1.4 / 1.29).toBeGreaterThan(1.08);
  });
});

describe('L09 against the independent oracle', () => {
  it('far-end voltage at the peak, the fault current with and without the capacitor, the loop\'s resonant frequency: every k', () => {
    for (const [ks, o] of Object.entries(EXP.L09.ks) as [string, any][]) {
      const k = Number(ks);
      const e = at('L09', k === 0 ? [] : series(k), 70);   // 17:30: the quarry at full load
      const st = e.state, tr = st.metrics.track;
      near(tr.loadVMinPu!, o.far_V_pu, 1e-3, `k=${k} V`);
      const f = faultStudy(st, { block: 84, bus: 'B2', sscMVA: FEEDER.sscMVA, xOverR: FEEDER.xOverR, breakerKA: FEEDER.breakerKA, movPu: FEEDER.movPu }, 50)!;
      near(f.kA, o.kA, 5e-4, `k=${k} kA`); near(f.kA0, o.kA0, 5e-4, `k=${k} kA0`); near(f.xcOhm, o.xc_ohm, 5e-4, `k=${k} Xc`);
      if (k > 0) near(f.fResHz, o.f_res_Hz, 5e-4, `k=${k} fres`);
    }
    const ks = EXP.L09.ks;
    expect(ks['70'].kA).toBeLessThan(EXP.L09.breaker_kA); expect(ks['100'].kA).toBeGreaterThan(EXP.L09.breaker_kA);
    expect(ks['100'].kA / ks['0'].kA).toBeGreaterThan(1.6);   // cancelling all the reactance raises the fault by 61 % over the plain line
  });
});

describe('L09 placeSeriesCap, price, lesson and hints', () => {
  it('the capacitor lowers the working reactance to x (1 - k), keeps the gross x, and cannot go on a transformer, twice, or out of range', () => {
    const e = fresh('L09'); const x0 = e.state.branches[0]!.x;
    const r = e.engine.act('placeSeriesCap', ['T1', 40]); expect(r.ok).toBe(true); expect(r.message).toMatch(/Series capacitor of 40 % on line T1: \d\.\d+ Ω against the line's 12\.\d+ Ω/);
    const b = e.state.branches[0]!; near(b.x, x0 * 0.6, 1e-12); near(b.seriesCap!.xGross, x0, 1e-12);
    const twice = e.engine.act('placeSeriesCap', ['T1', 55]); expect(twice.ok).toBe(false);
    expect(twice.key).toBe('ch3.series.twice'); expect(en[twice.key as string]).toBeTruthy();
    const bad = fresh('L09').engine.act('placeSeriesCap', ['T1', 33]); expect(bad.ok).toBe(false); expect(bad.key).toBe('level.part.notAllowed');
    const no = fresh('L09').engine.act('placeSeriesCap', ['T9', 40]); expect(no.ok).toBe(false); expect(no.key).toBe('act.unknownId');
    const free = new Env(GAME); free.reset({ seed: 1 });
    free.engine.act('placeBus', [1, 1, 11, 'gen', 1.0]); free.engine.act('placeBus', [4, 1, 11, 'load']); free.engine.act('stringLine', ['B1', 'B2', 'l11-weasel', 1, 2]);
    const r2 = free.engine.act('placeSeriesCap', ['T1', 200]); expect(r2.ok).toBe(false); expect(r2.key).toBe('ch3.series.range');
    expect(free.engine.act('placeSeriesCap', ['T1', 50]).ok).toBe(true);
  });
  it('the price is a fixed part (20 000 kVAr of shunt bank) plus the capacitor\'s own kVAr, at the shunt-bank price x 1.6, and 70 % costs only a few percent more than 40 %', () => {
    for (const region of REGION_IDS) {
      const pack = REGIONS.get(region) as { data: GridRegionData };
      const perKvar = pack.data.catalogues.compensation.find((c) => c.id === 'cap-11-300')!.pricePerKvar!;
      const line = fresh('L09', region).state.branches[0]!; const spent0 = fresh('L09', region).state.budget.spent;
      const price = (k: number): number => { const e = fresh('L09', region); const before = e.state.budget.spent; e.engine.act('placeSeriesCap', ['T1', k]); return e.state.budget.spent - before; };
      const iA = line.ratingMVA * 1000 / (Math.sqrt(3) * 33), xl = line.x * 33 * 33 / 100;
      for (const k of [40, 70]) near(price(k), perKvar * 1.6 * (SERIES_FIXED_KVAR + 3 * iA * iA * xl * k / 100 / 1000), 1e-9, `${region} k=${k}`);
      expect(price(70) / price(40)).toBeLessThan(1.1); expect(spent0).toBeGreaterThanOrEqual(0);
    }
  });
  it('the shift report prints the drop formula and the fault with the player\'s numbers and the sums recompute', () => {
    const e = run(play('L09', series(55)));
    const l = info(e).lesson as string;
    const m = l.match(/Your 55 % series capacitor \(([\d.]+) Ω\) cancels part of the line's ([\d.]+) Ω of reactance, and the voltage drop ΔV ≈ \(R · P \+ \(X_L − X_C\) · Q\) ÷ V² = \(([\d.]+) × ([\d.]+) \+ \(([\d.]+) − ([\d.]+)\) × ([\d.]+)\) ÷ 33² = ([\d.]+) % of nominal: the far end held ([\d.]+) pu at the peak\. The 21:00 fault at the quarry bus would be ([\d.]+) kA on the plain line; behind your capacitor the loop reactance is lower, so it was ([\d.]+) kA, against the breaker's ([\d.]+) kA\. Line and capacitor form a series LC circuit that resonates at ([\d.]+) Hz\./)!;
    expect(m, l).not.toBeNull();
    const [xc, xl, r, p, xl2, xc2, q, dv, v, ka0, ka, max, fres] = m.slice(1).map(Number) as number[];
    near(xc!, xl! * 0.55, 0.01); expect(xl2).toBe(xl); expect(xc2).toBe(xc);
    near(dv!, (r! * p! + (xl! - xc!) * q!) / (33 * 33) * 100, 0.01); near(v!, 1.05 - dv! / 100, 0.01);
    expect(ka!).toBeGreaterThan(ka0!); expect(max).toBe(1.4); near(fres!, 50 * Math.sqrt(xc! / (xl! + 33 * 33 / FEEDER.sscMVA)), 0.01);
    expect(info(e).tryHint).toBe('');
    const n = run(play('L09', [])); expect(info(n).lesson).toMatch(/^No series capacitor stood on the line: with R = [\d.]+ Ω and X_L = [\d.]+ Ω/);
    expect(info(n).tryHint).toMatch(/The far end sank to 0\.9\d\d pu at the peak\. Series compensation cuts the X_L · Q term/);
    const t = run(play('L09', series(100))); expect(info(t).tryHint).toMatch(/Your capacitor cancelled 100 % of the line's reactance, so the fault saw almost only resistance: 1\.46 kA against a breaker of 1\.40 kA \(the plain line gives 0\.90 kA\)/);
    expect(info(t).lesson).not.toMatch(/\{/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------- everyone
describe('determinism and states', () => {
  it('the same actions give the same hash in every chapter 3 level', () => {
    for (const id of ['L07', 'L08', 'L09']) {
      const spec = specOf(id)!;
      const go = (): string => { const e = play(id, spec.lesson); run(e); return hashOf(e.state); };
      expect(go()).toBe(go());
    }
  });
  it('no other level carries chapter 3 state: a level without rules.ch3 has no track keys of the chapter and no new fields on its records', () => {
    const e = play('L05', []); run(e, 4);
    expect(e.state.rules.ch3).toBeUndefined(); expect(e.state.metrics.track.peakMW).toBeUndefined(); expect(e.state.metrics.track.thdPct).toBeUndefined();
    for (const h of e.state.shunts) expect(h.detunePct).toBeUndefined();
  });
  it('constants: the supply and the drives are the oracle\'s inputs', () => {
    expect(SUPPLY).toEqual({ sscMVA: 30, xOverR: 10, dampingShare: 0.15 }); expect(FACTORY.peakMW).toBe(0.8); expect(QUARRY.peakMW).toBe(5); expect(LINE_KM).toBe(35);
  });
});
