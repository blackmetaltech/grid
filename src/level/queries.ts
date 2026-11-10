// Read-only queries of the level framework: what the level is (for the brief and result card), the coach's current step, the bench's
// numbers (what the Inspector shows: voltage, current, loss share, cost) and the population stub's histogram.
import type { QueryFn } from '@core/kit';
import { t } from '../i18n';
import { formatMoney } from '@core/regions';
import { REGIONS } from '../regions';
import type { GridState } from '../types';
import { L03_LOAD_W, SOURCE_V, benchKit, benchCost, benchDetail, previewBench, solveBench, type BenchParams } from './bench';
import { currentCoachStep, resolveThresholds, type GridLevelSpec } from './spec';
import type { SimParams } from '../sim/params';

export interface LevelQueryDeps {
  specOf: (id: string) => GridLevelSpec | undefined;
  getParams: (s: GridState) => SimParams;
  getBench: (s: GridState) => BenchParams;
  /** Frozen targets of the level in the state's region (null when none). */
  frozenOf: (spec: GridLevelSpec, region: string) => { budget: number; starA: number; starB: number } | null;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function buildLevelQueries(d: LevelQueryDeps): Record<string, QueryFn<GridState>> {
  return {
    /** The running level's card: kind, thresholds resolved for this region and mode, allowed parts, star targets. */
    levelInfo: (s) => {
      const spec = s.level ? d.specOf(s.level) : undefined;
      if (!spec) return { active: false };
      return {
        active: true, id: spec.id, kind: spec.kind, chapter: spec.chapter, title: t(spec.titleKey), brief: t(spec.briefKey), stars: spec.stars,
        thresholds: resolveThresholds(spec, d.getParams(s), s.mode), frozen: d.frozenOf(spec, s.region), allowedActions: [...spec.allowed.actions],
        histogram: spec.histogram, horizonBlocks: spec.horizonBlocks, star3: spec.star3.map((c) => c.min ?? c.max).filter((k): k is string => k !== undefined),   // threshold names that only decide the third star (the work order lists the rest as pass conditions)
        place: spec.story ? t(spec.story.placeKey) : '', story: spec.story ? spec.story.lineKeys.map((k) => t(k)) : [], lesson: (() => {   // the shift report's consolidation line, with the player's own numbers (bench: the main run)
          if (!spec.story || !s.bench) return '';
          const det = benchDetail(s.bench, d.getBench(s)), run = det?.runs.find((x) => x.id === 'main');
          if (!run) return '';
          return t(spec.id === 'L02' && s.bench.topology === 'trunk' ? 'level.L02.lessonTrunk' : spec.story.lessonKey, { mm2: run.mm2, m: run.lengthM, r: run.rLoopOhm.toFixed(3), i: run.iA.toFixed(1), drop: run.dropV.toFixed(1), v: run.vRecvV.toFixed(1), loss: det!.totals.lossPct.toFixed(1),
            i48: (L03_LOAD_W / SOURCE_V).toFixed(0), k: (L03_LOAD_W / SOURCE_V / run.iA).toFixed(1), k2: ((L03_LOAD_W / SOURCE_V / run.iA) * (L03_LOAD_W / SOURCE_V / run.iA)).toFixed(0) });
        })(), sites: spec.sites.map((x) => ({ id: x.id, options: x.options.map((o) => o.id) })),
      };
    },
    /** The coach's current step (never advances on a timer: it reads the state), or done. */
    coach: (s) => {
      const spec = s.level ? d.specOf(s.level) : undefined;
      if (!spec) return { active: false };
      const c = currentCoachStep(spec, s);
      return c ? { active: true, done: false, id: c.id, index: c.index, total: spec.coach.length, text: t(c.textKey), why: t(c.whyKey) } : { active: true, done: true, id: null, index: spec.coach.length, total: spec.coach.length, text: '', why: '' };
    },
    /** The bench as built: voltages, current fraction, loss share, cost. */
    benchStatus: (s) => {
      if (!s.bench) return { active: false };
      const p = d.getBench(s), r = solveBench(s.bench, p);
      return { active: true, scenario: s.bench.scenario, powered: r.powered, vMinV: r3(r.vMinV), vLoadV: r.vLoadV.map(r3), lossPct: r3(r.lossPct), ampFracMax: r3(r.ampFracMax), cost: r3(benchCost(s.bench, p)), reason: r.reason ? t(r.reason) : null, bench: s.bench };
    },
    /** Per-run numbers of the bench as laid (SI, unrounded): runs with their equation data, and the totals. */
    /** Prices and specs the kit tray shows (money already formatted for the region pack). */
    benchKit: (s) => {
      if (!s.bench) return { active: false };
      const k = benchKit(d.getBench(s)), pack = REGIONS.get(s.region);
      return { active: true, ...k, cables: k.cables.map((c) => ({ ...c, perMText: formatMoney(c.perM, pack, { decimals: 2 }) })), budgetText: formatMoney(s.budget.capexLimit, pack, { decimals: 0 }), spentText: formatMoney(s.budget.spent, pack, { decimals: 0 }), budget: s.budget.capexLimit, spent: s.budget.spent };
    },
    benchDetail: (s) => {
      if (!s.bench) return { active: false, reason: 'bench.none' };
      const r = solveBench(s.bench, d.getBench(s)), det = benchDetail(s.bench, d.getBench(s));
      if (!det) return { active: false, reason: r.reason ?? 'bench.noSolution' };
      return { active: true, scenario: s.bench.scenario, powered: true, runs: det.runs, totals: det.totals, reason: null };
    },
    /** What-if on a copy: args [{ hutM?, mm2?, run? }]. Never mutates; illegal input gives ok:false and a locale key. */
    benchPreview: (s, arg?: unknown) => {
      const spec = s.level ? d.specOf(s.level) : undefined;
      const rules = spec ? { actions: spec.allowed.actions, sizes: (spec.allowed.parts.layCable ?? null) as readonly number[] | null } : null;
      return previewBench(s.bench ?? null, d.getBench(s), arg, rules);
    },
  };
}
