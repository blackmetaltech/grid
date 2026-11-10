import { insulatorWord, kindWord } from '../route-words';
import { SPECIFIC_CREEPAGE, umKv } from '../sim/route/insulation';
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

/** Chapter 2's shift-report lesson: the sag of the line's longest span (the route with the least clearance margin if several lines stand) in the player's own numbers, then the voltage lesson.
 *  The printed sag is recomputed from the printed span, w and H so every number on the card can be checked by hand. */
export function routeLesson(s: GridState, spec: GridLevelSpec, lessonKey: string, p: SimParams): string {
  const r = s.routes.reduce((best, x) => (x.worstMarginM < best.worstMarginM ? x : best)), w = r.longest ?? r.worst;
  const f1 = (x: number): string => x.toFixed(1), f2 = (x: number): string => x.toFixed(2);
  const L = Math.round(w.lengthM), wN = Number(f2(w.wNPerM)), H = Math.round(w.hN);
  let out = t(lessonKey, { kv: r.request.kv, km: f1(r.lengthM / 1000), n: r.supports, span: L, over: kindWord(w.over), sag: f2(wN * L * L / (8 * H)), w: f2(wN), h: H, clr: f2(w.clearanceM), req: f1(w.requiredM) });
  const loads = s.loads, pMw = loads.reduce((a, l) => a + l.Ppeak, 0), sMva = loads.reduce((a, l) => a + l.Ppeak / (l.pf > 0 ? l.pf : 1), 0);
  const lv = s.buses.find((b) => b.id === loads[0]?.bus)?.kvNom ?? 0;
  if (pMw <= 0 || lv <= 0) return out;
  const pf = f2(pMw / sMva);
  if (r.request.kv > lv + 1e-9) {
    const amps = (kv: number): number => (sMva * 1e6) / (Math.sqrt(3) * kv * 1000), ratio = r.request.kv / lv;
    out += ' ' + t('level.L05.lessonKv', { mw: f2(pMw), pf, lv, kv: r.request.kv, iLow: Math.round(amps(lv)), iHigh: Math.round(amps(r.request.kv)), ratio: Math.round(ratio), heat: Math.round(ratio * ratio / 10) * 10 });
  } else {
    const v = s.metrics.track.loadVMinPu, lo = resolveThresholds(spec, p, s.mode).villageBandLoPu;
    if (v !== undefined && lo !== undefined && v < lo) out += ' ' + t('level.L05.lessonLv', { lv, v: f2(v), drop: f1((1 - v) * 100), mw: f2(pMw) });
  }
  return out;
}

/** L29's shift-report lesson: creepage = Um x mm/kV in the player's own numbers for the most exposed coastal support of the harbour line, and whether it was enough.
 *  Every printed number recomputes: need = Um x specific creepage; gap = |has - need|. Empty until a line with a coastal support stands. */
export function saltLesson(s: GridState, lessonKey: string): string {
  const r = [...s.routes].reverse().find((x) => x.coastWorst);
  const w = r?.coastWorst;
  if (!r || !w) return '';
  const cls = ['', 'I', 'II', 'III', 'IV'][w.cls] ?? String(w.cls), um = umKv(r.request.kv), spec = SPECIFIC_CREEPAGE[w.cls as 1 | 2 | 3 | 4];
  const need = Math.round(um * spec), has = w.hasMm;
  const base = t(lessonKey, { kv: r.request.kv, n: r.supports, pole: w.index + 1, sea: w.seaM, cls, spec, um, need, ins: insulatorWord(w.insulatorId), has });
  return base + ' ' + (has < need ? t('level.L29.lessonShort', { gap: need - has }) : t('level.L29.lessonOk', { gap: has - need }));
}

export function buildLevelQueries(d: LevelQueryDeps): Record<string, QueryFn<GridState>> {
  return {
    /** The running level's card: kind, thresholds resolved for this region and mode, allowed parts, star targets. */
    levelInfo: (s) => {
      const spec = s.level ? d.specOf(s.level) : undefined;
      if (!spec) return { active: false };
      return {
        active: true, id: spec.id, kind: spec.kind, chapter: spec.chapter, title: t(spec.titleKey), brief: t(spec.briefKey), stars: spec.stars,
        thresholds: resolveThresholds(spec, d.getParams(s), s.mode), frozen: d.frozenOf(spec, s.region), allowedActions: [...spec.allowed.actions],
        histogram: spec.histogram, horizonBlocks: spec.horizonBlocks, startBlock: spec.startBlock, flashoverBlock: spec.flashoverBlock ?? null, fogBlock: spec.fogBlock ?? null, fogTime: spec.fogBlock === undefined ? null : `${String(Math.floor(spec.fogBlock / 4)).padStart(2, '0')}:${String((spec.fogBlock % 4) * 15).padStart(2, '0')}`, star3: spec.star3.map((c) => c.min ?? c.max).filter((k): k is string => k !== undefined),   // threshold names that only decide the third star (the work order lists the rest as pass conditions)
        place: spec.story ? t(spec.story.placeKey) : '', story: spec.story ? spec.story.lineKeys.map((k) => t(k)) : [], lesson: (() => {   // the shift report's consolidation line, with the player's own numbers (bench: the main run)
          if (spec.story?.lessonKind === 'salt' && !s.bench) return saltLesson(s, spec.story.lessonKey);   // L29: creepage of the most exposed coastal support
          if (spec.story && !s.bench && s.routes.length > 0) return routeLesson(s, spec, spec.story.lessonKey, d.getParams(s));   // chapter 2: the longest span with the player's numbers (D = wL^2/8H)
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
