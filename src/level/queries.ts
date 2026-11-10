// Read-only queries of the level framework: what the level is (for the brief and result card), the coach's current step, the bench's
// numbers (what the Inspector shows: voltage, current, loss share, cost) and the population stub's histogram.
import type { QueryFn } from '@core/kit';
import { t } from '../i18n';
import type { GridState } from '../types';
import { benchCost, solveBench, type BenchParams } from './bench';
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
        histogram: spec.histogram, horizonBlocks: spec.horizonBlocks, sites: spec.sites.map((x) => ({ id: x.id, options: x.options.map((o) => o.id) })),
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
  };
}
