import { insulatorWord, kindWord } from '../route-words';
import { SPECIFIC_CREEPAGE, umKv } from '../sim/route/insulation';
import { islandDark } from '../sim/flashover';
import { offshoreBus, SOC_MAX, SOC_MIN } from '../sim/islandStorage';
import { chargingKvar, submarineCable } from '../data/submarine';
// Read-only queries of the level framework: what the level is (for the brief and result card), the coach's current step, the bench's
// numbers (what the Inspector shows: voltage, current, loss share, cost) and the population stub's histogram.
import type { QueryFn } from '@core/kit';
import { t } from '../i18n';
import { formatMoney } from '@core/regions';
import { REGIONS } from '../regions';
import type { GridState } from '../types';
import { L03_LOAD_W, SOURCE_V, benchKit, benchCost, benchDetail, previewBench, solveBench, type BenchParams } from './bench';
import { currentCoachStep, resolveThresholds, type GridLevelSpec } from './spec';
import { ch2Lesson, ch2TryHint } from './ch2/bench';
import { ch4Lesson, ch4TryHint } from './ch4/queries';
import { pfLesson, harmLesson, seriesLesson, ch3TryHint, isCh3 } from './ch3-queries';
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
  const tw = r.worst, tm = tw.clearanceM - tw.requiredM;   // the tightest span is the clearance gauge's number: say it, or the card contradicts the gauge (panel 2026-11-10)
  if (tw !== w && (tw.span !== w.span)) out += ' ' + t(tm < 0 ? 'level.L05.lessonTightBad' : 'level.L05.lessonTight', { span: tw.span + 1, len: Math.round(tw.lengthM), over: kindWord(tw.over), clr: f2(tw.clearanceM), req: f1(tw.requiredM), margin: f2(Math.abs(tm)) });
  if (tm < 0) return out;   // it flashed over: the voltage sentence would only distract
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

/** The incident report's "what to try" for a chapter 2 loss: the span that flashed over and what lifts it, the 0.42 kV brownout, or the budget. '' when none fits. */
export function routeTryHint(s: GridState): string {
  if (s.status !== 'lost' || s.routes.length === 0) return '';
  if ((s.metrics.track.saltFlashover ?? 0) > 0) return t('level.L29.trySalt');   // the fog found a support short of its creepage
  if (s.rules.cableCutBlock != null) return islandTryHint(s);
  const r = s.routes.reduce((best, x) => (x.worstMarginM < best.worstMarginM ? x : best)), w = r.worst;
  if (w.clearanceM < w.requiredM) return t('level.L05.tryFlash', { span: w.span + 1, short: (w.requiredM - w.clearanceM).toFixed(2), over: kindWord(w.over) });
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('level.L05.tryBudget');
  const lvLine = s.routes.some((x) => x.request.kv < 1);
  if (lvLine) return t('level.L05.tryKv');
  return '';
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

const hhmm = (block: number): string => `${String(Math.floor((block % 96) / 4)).padStart(2, '0')}:${String((block % 4) * 15).padStart(2, '0')}`;
/** The loads that stand on the offshore island's buses. */
const islandLoads = (s: GridState) => s.loads.filter((l) => { const b = s.buses.find((x) => x.id === l.bus); return !!b && offshoreBus(s, b); });

/** L30's shift-report lesson in the player's own numbers: the cable (cost per km against the district's overhead line, charging Q = V^2 w C l recomputed from its C and length, charging amps), then the battery after the cut:
 *  kWh drawn from the cells against kWh installed, the window left, and inverter kW against the island's peak. Empty until a cable is laid. */
export function islandLesson(s: GridState, lessonKey: string): string {
  const c = s.cables?.[s.cables.length - 1];
  const sc = c ? submarineCable(c.cableId) : undefined;
  if (!c || !sc) return '';
  const pack = REGIONS.get(s.region), money = (x: number): string => formatMoney(x, pack, { decimals: 0 });
  const overhead = s.routes[s.routes.length - 1]!, overPerKm = overhead.cost / (overhead.lengthM / 1000), perKm = c.cost / c.lengthKm;
  const f0 = Number(pack.data.f0), kv = sc.kv, kvar = chargingKvar(sc.cUfKm, c.lengthKm, kv, f0);
  const amps = (kvar * 1000) / (Math.sqrt(3) * kv * 1000);
  let out = t(lessonKey, { mm2: sc.mm2, km: c.lengthKm.toFixed(1), perKm: money(perKm), ratio: (perKm / overPerKm).toFixed(1), over: money(overPerKm), kvar: kvar.toFixed(1), kv, amps: amps.toFixed(1) });
  const loads = islandLoads(s), peak = Math.round(loads.reduce((a, l) => a + l.Ppeak, 0) * 1000);
  if ((s.metrics.track.cableCut ?? 0) === 0) return out + ' ' + t('level.L30.lessonWait');
  const bats = s.storage.filter((b) => { const bus = s.buses.find((x) => x.id === b.bus); return !!bus && offshoreBus(s, bus); });
  if (bats.length === 0) return out + ' ' + t('level.L30.lessonNoBattery', { peak });
  const kwh = bats.reduce((a, b) => a + b.mwh * 1000, 0), inv = bats.reduce((a, b) => a + b.mw * 1000, 0);
  const left = Math.min(...bats.map((b) => Math.max(0, Math.min(1, (b.soc - SOC_MIN) / (SOC_MAX - SOC_MIN)))));
  const end = s.status === 'won' ? '23:00' : hhmm(s.clock.block);
  return out + ' ' + t('level.L30.lessonBattery', { cut: hhmm(s.rules.cableCutBlock ?? 0), used: Math.round(s.metrics.track.islandKWh ?? 0), end, kwh: Math.round(kwh), margin: Math.round(left * 100), inv: Math.round(inv), peak });
}

/** What to try after an L30 loss: the budget, or what carrying the island from the cut to 23:00 takes (kW and kWh), from the same numbers the verdict used. */
export function islandTryHint(s: GridState): string {
  if (s.budget.capexLimit > 0 && s.budget.spent > s.budget.capexLimit) return t('level.L30.tryBudget');
  const d = islandDark(s);
  if (!d) return '';
  const p = d.params;
  return t('level.L30.tryNeeds', { kw: p.kw, cut: p.cut, needKw: p.needKw!, needKwh: p.needKwh! });
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
        histogram: spec.histogram, horizonBlocks: spec.horizonBlocks, startBlock: spec.startBlock, flashoverBlock: spec.flashoverBlock ?? null, fogBlock: spec.fogBlock ?? null, cableCutBlock: spec.cableCutBlock ?? null, fogTime: spec.fogBlock === undefined ? null : `${String(Math.floor(spec.fogBlock / 4)).padStart(2, '0')}:${String((spec.fogBlock % 4) * 15).padStart(2, '0')}`, star3: spec.star3.map((c) => c.min ?? c.max).filter((k): k is string => k !== undefined),   // threshold names that only decide the third star (the work order lists the rest as pass conditions)
        place: spec.story ? t(spec.story.placeKey) : '', story: spec.story ? spec.story.lineKeys.map((k) => t(k)) : [], lesson: (() => {   // the shift report's consolidation line, with the player's own numbers (bench: the main run)
          if (spec.story?.lessonKind === 'island' && !s.bench) return islandLesson(s, spec.story.lessonKey);   // L30: the cable's charging Q and cost, then the battery's kWh and kW
          if (spec.story?.lessonKind === 'salt' && !s.bench) return saltLesson(s, spec.story.lessonKey);   // L29: creepage of the most exposed coastal support
          if (spec.story?.lessonKind === 'pf' && !s.bench) return pfLesson(s, spec.story.lessonKey);   // chapter 3: S = P + jQ at the peak (L07), the bank's resonance (L08), the series capacitor (L09)
          if (spec.story?.lessonKind === 'harm' && !s.bench) return harmLesson(s, spec.story.lessonKey);
          if (spec.story?.lessonKind === 'series' && !s.bench) return seriesLesson(s, spec.story.lessonKey);
          if (spec.story && !s.bench && s.routes.length > 0) return routeLesson(s, spec, spec.story.lessonKey, d.getParams(s));   // chapter 2: the longest span with the player's numbers (D = wL^2/8H)
          if (spec.story && (s.bench?.machine || s.bench?.town)) return ch2Lesson(s, spec.story.lessonKey);   // chapter 2's closed-form benches (L04, L06)
          if (!spec.story || !s.bench) return '';
          const det = benchDetail(s.bench, d.getBench(s)), run = det?.runs.find((x) => x.id === 'main');
          if (!run) return '';
          return t(spec.id === 'L02' && s.bench.topology === 'trunk' ? 'level.L02.lessonTrunk' : spec.story.lessonKey, { mm2: run.mm2, m: run.lengthM, r: run.rLoopOhm.toFixed(3), i: run.iA.toFixed(1), drop: run.dropV.toFixed(1), v: run.vRecvV.toFixed(1), loss: det!.totals.lossPct.toFixed(1),
            i48: (L03_LOAD_W / SOURCE_V).toFixed(0), k: (L03_LOAD_W / SOURCE_V / run.iA).toFixed(1), k2: ((L03_LOAD_W / SOURCE_V / run.iA) * (L03_LOAD_W / SOURCE_V / run.iA)).toFixed(0) });
        })(), tryHint: spec.story && s.ch4 ? ch4TryHint(s) : spec.story && isCh3(spec) ? ch3TryHint(s) : spec.story && (s.bench?.machine || s.bench?.town) ? ch2TryHint(s) : spec.story && !s.bench ? routeTryHint(s) : '', sites: spec.sites.map((x) => ({ id: x.id, options: x.options.map((o) => o.id) })),
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
      if (!s.bench || s.bench.machine || s.bench.town) return { active: false };   // chapter 2's benches draw themselves (ch2Bench)
      const p = d.getBench(s), r = solveBench(s.bench, p);
      return { active: true, scenario: s.bench.scenario, powered: r.powered, vMinV: r3(r.vMinV), vLoadV: r.vLoadV.map(r3), lossPct: r3(r.lossPct), ampFracMax: r3(r.ampFracMax), cost: r3(benchCost(s.bench, p)), reason: r.reason ? t(r.reason) : null, bench: s.bench };
    },
    /** Per-run numbers of the bench as laid (SI, unrounded): runs with their equation data, and the totals. */
    /** Prices and specs the kit tray shows (money already formatted for the region pack). */
    benchKit: (s) => {
      if (!s.bench || s.bench.machine || s.bench.town) return { active: false };
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
