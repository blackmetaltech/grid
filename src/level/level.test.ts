// Level framework tests (M2.1) and the authored levels P0, L01, L02, L03, L07 (M2.2), run in every region pack (global and in):
// naive build fails (with its declared kind, by >= 2 % of the decisive quantity, before 80 % of the run), lesson build passes by >= 2 %,
// the reference earns three stars, idling does not win, the frozen targets match the regenerated bot population, and the numbers are
// the numbers of tools/oracles/expected.json (L03 table, L07 two-bus case, G-01b/G-02 for L01).
import { describe, expect, it } from 'vitest';
import { Env, TICK, checkAllLevels } from '@core/kit';
import { GAME } from '../game';
import { LEVELS } from '../levels';
import { en } from '../locales/en';
import { REGIONS } from '../regions';
import type { GridRegionData } from '../regions/data';
import { simParamsOf } from '../catalogue';
import { voltageBand } from '../sim/params';
import { expected } from '../oracles/expected';
import { expectOracle } from '../oracles/expected';
import type { GridState } from '../types';
import { CAMPAIGN_LEVELS, LEVEL_SPECS, specOf } from './index';
import { designs, resolveThresholds, type GridLevelSpec } from './spec';
import { runDesign, type Outcome } from './run';
import { MILL } from './levels/l07';
import { MIN_VERIFIED_FOR_PLAYER_HISTOGRAM, botPopulation, resultHistogram, niceUp, percentile } from './population';

const REGION_IDS = ['global', 'in'];
const cache = new Map<string, Outcome>();
/** Level×pack pairs whose third lamp is out of reach for a stated physical reason (each one is in CHANGELOG "Known gaps"; the level still has to be won by both builds). */
const KNOWN_STAR_GAPS: Record<string, string> = {
};
const outcomeOf = (spec: GridLevelSpec, region: string, kind: 'naive' | 'lesson' | 'reference'): Outcome => {
  const k = `${spec.id}/${region}/${kind}`;
  let o = cache.get(k);
  if (!o) { o = runDesign(spec, region, kind === 'naive' ? spec.naive.actions : spec[kind]); cache.set(k, o); }
  return o;
};
const thFor = (spec: GridLevelSpec, region: string): Record<string, number> => resolveThresholds(spec, simParamsOf((REGIONS.get(region) as { data: GridRegionData }).data), 'learner');
const near = (a: number, b: number, rel: number): void => { expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.abs(b)); };
const MARGIN = 0.02;

describe('level list', () => {
  it('the campaign order: the T00 clock fixture, the prologue and chapter 1, chapter 2 (L04 L05 L06 L29 L30), then chapters 3-7 in level order and the finale last', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids.slice(0, 5)).toEqual(['T00', 'P0', 'L01', 'L02', 'L03']);
    expect(new Set(ids).size).toBe(ids.length);
    const order = ['L04', 'L05', 'L06', 'L29', 'L30', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L19', 'L20', 'L21', 'L22', 'L23', 'L24', 'L25', 'L26', 'L27', 'L28'].filter((x) => ids.includes(x));
    expect(ids.filter((x) => order.includes(x))).toEqual(order);
    for (const must of ['L05', 'L29', 'L30', 'L07']) expect(ids).toContain(must);
    if (ids.includes('L28')) expect(ids.at(-1)).toBe('L28');
    expect(CAMPAIGN_LEVELS.map((l) => l.id)).toEqual(LEVEL_SPECS.map((l) => l.id));
    expect(new Set(LEVEL_SPECS.map((l) => l.id)).size).toBe(LEVEL_SPECS.length);
    expect(specOf('L07')?.chapter).toBe(3); expect(specOf('nope')).toBeUndefined();
  });
  it('every spec is self-consistent: sites, allowed parts, builds, coach, strings', () => {
    for (const spec of LEVEL_SPECS) {
      expect(spec.sites.length, spec.id).toBeGreaterThan(0);
      for (const site of spec.sites) { expect(site.options.length, `${spec.id}/${site.id}`).toBeGreaterThan(1); expect(new Set(site.options.map((o) => o.id)).size).toBe(site.options.length); }
      const names = [...spec.naive.actions, ...spec.lesson, ...spec.reference, ...[...designs(spec)].flatMap((d) => d.actions)].map((a) => a.name);
      for (const n of names) if (n !== 'predict') expect(spec.allowed.actions, `${spec.id} uses ${n}`).toContain(n);   // predict is always allowed (spec.ts ALWAYS), never on the palette
      expect(spec.coach.length, spec.id).toBeGreaterThanOrEqual(2); expect(spec.coach.length).toBeLessThanOrEqual(6);
      expect(new Set(spec.coach.map((c) => c.id)).size).toBe(spec.coach.length);
      for (const k of [spec.titleKey, spec.briefKey, ...spec.coach.flatMap((c) => [c.textKey, c.whyKey])]) expect(en[k], `${spec.id} string ${k}`).toBeTruthy();
      for (const c of spec.star3) for (const n of [c.min, c.max]) if (n !== undefined) expect(spec.thresholds[n], `${spec.id} star3 ${n}`).toBeDefined();
      if (spec.decisive) expect(spec.thresholds[spec.decisive.limit], spec.id).toBeDefined();
      if (spec.stars) expect(spec.frozen, spec.id).not.toBeNull();
    }
  });
  it('the legal-action probe of the cheese search walks a level\'s whole site list when asked for the full list', () => {
    const env = new Env(GAME); env.reset({ seed: 1, level: 'L01' });
    const names = new Set(env.legalActions(true).map((a) => a.name));
    expect(names.has('placeHut')).toBe(true); expect(names.has('setSpeed')).toBe(true);   // layCable is probe-filtered until the hut stands
    env.step({ name: 'placeHut', args: [120] }); expect(new Set(env.legalActions(true).map((a) => a.name)).has('layCable')).toBe(true);
    const free = new Env(GAME); free.reset({ seed: 1 });
    expect(new Set(free.legalActions(true).map((a) => a.name)).has('placeHut')).toBe(false);
  });
});

describe.each(REGION_IDS)('authored levels in region %s', (region) => {
  describe.each(LEVEL_SPECS.map((s) => [s.id, s] as const))('%s', (_id, spec) => {
    const th = thFor(spec, region);

    it('idle fails: a player who only lets the clock run does not win', () => {
      const env = new Env({ ...GAME }); env.reset({ seed: 1, level: spec.id, region });
      for (let i = 0; i < spec.maxTicks + 2 && env.state.status === 'playing'; i++) env.step(TICK);
      expect(env.state.status).toBe('lost');
    });

    it('star targets are monotone: the three-lamp cost target is never looser than the two-lamp one (B <= A)', () => {
      const fz = spec.frozen?.[region as 'global' | 'in'];
      if (fz) expect(fz.starB).toBeLessThanOrEqual(fz.starA + 1e-9);
    });
    it('the naive build fails with its declared kind, before 80 % of the run, by >= 2 % of the decisive quantity', () => {
      const o = outcomeOf(spec, region, 'naive');
      expect(o.rejected).toBeNull();
      expect(o.status).toBe('lost');
      expect(o.failKind).toBe(spec.naive.failKind);
      if (spec.horizonBlocks !== null && spec.naive.failKind !== 'timeout') expect(o.ticks).toBeLessThanOrEqual(0.8 * spec.horizonBlocks);
      if (spec.decisive) {
        const v = o.track[spec.decisive.key] ?? NaN, limit = th[spec.decisive.limit]!;
        if (spec.decisive.dir === 'min') expect(v, 'decisive quantity of the naive build').toBeLessThanOrEqual(limit * (1 - MARGIN));
        else expect(v, 'decisive quantity of the naive build').toBeGreaterThanOrEqual(limit * (1 + MARGIN));
      }
    });

    it('the lesson build passes by >= 2 % of the decisive quantity', () => {
      const o = outcomeOf(spec, region, 'lesson');
      expect(o.rejected).toBeNull();
      expect(o.status, o.reason).toBe('won');
      if (spec.stars) expect(o.stars).toBeGreaterThanOrEqual(1);
      if (spec.decisive) {
        const v = o.track[spec.decisive.key] ?? NaN, limit = th[spec.decisive.limit]!;
        if (spec.decisive.dir === 'min') expect(v, 'decisive quantity of the lesson build').toBeGreaterThanOrEqual(limit * (1 + MARGIN));
        else expect(v, 'decisive quantity of the lesson build').toBeLessThanOrEqual(limit * (1 - MARGIN));
      }
    });

    const gap = KNOWN_STAR_GAPS[`${spec.id}:${region}`];
    (gap ? it.skip : it)(`the reference build earns three stars (a scene without stars just completes) within the budget${gap ? ` [KNOWN GAP: ${gap}]` : ''}`, () => {
      const o = outcomeOf(spec, region, 'reference');
      expect(o.rejected).toBeNull();
      expect(o.status, o.reason).toBe('won');
      if (spec.stars) {
        expect(o.stars).toBe(3);
        const f = spec.frozen![region]!;
        expect(o.capex).toBeLessThanOrEqual(f.budget); expect(o.capex).toBeLessThanOrEqual(f.starB + 1e-6);
        expect(outcomeOf(spec, region, 'lesson').capex).toBeLessThanOrEqual(f.budget);
        for (const key of spec.star3.map((c) => c.key)) expect(o.track[key], key).toBeDefined();
      } else expect(o.stars).toBe(0);
    });

    (gap ? it.skip : it)('the lesson build is not a three-star build unless it is the reference (the third star needs more than the lesson)', () => {
      if (!spec.stars || spec.star3.length === 0) return;
      const l = outcomeOf(spec, region, 'lesson'), r = outcomeOf(spec, region, 'reference');
      if (JSON.stringify(spec.lesson) !== JSON.stringify(spec.reference)) expect(l.stars).toBeLessThan(r.stars);
    });

    if (spec.frozen) {
      it('frozen targets are pinned to the regenerated bot population (drift <= 2 %), budget rule holds', () => {
        const pop = botPopulation(spec, region), f = spec.frozen![region]!;
        near(f.budget, pop.budget, 0.02); near(f.starA, pop.starA, 0.02); near(f.starB, pop.starB, 0.02);
        expect(f.budget).toBeGreaterThanOrEqual((spec.budgetOverCheapest ?? 1.3) * pop.cheapestPass);   // DESIGN 9.4 item 6 (a finale may tighten it to force a choice, never under 1.1)
        expect(spec.budgetOverCheapest ?? 1.3).toBeGreaterThanOrEqual(1.1);
        expect(pop.passing).toBeGreaterThan(0);
        // "everything maxed" is over budget, unless the dearest design is the reference itself
        const dearest = Math.max(...[...designs(spec)].map((d) => runDesign(spec, region, d.actions, { frozen: null }).capex));
        if (dearest > outcomeOf(spec, region, 'reference').capex + 1e-6) {
          expect(dearest).toBeGreaterThan(f.budget);
          const worst = [...designs(spec)].map((d) => ({ d, o: runDesign(spec, region, d.actions) })).filter((x) => x.o.capex > f.budget);
          expect(worst.length).toBeGreaterThan(0);
          for (const x of worst) { expect(x.o.status).toBe('lost'); expect(x.o.failKind, 'a design over budget is lost for the budget').toBe('budget'); }
        }
      });
    }
  });
});

describe('core solvability harness on the authored levels', () => {
  it.each(REGION_IDS)('in %s: the solver passes, idling does not, and no 2-action win exists even over the whole site list', (region) => {
    const ids = new Set(LEVEL_SPECS.map((l) => l.id));
    const reports = checkAllLevels(GAME, { seed: 1, full: true, region }).filter((r) => ids.has(r.level));
    expect(reports.length).toBe(LEVEL_SPECS.length);
    // P0 is a one-action scene: given its whole site list, random play closes line 7 and so wins, by design
    for (const r of reports) expect(r.problems.filter((p) => !(r.level === 'P0' && /random play wins/.test(p))), r.level).toEqual([]);
  });
  it('L07: without capacitors and without the reconductor nothing passes (the lesson is not bypassable)', () => {
    const L07 = specOf('L07')!;
    const bypass = [...designs(L07)].filter((d) => d.actions.every((a) => a.name !== 'placeShunt' && a.name !== 'stringLine'));
    expect(bypass.length).toBe(1);
    for (const region of REGION_IDS) expect(runDesign(L07, region, bypass[0]!.actions).status).toBe('lost');
  });
});

describe('numbers tied to tools/oracles/expected.json', () => {
  it('L03: the engine\'s far-end voltage and exact line loss are the oracle table for 25 / 35 / 50 mm2 at 380 V', () => {
    const L03 = specOf('L03')!;
    for (const [mm2, key] of [[25, '25mm2'], [35, '35mm2'], [50, '50mm2']] as const) {
      const o = runDesign(L03, 'global', [{ name: 'placeConverters', args: [true] }, { name: 'layCable', args: ['main', mm2] }], { frozen: null });
      const e = expected.levels.L03.cables[key];
      near(o.track.vLoadMinV!, e.V_far_V, 1e-6); near(o.track.lossPct!, e.loss_pct_exact, 1e-6);
      expect(o.status === 'won', `${mm2} mm2 passes iff loss <= 5 %`).toBe(e.loss_pct_exact <= 5);
    }
    expect(expected.levels.L03.cables['25mm2'].loss_pct_naive).toBeLessThan(5.1);   // the quick (P/V)^2 R estimate would have passed 25 mm2: the engine's number is the exact one
  });
  it('L01: the naive path and the lesson builds are oracles G-01b and G-02', () => {
    const L01 = specOf('L01')!;
    const run = (hut: number, mm2: number): Outcome => runDesign(L01, 'global', [{ name: 'placeHut', args: [hut] }, { name: 'layCable', args: ['main', mm2] }], { frozen: null });
    const naive = run(300, 2.5);
    expectOracle('G-01b', 'Vload_V', naive.track.vLoadMinV!); expectOracle('G-01b', 'loss_pct', naive.track.lossPct!);
    const a = run(300, 25), b = run(120, 10);
    expectOracle('G-02', 'V_25mm', a.track.vLoadMinV!); expectOracle('G-02', 'loss_pct_25mm', a.track.lossPct!);
    expectOracle('G-02', 'V_10mm', b.track.vLoadMinV!);
    expect(a.status).toBe('won'); expect(b.status).toBe('won');   // the design's own lesson builds do pass, with a thin margin (the authored lesson is thicker)
  });
  it('L07: the Q_c rule, and the two-bus case at the evening peak with and without 900 kVAr, are the oracle numbers', () => {
    const tan = (pf: number): number => Math.sqrt(1 - pf * pf) / pf;
    const p = MILL.peakMW + 0.5, q = MILL.peakMW * tan(MILL.pf) + 0.5 * tan(0.95);
    near(p * (q / p - tan(0.95)), expected.levels.L07.Qc_rule_MVAr, 1e-6);
    const L07 = specOf('L07')!;
    const atPeak = (caps: boolean): { amps: number; v: number } => {
      const env = new Env(GAME); env.reset({ seed: 1, level: 'L07', region: 'global' });
      (env.state as GridState).branches[0]!.ratingMVA = 1e4;   // observe the peak without the trip
      if (caps) for (const a of L07.lesson) expect(env.step(a).info.ok).toBe(true);
      env.engine.act('tick', [80]);   // 20:00: mill at full load, village at its peak
      const bi = env.engine.q('branchInfo', ['T1']) as { currentKA: number }, bus = env.engine.q('busInfo', ['B2']) as { vPu: number };
      return { amps: bi.currentKA * 1000, v: bus.vPu };
    };
    const none = atPeak(false), cap = atPeak(true), o = expected.levels.L07;
    near(none.amps, o.nocap.I_A, 0.005); expect(Math.abs(none.v - o.nocap.V_pu)).toBeLessThan(5e-4);
    near(cap.amps, o.cap900.I_A, 0.005); expect(Math.abs(cap.v - o.cap900.V_pu)).toBeLessThan(5e-4);
    near(none.amps / 115, o.nocap.loading, 0.005); near(cap.amps / 115, o.cap900.loading, 0.005);
    // the lesson bank is the catalogue step that covers the rule, rounded up
    expect(0.9).toBeGreaterThan(o.Qc_rule_MVAr);
  });
});

describe('pack-symbol thresholds', () => {
  it('L07 reads its mill-bus limit from the region pack grid code, per mode, never from a literal', () => {
    const L07 = specOf('L07')!;
    for (const id of REGION_IDS) {
      const p = simParamsOf((REGIONS.get(id) as { data: GridRegionData }).data);
      expect(resolveThresholds(L07, p, 'learner').loadBusMinPu).toBe(voltageBand(p, 11, 'learner')[0]);
      expect(resolveThresholds(L07, p, 'engineer').loadBusMinPu).toBe(voltageBand(p, 11, 'engineer')[0]);
    }
    expect(L07.thresholds.loadBusMinPu).toEqual({ symbol: 'busBandLoPu', kv: 11 });
    const env = new Env(GAME); env.reset({ seed: 1, level: 'L07', region: 'in' });
    expect((env.engine.q('levelInfo') as { thresholds: Record<string, number> }).thresholds.loadBusMinPu).toBeCloseTo(0.94, 9);
  });
});

describe('allowed parts and the part gate', () => {
  it('a level only accepts its parts; free play is untouched', () => {
    const env = new Env(GAME); env.reset({ seed: 1, level: 'L07', region: 'global' });
    const bad = env.engine.act('placeShunt', ['B2', 'statcom-100', 1]); expect(bad.ok).toBe(false); expect(bad.key).toBe('level.part.notAllowed');
    const no = env.engine.act('shedLoad', ['L1', 1]); expect(no.ok).toBe(false); expect(no.key).toBe('level.action.notAllowed');
    expect(env.engine.act('placeShunt', ['B2', 'cap-11-900', 1]).ok).toBe(true);
    expect(env.engine.act('setSpeed', [2]).ok).toBe(true);
    const free = new Env(GAME); free.reset({ seed: 1 });
    expect(free.engine.act('placeBus', [1, 1, 11, 'gen', 1.0]).ok).toBe(true);
  });
  it('P0: the only legal action is closing line 7', () => {
    const env = new Env(GAME); env.reset({ seed: 1, level: 'P0' });
    expect(env.engine.act('switchBranch', ['T1', false]).key).toBe('level.part.notAllowed');
    expect(env.engine.act('placeBus', [1, 1, 11, 'gen', 1]).key).toBe('level.action.notAllowed');
    expect(env.engine.act('switchBranch', ['T5', true]).ok).toBe(true);
  });
  it('bench actions teach: range, order, sizes, which level offers what', () => {
    const env = new Env(GAME); env.reset({ seed: 1, level: 'L01' });
    expect(env.engine.act('placeHut', [50]).key).toBe('bench.hutRange');
    expect(env.engine.act('layCable', ['main', 25]).key).toBe('bench.hutFirst');
    expect(env.engine.act('placeHut', [120]).ok).toBe(true);
    expect(env.engine.act('layCable', ['main', 3]).key).toBe('level.part.notAllowed');
    expect(env.engine.act('placeConverters', [true]).key).toBe('level.action.notAllowed');
    const l2 = new Env(GAME); l2.reset({ seed: 1, level: 'L02' });
    expect(l2.engine.act('placeHut', [120]).key).toBe('level.action.notAllowed');
    expect(l2.engine.act('placeJunction').ok).toBe(true);
    const l3 = new Env(GAME); l3.reset({ seed: 1, level: 'L03' });
    expect(l3.engine.act('placeConverters', ['yes']).key).toBe('bench.convArg');
    const st = l3.engine.q('benchStatus') as { active: boolean; powered: boolean; reason: string };
    expect(st.active).toBe(true); expect(st.powered).toBe(false); expect(st.reason).toMatch(/not complete/);
  });
});

describe('P0 The Night the Lights Went Out', () => {
  it('closing line 7 starts the real cascade: overload trip, motors stall, units trip, blackout; no stars; idle leaves the grid quiet', () => {
    const P0 = specOf('P0')!;
    for (const region of REGION_IDS) {
      const o = runDesign(P0, region, P0.reference);
      expect(o.status).toBe('won'); expect(o.stars).toBe(0);
      const log = o.state.events.log;
      expect(new Set(log.map((e) => e.element)).size, 'distinct elements lost').toBeGreaterThanOrEqual(3);
      expect(o.state.metrics.track.overloadTrips, 'the first domino is a thermal overload').toBeGreaterThanOrEqual(1);
      expect(log[0]!.element).toBe('T4');
      expect(log.some((e) => e.causeKey === 'freq.blackout')).toBe(true);
      expect(o.state.block.blackout).toBe(true);
      const idle = runDesign(P0, region, []);
      expect(idle.status).toBe('lost'); expect(idle.state.events.log).toEqual([]); expect(idle.state.metrics.track.overloadTrips ?? 0).toBe(0);
    }
  });
});

describe('coach', () => {
  it('steps advance from real state only: the reference run walks them in order and ends done; the first step shows at the start', () => {
    for (const spec of LEVEL_SPECS) {
      const env = new Env(GAME); env.reset({ seed: 1, level: spec.id });
      const q = (): { id: string | null; index: number; done: boolean } => env.engine.q('coach') as never;
      expect(q().id, spec.id).toBe(spec.coach[0]!.id);
      let last = 0;
      const seen: string[] = [q().id!];
      for (const a of spec.reference) { env.step(a); const c = q(); expect(c.index).toBeGreaterThanOrEqual(last); last = c.index; if (c.id && c.id !== seen[seen.length - 1]) seen.push(c.id); }
      for (let i = 0; i < spec.maxTicks + 2 && env.state.status === 'playing'; i++) { env.step(TICK); const c = q(); expect(c.index).toBeGreaterThanOrEqual(last); last = c.index; if (c.id && c.id !== seen[seen.length - 1]) seen.push(c.id); }
      expect(q().done, `${spec.id} ends with the coach done`).toBe(true);
      expect(seen, spec.id).toEqual(spec.coach.map((c) => c.id).filter((id) => seen.includes(id)));
    }
  });
  it('a fresh game or free play has no coach', () => {
    expect((new Env(GAME).engine.q('coach') as { active: boolean }).active).toBe(false);
  });
});

describe('histogram population (bot stub)', () => {
  it('is labelled as a bot population and uses real engine scores of the whole site list', () => {
    for (const region of REGION_IDS) {
      const L01 = specOf('L01')!, pop = botPopulation(L01, region);
      expect(pop.label).toBe('bot'); expect(pop.labelKey).toBe('hist.bot'); expect(en['hist.bot']).toMatch(/offline sample/);
      expect(pop.designs).toBe(56); expect(pop.passing).toBeGreaterThan(10);
      expect(pop.scores).toEqual([...pop.scores].sort((a, b) => a - b));
      expect(pop.metric).toBe('capex');
      const l03 = botPopulation(specOf('L03')!, region);
      expect(l03.metric).toBe('lossPct'); expect(l03.scores.every((x) => x <= 5)).toBe(true);
    }
  });
  it('the result card plots bots until 20 verified players exist; star targets are unaffected', () => {
    const pop = botPopulation(specOf('L01')!, 'global');
    const bots = resultHistogram(pop, [], 1170);
    expect(bots.source).toBe('bot'); expect(bots.labelKey).toBe('hist.bot'); expect(bots.n).toBe(pop.scores.length);
    expect(bots.bins.reduce((a, b) => a + b.count, 0)).toBe(pop.scores.length); expect(bots.percentile).not.toBeNull();
    const few = resultHistogram(pop, Array.from({ length: MIN_VERIFIED_FOR_PLAYER_HISTOGRAM - 1 }, (_, i) => 1000 + i), 1200);
    expect(few.source).toBe('bot');
    const many = resultHistogram(pop, Array.from({ length: MIN_VERIFIED_FOR_PLAYER_HISTOGRAM }, (_, i) => 1000 + i), 1200);
    expect(many.source).toBe('players'); expect(many.labelKey).toBeNull(); expect(many.n).toBe(MIN_VERIFIED_FOR_PLAYER_HISTOGRAM);
    expect(botPopulation(specOf('L01')!, 'global').starA).toBe(pop.starA);
  });
  it('helpers: percentile interpolates, niceUp rounds a budget up to two figures', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3); expect(percentile([10, 20], 0.15)).toBeCloseTo(11.5, 9); expect(percentile([], 0.5)).toBe(0);
    expect(niceUp(3960)).toBe(4000); expect(niceUp(31680)).toBe(32000); expect(niceUp(39600)).toBe(40000); expect(niceUp(0)).toBe(0);
  });
});
