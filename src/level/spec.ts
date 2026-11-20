// The GRID level spec over core's `Level` (M2.1). A level is DATA: where the player may build (the site list), which parts are allowed,
// thresholds as numbers or region-pack symbols, the naive / lesson / reference builds, the frozen star targets per region, and the coach
// steps. `makeLevel` turns a spec into a core `Level` (setup, goal, fail, solver); `allowedGate` enforces the part list on the actions;
// tests and the bot-population stub (population.ts) read the same spec, so the spec is the single source of what a level is.
import type { Action, ActionFn, Level, PersonaFactory } from '@core/kit';
import type { RegionPack } from '@core/regions';
import { t } from '../i18n';
import { NO_RULES, ruleFail, ruleGoal } from '../rules';
import { voltageBand, type SimParams } from '../sim/params';
import type { GridRegionData } from '../regions/data';
import { catalogueViewOf, simParamsOf, benchParamsOf, routeParamsOf } from '../catalogue';
import { buildRouteActions } from '../route-actions';
import { buildFreqActions } from '../freq-actions';
import type { CatalogueView } from '../sim/build';
import { buildActions } from '../actions';
import type { GridState, Rules } from '../types';
import type { BenchParams } from './bench';

/** Region-pack symbols a threshold can name: resolved from the pack's grid code (never a literal that could differ per region). */
export type PackSymbol = 'busBandLoPu' | 'busBandHiPu' | 'ufls1Hz' | 'standardLoHz' | 'standardHiHz' | 'coalMinPct';
export type Threshold = number | { symbol: PackSymbol; /** nominal kV of the bus the band is read for (voltage symbols) */ kv?: number; /** added to the symbol's value (frequency symbols: e.g. ufls1Hz + 0.2) */ add?: number; /** multiplies the symbol's value before `add` is added (a threshold tuned per pack) */ scale?: number };

/** One build the player could make at a site: a list of actions (empty = leave the site alone). */
export interface DesignOption { id: string; actions: Action[] }
/** A site of the level's site list: exactly one option is chosen per site, which keeps the design space finite (DESIGN 9.3). */
export interface Site { id: string; options: DesignOption[] }

/** What the player may use: the actions beyond setSpeed/predict, and per action the catalogue ids (or sizes) it may be given. */
export interface AllowedParts { actions: string[]; parts: Record<string, (string | number)[]> }

/** Targets frozen from the bot population of a region (primary metric in the pack currency): budget, star A (median), star B (15th percentile). */
export interface Frozen { budget: number; starA: number; starB: number }

/** Coach step (DESIGN 7.2): advances from real state, never from a timer. */
export interface CoachStep { id: string; textKey: string; whyKey: string; done: (s: Readonly<GridState>) => boolean }

/** Which metric the result card's histogram plots. */
export type HistogramMetric = 'capex' | 'lossPct' | 'score';

export interface ScaffoldCtx {
  /** Actions bound to the region's catalogue (the same ones the player uses), including buildRoute so a later job can rebuild the district its player already built. */
  A: Record<string, ActionFn<GridState>>;
  params: SimParams;
  /** The region pack id the level is being set up in (a scenario that differs per pack: L28's national tie). */
  region: string;
  bench: BenchParams;
  /** The region's catalogue (a level that needs a catalogue value, e.g. the low-voltage side of the distribution transformers). */
  cat: CatalogueView;
  /** Thresholds resolved for the region and mode. */
  th: Record<string, number>;
  frozen: Frozen | null;
}

export interface GridLevelSpec {
  id: string;
  kind: 'prologue' | 'bench' | 'grid' | 'event';
  chapter: number;
  titleKey: string; briefKey: string;
  /** Concept ids the level teaches. */
  concepts: string[];
  /** Block of the day the level starts at, blocks the run lasts (null: until the goal), and the tick budget. */
  startBlock: number;
  horizonBlocks: number | null;
  maxTicks: number;
  allowed: AllowedParts;
  sites: Site[];
  /** Named thresholds: numbers or pack symbols. */
  thresholds: Record<string, Threshold>;
  /** The quantity that decides pass or fail, for the 2 % margin rule: a tracked metric, the limit (a threshold name) and its direction. */
  decisive: { key: string; limit: string; dir: 'min' | 'max' } | null;
  /** Third-star conditions on tracked metrics (limits are threshold names). */
  star3: { key: string; min?: string; max?: string }[];
  /** Conditions the second lamp needs besides spend (they carry over to the third). */
  star2?: { key: string; min?: string; max?: string }[];
  /** Lose on the first brownout block (poor supply). */
  /** Work-order flavour (GRID UI.md §6): location line, radio story beats ("SPEAKER: text"), shift-report lesson template. */
  story?: { placeKey: string; lineKeys: string[]; lessonKey: string; /** 'salt': the creepage lesson of the worst coastal support (L29); 'island': the cable and battery lesson (L30); default the sag lesson. */ lessonKind?: 'sag' | 'salt' | 'island' | 'pf' | 'harm' | 'series' | 'ch7' | 'ch8' | 'finale' };
  /** Block at which spans under their clearance rule flash over (the hot evening peak); absent = never. */
  flashoverBlock?: number;
  /** Chapter 3 rules (src/sim/ch3): harmonic study, scripted fault, supply-point tracking. */
  ch3?: import('../sim/ch3/rules').Ch3Rules;
  /** Block at which sea fog flashes over every support short of its tile's creepage (L29); absent = never. */
  fogBlock?: number;
  /** Block at which a trawler's anchor cuts every submarine cable (L30); absent = never. */
  cableCutBlock?: number;
  /** The sea distance of a submarine cable laid in this level, km (L30). */
  seaCableKm?: number;
  /** Chapter 5 extras: rules the shared pipeline reads (voltage watch, loading cap, N-1 probe, collapse), merged over the standard rules. */
  extraRules?: (th: Record<string, number>) => Partial<Rules>;
  /** Shift-report lesson and incident-report "what to try" in the player's own numbers (grid levels that are not route levels). */
  lessonText?: (s: GridState, p: SimParams, th: Record<string, number>) => string;
  tryText?: (s: GridState, p: SimParams, th: Record<string, number>) => string;
  brownoutLoses: boolean;
  blackoutLoses: boolean;
  /** Stars awarded (false: a scene such as the prologue). */
  stars: boolean;
  histogram: HistogramMetric | null;
  /** Chapter 7: what the 'score' histogram and the two star targets measure (lower is better): pack currency (default), seconds (L24, L33) or percent (L36). */
  scoreUnit?: 'money' | 's' | 'pct';
  /** Chapter 7: third-star tracked keys the bot population never earns (bots do not predict), so they are left out of its third-star set. */
  botIgnoreStar3?: string[];
  /** Naive build (must fail with `failKind`), lesson build (must pass), reference build (must earn three stars). */
  naive: { actions: Action[]; failKind: 'share' | 'nadir' | 'rocof' | 'freqBand' | 'brownout' | 'overvoltage' | 'collapse' | 'overload' | 'unpowered' | 'budget' | 'timeout' | 'flashover' | 'saltFlashover' | 'islandDark' | 'machine' | 'capFuse' | 'thd' | 'pfPeak' | 'breakerFail' | `ch7.${import('../sim/ch7/study').Ch7Fail}` | `ch8.${import('../sim/ch8/study').Ch8Fail}` };
  lesson: Action[];
  reference: Action[];
  /** A pack whose prices or physics reorder the designs plays its own lesson and reference (L28 in `in`: the battery is dearer than the second line). runDesign swaps them in when handed `lesson` / `reference` themselves. */
  byRegion?: Record<string, { lesson?: Action[]; reference?: Action[] }>;
  /** Targets frozen per region id (null: none, e.g. the prologue). */
  frozen: Record<string, Frozen> | null;
  coach: CoachStep[];
  /** A level-specific goal (the prologue ends in its blackout); default: the rule verdict. */
  goal?: (s: Readonly<GridState>) => boolean;
  /** Place the scenario in a fresh state. */
  place: (s: GridState, sc: ScaffoldCtx) => void;
}

// ---- thresholds -----------------------------------------------------------------------------------------------------------------
export function resolveThreshold(th: Threshold, p: SimParams, mode: string): number {
  if (typeof th === 'number') return th;
  const add = th.add ?? 0;
  if (th.symbol === 'coalMinPct') return (p.coalMinPct ?? 40) * (th.scale ?? 1) + add;
  if (th.symbol === 'ufls1Hz') return Math.max(...p.gridcode.ufls.map((u) => u.hz)) + add;   // the first (highest) UFLS stage of the pack's grid code
  if (th.symbol === 'standardLoHz') return p.gridcode.standardRangeHz[0] + add;
  if (th.symbol === 'standardHiHz') return p.gridcode.standardRangeHz[1] + add;
  const [lo, hi] = voltageBand(p, th.kv ?? 0, mode);
  return th.symbol === 'busBandLoPu' ? lo : hi;
}
export function resolveThresholds(spec: GridLevelSpec, p: SimParams, mode: string): Record<string, number> {
  return Object.fromEntries(Object.entries(spec.thresholds).map(([k, v]) => [k, resolveThreshold(v, p, mode)]));
}

// ---- the core Level -------------------------------------------------------------------------------------------------------------
/** Rules the pipeline checks for this level in this region. */
export function rulesFor(spec: GridLevelSpec, th: Record<string, number>, frozen: Frozen | null): Rules {
  return {
    ...NO_RULES,
    horizonBlocks: spec.horizonBlocks,
    maxPoorSupplyMin: spec.brownoutLoses ? 0 : null,
    poorSupplyGraceMin: spec.kind === 'bench' ? 60 : 0,
    blackoutLoses: spec.blackoutLoses,
    flashoverBlock: spec.flashoverBlock ?? null,
    ...(spec.ch3 ? { ch3: structuredClone(spec.ch3) } : {}),   // a copy: the state owns its rules
    ...(spec.cableCutBlock !== undefined ? { cableCutBlock: spec.cableCutBlock, seaCableKm: spec.seaCableKm ?? null, darkLoadsLose: true } : {}),
    ...(spec.fogBlock !== undefined ? { fogBlock: spec.fogBlock, darkLoadsLose: true } : {}),   // absent keys elsewhere: the other levels' states and goldens stay as they were
    ...(spec.extraRules ? spec.extraRules(th) : {}),
    starCost: spec.stars && frozen ? [frozen.starA, frozen.starB] : null,
    starBasis: spec.histogram === 'score' ? 'score' : 'capex',
    star3: spec.star3.map((c) => ({ key: c.key, min: c.min !== undefined ? th[c.min]! : null, max: c.max !== undefined ? th[c.max]! : null })),
    ...(spec.star2 ? { star2: spec.star2.map((c) => ({ key: c.key, min: c.min !== undefined ? th[c.min]! : null, max: c.max !== undefined ? th[c.max]! : null })) } : {}),
  };
}

export function makeLevel(spec: GridLevelSpec): Level<GridState> {
  const solver: PersonaFactory<GridState> = () => {
    let done = false;
    return (s) => { if (done) return []; done = true; return spec.byRegion?.[(s as Readonly<GridState>).region]?.reference ?? spec.reference; };   // a pack may have its own reference (L28 in `in`: the national tie makes the line the cheapest pass)
  };
  return {
    id: spec.id, title: t(spec.titleKey), brief: t(spec.briefKey, Object.fromEntries(Object.entries(spec.thresholds).filter(([, v]) => typeof v === 'number')) as Record<string, number>), concepts: spec.concepts,
    setup: (s, ctx) => {
      const pack = ctx.region as RegionPack<GridRegionData>;
      const params = simParamsOf(pack.data), cat = catalogueViewOf(pack.data);
      const th = resolveThresholds(spec, params, s.mode);
      const frozen = spec.frozen ? spec.frozen[pack.id] ?? null : null;
      if (spec.stars && spec.frozen && !frozen) throw new Error(`level ${spec.id} has no frozen targets for region '${pack.id}'`);
      const A = { ...buildActions({ cat: () => cat, getParams: () => params, money: () => '' }), ...buildRouteActions({ cat: () => cat, getRoute: () => routeParamsOf(pack.data), money: () => '' }), ...buildFreqActions({ cat: () => cat, money: () => '' }) };
      const mode = s.mode; s.mode = 'sandbox';   // the scenario places the town's loads, which only sandbox may do
      spec.place(s, { A, region: pack.id, params, bench: benchParamsOf(pack.data), cat, th, frozen });
      s.mode = mode;
      s.actionLog = []; s.budget.spent = s.bench ? s.budget.spent : 0; delete s.purchases;   // what the scenario placed is not the player's to refund
      if (frozen) s.budget.capexLimit = frozen.budget;
      s.rules = rulesFor(spec, th, frozen);
      s.clock.block = spec.startBlock; s.tick = spec.startBlock;
    },
    goal: spec.goal ?? ruleGoal,
    fail: ruleFail,
    maxTicks: spec.maxTicks,
    solver,
  };
}

// ---- the allowed-parts gate -----------------------------------------------------------------------------------------------------
/** Argument position of the catalogue id (or size) of an action the part list can restrict. */
const PART_ARG: Record<string, number> = { placeUnit: 0, stringLine: 2, placeTransformer: 2, placeShunt: 1, placeStorage: 1, layCable: 1, layCableRoute: 2, switchBranch: 0, buildRoute: 2, placeBank: 1, placeSeriesCap: 1 };
/** Further restricted arguments, listed in `allowed.parts` under `<action>.<name>` (a null value, e.g. no crossing family, is always fine). */
const EXTRA_PART_ARG: Record<string, { pos: number; name: string }[]> = { placeBank: [{ pos: 3, name: 'detunePct' }], buildRoute: [{ pos: 3, name: 'family' }, { pos: 4, name: 'crossing' }, { pos: 7, name: 'insulator' }, { pos: 8, name: 'coastInsulator' }] };
const ALWAYS = new Set(['setSpeed', 'predict', 'coachCarry']);

/** Wrap the game's actions so a running level only accepts what its spec allows. Free play (no level) is untouched. */
export function allowedGate(actions: Record<string, ActionFn<GridState>>, specOf: (id: string) => GridLevelSpec | undefined): Record<string, ActionFn<GridState>> {
  const out: Record<string, ActionFn<GridState>> = {};
  for (const [name, fn] of Object.entries(actions)) {
    out[name] = (s, ...args) => {
      const spec = s.level ? specOf(s.level) : undefined;
      if (spec && !ALWAYS.has(name)) {
        if (!spec.allowed.actions.includes(name)) { const key = 'level.action.notAllowed'; return { ok: false, message: t(key, { action: name, level: spec.id }), key, params: { action: name, level: spec.id } }; }
        const pos = PART_ARG[name], list = spec.allowed.parts[name];
        if (pos !== undefined && list && !list.map(String).includes(String(args[pos]))) { const key = 'level.part.notAllowed'; const params = { part: String(args[pos]), level: spec.id }; return { ok: false, message: t(key, params), key, params }; }
        const maxSteps = spec.allowed.parts['placeShunt.maxSteps']?.[0];   // chapter 5: a level can cap the number of bank steps (an omitted count means the catalogue's maximum, so it counts as unlimited)
        if (name === 'placeShunt' && maxSteps !== undefined && !(args[2] !== undefined && Number(args[2]) <= Number(maxSteps))) { const key = 'level.part.notAllowed'; const params = { part: t('level.part.stepsOver', { n: Number(maxSteps) }), level: spec.id }; return { ok: false, message: t(key, params), key, params }; }
        for (const x of EXTRA_PART_ARG[name] ?? []) {
          const more = spec.allowed.parts[`${name}.${x.name}`];
          if (more && args[x.pos] !== null && args[x.pos] !== undefined && !more.map(String).includes(String(args[x.pos]))) { const key = 'level.part.notAllowed'; const params = { part: String(args[x.pos]), level: spec.id }; return { ok: false, message: t(key, params), key, params }; }
        }
      }
      return fn(s, ...args);
    };
  }
  return out;
}

// ---- helpers shared by levels ---------------------------------------------------------------------------------------------------
/** Run an action in a scenario and throw if it is refused: a level file that cannot place its own scenario is a bug. */
export function place(sc: ScaffoldCtx, s: GridState, name: string, ...args: unknown[]): void {
  const fn = sc.A[name];
  if (!fn) throw new Error(`scenario: no action ${name}`);
  const r = fn(s, ...args);
  if (r && typeof r === 'object' && 'ok' in r && !r.ok) throw new Error(`scenario: ${name}(${args.join(', ')}) refused: ${r.message}`);
}

/** The first coach step whose condition does not hold yet (null when all are done). */
export function currentCoachStep(spec: GridLevelSpec, s: Readonly<GridState>): { id: string; textKey: string; whyKey: string; index: number } | null {
  const carry = s.coach.carry ?? 0;   // Retry carries the coach forward: steps the player already finished on the last attempt are not taught again
  const i = spec.coach.findIndex((c, k) => k >= carry && !c.done(s));
  const c = spec.coach[i];
  return c ? { id: c.id, textKey: c.textKey, whyKey: c.whyKey, index: i } : null;
}

/** Design = one option per site: the concatenated actions. */
export function designActions(spec: GridLevelSpec, pick: number[]): Action[] {
  return spec.sites.flatMap((site, i) => site.options[pick[i] ?? 0]!.actions);
}
/** Every design of the site list (the product of the options), up to `limit`. */
export function* designs(spec: GridLevelSpec, limit = 20000): Generator<{ pick: number[]; actions: Action[] }> {
  const n = spec.sites.length, pick = new Array<number>(n).fill(0);
  let count = 0;
  for (;;) {
    yield { pick: [...pick], actions: designActions(spec, pick) };
    if (++count >= limit) return;
    let i = n - 1;
    while (i >= 0 && ++pick[i]! >= spec.sites[i]!.options.length) { pick[i] = 0; i--; }
    if (i < 0) return;
  }
}
