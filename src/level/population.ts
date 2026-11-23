// The histogram population (DESIGN 2.6, 9.3): scores of "bot" designs, used by the result card until a level has 20 verified player
// solutions (then the leaderboard's real players replace it). THIS IS A STUB SEARCHER: it enumerates the level's finite site list
// exhaustively (every design the beam search of M3 could reach) and plays each on the real engine, so the numbers are real engine
// scores, but the population is bots and every result carries `label: 'bot'` so the UI must say so ("Bot population (offline estimate)").
// The star targets are frozen into the level files from this population (A = median of passing designs, B = 15th percentile of the
// passing designs that also meet the third-star conditions) and pinned by a test (drift > 2 % fails).
import type { GridLevelSpec, Frozen } from './spec';
import { designs, resolveThresholds } from './spec';
import { runDesign, type Outcome } from './run';
import { simParamsOf } from '../catalogue';
import { REGIONS } from '../regions';
import type { GridRegionData } from '../regions/data';

export const MIN_VERIFIED_FOR_PLAYER_HISTOGRAM = 20;

/** One simulated design. */
export interface BotDesign { id: string; capex: number; status: Outcome['status']; stars3: boolean; metric: number }

export interface BotPopulation {
  /** Always 'bot': this is not a player population. */
  label: 'bot';
  labelKey: 'hist.bot';
  levelId: string;
  region: string;
  metric: 'capex' | 'lossPct' | 'score';
  metricKey: 'hist.metric.capex' | 'hist.metric.lossPct' | 'hist.metric.score';
  /** Designs simulated, designs that pass within the budget, and their metric values (ascending). */
  designs: number;
  passing: number;
  scores: number[];
  /** Cheapest design that passes at all (ignoring the budget): the budget rule needs budget >= 1.3 x this. */
  cheapestPass: number;
  /** Frozen-target inputs: budget, star A (median) and star B (15th percentile) of the primary metric (build cost). */
  budget: number;
  starA: number;
  starB: number;
}

/** Round up to two significant figures (a budget a designer would print), or to `figures`. */
export function niceUp(x: number, figures = 2): number {
  if (!(x > 0)) return 0;
  let top = 1;
  for (let i = 0; i < figures; i++) top *= 10;   // exact powers of ten (no `**`: determinism.test)
  const low = top / 10;
  let mag = 1;
  while (x / mag >= top) mag *= 10;
  while (x / mag < low) mag /= 10;
  return Math.ceil(x / mag - 1e-9) * mag;
}
/** Budget rule: 10 % above the dearer of the lesson and reference builds, and never under 1.3 x the cheapest pass; rounded up. */
export const BUDGET_HEADROOM = 1.1;
/** DESIGN 9.4 item 6: the budget is at least 1.3 x the cheapest design that passes. */
export const MIN_BUDGET_OVER_CHEAPEST = 1.3;

/** Linear-interpolated percentile (p in 0..1) of a sorted list. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const k = (sorted.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (k - lo);
}

/** Does an outcome meet the level's third-star conditions (tracked metrics against the thresholds)? */
function meetsStar3(spec: GridLevelSpec, th: Record<string, number>, o: Outcome): boolean {
  return spec.star3.filter((c) => !spec.botIgnoreStar3?.includes(c.key)).every((c) => { const v = o.track[c.key]; return v !== undefined && (c.min === undefined || v >= th[c.min]! - 1e-12) && (c.max === undefined || v <= th[c.max]! + 1e-12); });
}

/** The bot population of a level in a region (exhaustive over the site list; <= a few seconds per level). */
export function botPopulation(spec: GridLevelSpec, region: string): BotPopulation {
  if (!spec.histogram) throw new Error(`level ${spec.id} has no histogram`);
  const th = resolveThresholds(spec, simParamsOf((REGIONS.get(region) as { data: GridRegionData }).data), 'learner');
  const all: BotDesign[] = [];
  const id = (pick: number[]): string => pick.map((p, i) => spec.sites[i]!.options[p]!.id).join('+');
  for (const d of designs(spec)) {
    const o = runDesign(spec, region, d.actions, { frozen: null });
    all.push({ id: id(d.pick), capex: o.capex, status: o.status, stars3: o.status === 'won' && meetsStar3(spec, th, o), metric: spec.histogram === 'lossPct' ? o.track.lossPct ?? 100 : spec.histogram === 'score' ? o.track.score ?? 1e9 : o.capex });
  }
  const costOf = (actions: GridLevelSpec['lesson']): number => runDesign(spec, region, actions, { frozen: null }).capex;
  const cheapest = Math.min(...all.filter((d) => d.status === 'won').map((d) => d.capex));
  const budget = niceUp(Math.max((spec.budgetHeadroom ?? BUDGET_HEADROOM) * Math.max(costOf(spec.lesson), costOf(spec.reference)), (spec.budgetOverCheapest ?? MIN_BUDGET_OVER_CHEAPEST) * cheapest), spec.budgetFigures ?? 2);
  const pass = all.filter((d) => d.status === 'won' && d.capex <= budget + 1e-9);
  const starVal = (d: BotDesign): number => (spec.histogram === 'score' ? d.metric : d.capex);   // chapter 7's score levels: the stars measure the score, the budget stays the build cost
  const costs = pass.map(starVal).sort((a, b) => a - b);
  const star3 = pass.filter((d) => d.stars3).map(starVal).sort((a, b) => a - b);
  return {
    label: 'bot', labelKey: 'hist.bot', levelId: spec.id, region, metric: spec.histogram, metricKey: spec.histogram === 'lossPct' ? 'hist.metric.lossPct' : spec.histogram === 'score' ? 'hist.metric.score' : 'hist.metric.capex',
    designs: all.length, passing: pass.length, cheapestPass: cheapest, scores: pass.map((d) => d.metric).sort((a, b) => a - b),
    // A >= B always: when the only three-star designs cost more than the median (L03: lower losses need more copper), the two-star
    // target rises to B, so a lamp never rewards spending more while missing the cheaper target (found by a play-tester, 2026-11-10).
    budget, starB: percentile(star3.length ? star3 : costs, 0.15), starA: Math.max(percentile(costs, 0.5), percentile(star3.length ? star3 : costs, 0.15)),
  };
}

export interface HistogramBin { from: number; to: number; count: number }
export interface ResultHistogram {
  /** 'players' once >= 20 verified solutions exist, else 'bot'. */
  source: 'players' | 'bot';
  /** Locale key of the label the card must show for a bot histogram; null for players. */
  labelKey: 'hist.bot' | null;
  metricKey: BotPopulation['metricKey'];
  bins: HistogramBin[];
  n: number;
  /** Where the player's own score falls (fraction of the population at or below it), or null. */
  percentile: number | null;
}

/** What the result card plots: the verified players when there are enough, else the labelled bot population (star targets never move). */
export function resultHistogram(bot: BotPopulation, verified: number[], mine: number | null, bins = 10): ResultHistogram {
  const players = verified.length >= MIN_VERIFIED_FOR_PLAYER_HISTOGRAM;
  const scores = [...(players ? verified : bot.scores)].sort((a, b) => a - b);
  const lo = scores[0] ?? 0, hi = scores[scores.length - 1] ?? 0, w = (hi - lo) / bins || 1;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: 0 }));
  for (const v of scores) out[Math.min(bins - 1, Math.floor((v - lo) / w))]!.count += 1;
  return { source: players ? 'players' : 'bot', labelKey: players ? null : 'hist.bot', metricKey: bot.metricKey, bins: out, n: scores.length, percentile: mine === null || scores.length === 0 ? null : scores.filter((v) => v <= mine).length / scores.length };
}
export type { Frozen };
