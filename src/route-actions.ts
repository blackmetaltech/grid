// Overhead-line routes (L05 "The River Line", DEPTH §3-4): the `buildRoute` action, the `routePreview` query and the pricing. The pure planner
// (src/sim/route) places supports along the waypoints the player clicked and checks every span's clearance at the design temperature; this file
// turns a plan into a branch, a bill of materials and, when the planner refuses, a teaching message. Region data arrives as `RouteParams`
// (rules for the line's kV, prices, support families, conductors), never as a pack.
import type { ActionFn, ActionResult, QueryFn } from '@core/kit';
import { t } from './i18n';
import type { GridState, RouteRecord, SaltSupportRecord, WorstSpanRecord } from './types';
import { INSULATORS } from './data/insulators';
import { makeLine, type CatalogueView, type LineSpec } from './sim/build';
import { planRoute, weightNPerM, type ConductorMech, type RoutePlan, type RouteRequest, type RouteResult, type RouteRules, type SupportFamily, type Terrain, type TileKind } from './sim/route';
import type { RouteData } from './regions/data';
import { terrainOf } from './level/maps';
import { specOf } from './level';

type Params = Record<string, string | number>;

/** Region rules and prices as plain numbers (src/catalogue.ts routeParamsOf), plus the shared physical tables. */
export interface RouteParams {
  /** The planner's rules for a line of `kv` (ground clearance by voltage class). */
  rulesFor: (kv: number) => RouteRules;
  prices: RouteData['prices'];
  families: SupportFamily[];
  conductors: ConductorMech[];
}
export interface RouteDeps {
  cat: (s: GridState) => CatalogueView;
  getRoute: (s: GridState) => RouteParams;
  money: (s: GridState, amount: number) => string;
}

import { familyWord, foundationWord, kindWord } from './route-words';
/** What a span is "over", most telling first: water, a road, swamp, rock, forest, plain ground. */
const OVER_PRIORITY: TileKind[] = ['river', 'sea', 'road', 'town', 'swamp', 'rock', 'forest', 'sand', 'field'];
export function dominantOver(kinds: readonly TileKind[]): TileKind {
  for (const k of OVER_PRIORITY) if (kinds.includes(k)) return k;
  return 'field';
}

const r2 = (x: number): number => Math.round(x * 100) / 100;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// ---- the planner's refusals as teaching messages ------------------------------------------------------------------------------------
function refusalParams(r: Extract<RouteResult, { ok: false }>['refusal']): Params {
  switch (r.key) {
    case 'route.tooShort': return {};
    case 'route.offMap': return { x: Math.round(r.at[0]), y: Math.round(r.at[1]) };
    case 'route.noOverhead': return { kind: kindWord(r.kind), tile: r.tile };
    case 'route.noSupportGapTooLong': return { gap: Math.round(r.gapM), max: r.maxSpanM, family: familyWord(r.familyId) };
    case 'route.kvTooHigh': return { kv: r.kv, kvMax: r.kvMax, family: familyWord(r.familyId) };
    case 'route.noFoundation': return { kind: kindWord(r.kind), family: familyWord(r.familyId), needs: foundationWord(r.needs), tile: r.tile };
    case 'route.unknownFamily': return { id: r.id };
    case 'route.unknownConductor': return { id: r.id };
    case 'route.unknownInsulator': return { id: r.id };
    case 'route.spanTooLong': return { span: r.spanM, max: r.maxSpanM };
  }
}

export interface Refusal { key: string; message: string; params: Params }
const refusal = (key: string, params: Params = {}): { ok: false; refusal: Refusal } => ({ ok: false, refusal: { key, message: t(key, params), params } });

// ---- pricing -------------------------------------------------------------------------------------------------------------------------
export interface RouteCost { supports: number; foundations: number; conductor: number; clearing: number; insulators: number; total: number }
/** Bill of materials of a plan at the pack's prices (to the cent). The foundation is `foundationShare` OF the angle-adjusted support price (the rest is the
 *  support itself), times the foundation kind's multiplier; wires are 4 below 1 kV, 3 above; right-of-way clearing is charged per metre of route over forest. */
export function priceRoute(plan: RoutePlan, kv: number, conductorShort: string, prices: RouteData['prices']): RouteCost {
  let supports = 0, foundations = 0;
  for (const sp of plan.supports) {
    const base = (prices.support[sp.familyId] ?? 0) * (prices.angleMultiplier[sp.angleClass] ?? 1);
    supports += base * (1 - prices.foundationShare);   // the foundation is a share OF the support's price (DEPTH 4.3), scaled by the soil's kind
    foundations += base * prices.foundationShare * (prices.foundationMultiplier[sp.foundation] ?? 1);
  }
  const wires = kv < 1 ? prices.phaseWires.lv : prices.phaseWires.mv;
  const conductor = plan.bom.conductorM * wires * (prices.conductorPerM[conductorShort] ?? 0);
  const clearing = plan.bom.clearedForestM * prices.clearingPerM;
  // insulators: 3 phases x supports x the unit price (per phase per support); the pack's `insulator` table overrides the base US$ price of src/data/insulators.ts
  let insulators = 0;
  for (const sp of plan.supports) if (sp.insulatorId) insulators += 3 * (prices.insulator?.[sp.insulatorId] ?? INSULATORS.find((i) => i.id === sp.insulatorId)?.priceUsd ?? 0);
  const c = { supports: r2(supports), foundations: r2(foundations), conductor: r2(conductor), clearing: r2(clearing), insulators: r2(insulators) };
  return { ...c, total: r2(c.supports + c.foundations + c.conductor + c.clearing + c.insulators) };
}

// ---- evaluating a request ------------------------------------------------------------------------------------------------------------
export interface RouteArgs { from: string; to: string; conductor: string; family: string; crossing: string | null; spanM: number; waypointsM: [number, number][]; insulator: string; coastInsulator: string }
export type RouteEval =
  | { ok: false; refusal: Refusal }
  | { ok: true; plan: RoutePlan; cost: RouteCost; kv: number; request: RouteRequest; spec: LineSpec; worst: WorstSpanRecord; longest: WorstSpanRecord; badSpans: number[]; salt: SaltView };

/** Which supports of a plan are short of the creepage their tile needs (fog flashover), the worst of them, and the thinnest creepage within 6 tiles of the sea. */
export interface SaltView { short: number[]; worst: SaltSupportRecord | null; coastMinCreepageMm: number | null; coastWorst: SaltSupportRecord | null }
export function saltOf(plan: RoutePlan): SaltView {
  const short: number[] = []; let worst: SaltSupportRecord | null = null, coastMin: number | null = null, coastWorst: SaltSupportRecord | null = null;
  const recOf = (p: RoutePlan['supports'][number], i: number): SaltSupportRecord => ({ index: i, seaM: Math.round(p.seaM ?? 0), cls: p.pollutionClass, needMm: Math.round(p.needMm), hasMm: Math.round(p.creepageMm), insulatorId: p.insulatorId });
  plan.supports.forEach((p, i) => {
    if (p.pollutionClass >= 2) {   // class >= 2 is exactly "within 6 tiles of the sea"
      coastMin = coastMin === null ? p.creepageMm : Math.min(coastMin, p.creepageMm);
      const c = recOf(p, i);
      if (!coastWorst || c.needMm > coastWorst.needMm || (c.needMm === coastWorst.needMm && (c.hasMm < coastWorst.hasMm || (c.hasMm === coastWorst.hasMm && c.seaM < coastWorst.seaM)))) coastWorst = c;
    }
    if (p.creepageMm >= p.needMm - 1e-9) return;
    short.push(i);
    const rec = recOf(p, i);
    if (!worst || rec.needMm - rec.hasMm > worst.needMm - worst.hasMm || (rec.needMm - rec.hasMm === worst.needMm - worst.hasMm && rec.seaM < worst.seaM)) worst = rec;
  });
  return { short, worst, coastMinCreepageMm: coastMin, coastWorst };
}

/** The planner is pure: memoise it by (region, terrain, request) outside the state so previews and probes stay cheap. */
const PLAN_CACHE = new Map<string, RouteResult>();
const PLAN_CACHE_MAX = 4000;
function planCached(s: GridState, terrain: Terrain, req: RouteRequest, rp: RouteParams): RouteResult {
  const key = `${s.region}|${s.terrain}|${JSON.stringify(req)}`;
  let r = PLAN_CACHE.get(key);
  if (!r) {
    r = planRoute(terrain, req, rp.rulesFor(req.kv), rp.families, rp.conductors);
    if (PLAN_CACHE.size >= PLAN_CACHE_MAX) PLAN_CACHE.clear();
    PLAN_CACHE.set(key, r);
  }
  return r;
}

export const MIN_SPAN_M = 20, MAX_WAYPOINTS = 40;
export function parseArgs(a: unknown[]): RouteArgs | { bad: string } {
  const [from, to, conductor, family, crossing, spanM, wps, insulator, coastInsulator] = a;
  if (!isStr(from) || !isStr(to)) return { bad: 'exp.bus_ids' };
  if (!isStr(conductor)) return { bad: 'exp.a_conductor_id' };
  if (!isStr(family)) return { bad: 'exp.a_support_family_id' };
  if (crossing !== null && crossing !== undefined && !isStr(crossing)) return { bad: 'exp.a_support_family_id_or_null' };
  if (!isNum(spanM) || spanM < MIN_SPAN_M) return { bad: 'exp.a_span_length_in_metres' };   // a lower bound keeps a hostile action log from planting millions of poles
  const w = wps === undefined ? [] : wps;
  if (Array.isArray(w) && w.length > MAX_WAYPOINTS) return { bad: 'exp.a_list_of_points_in_metres' };
  if (!Array.isArray(w) || w.some((p) => !Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1]))) return { bad: 'exp.a_list_of_points_in_metres' };
  if (insulator !== null && insulator !== undefined && !isStr(insulator)) return { bad: 'exp.an_insulator_id' };
  if (coastInsulator !== null && coastInsulator !== undefined && !isStr(coastInsulator)) return { bad: 'exp.an_insulator_id' };
  const ins = insulator ?? 'pin';
  return { from, to, conductor, family, crossing: crossing ?? null, insulator: ins, coastInsulator: coastInsulator ?? ins, spanM, waypointsM: (w as [number, number][]).map((p) => [p[0], p[1]] as [number, number]) };
}

export function evaluateRoute(s: GridState, a: RouteArgs, d: RouteDeps): RouteEval {
  const A = s.buses.find((b) => b.id === a.from), B = s.buses.find((b) => b.id === a.to);
  if (!A) return refusal('act.unknownId', { what: t('what.bus'), id: a.from });
  if (!B) return refusal('act.unknownId', { what: t('what.bus'), id: a.to });
  if (A.id === B.id) return refusal('act.line.same', { bus: A.id });
  if (Math.abs(A.kvNom - B.kvNom) > 1e-9) return refusal('route.kvMismatch', { a: A.id, kvA: A.kvNom, b: B.id, kvB: B.kvNom });
  const terrain = terrainOf(s.terrain);
  if (!terrain) return refusal('route.noTerrain');
  const rp = d.getRoute(s), kv = A.kvNom;
  const mech = rp.conductors.find((c) => c.id === `acsr-${a.conductor}`);
  if (!mech) return refusal('route.unknownConductor', { id: a.conductor });
  const tplKv = kv < 1 ? '04' : String(kv), spec0 = d.cat(s).line(`l${tplKv}-${a.conductor}`);
  if (!spec0) return refusal('route.noTemplate', { kv, conductor: a.conductor });
  const at = (b: { x: number; y: number }): [number, number] => [(b.x + 0.5) * terrain.tileM, (b.y + 0.5) * terrain.tileM];
  const request: RouteRequest = { waypoints: [at(A), ...a.waypointsM, at(B)], familyId: a.family, crossingFamilyId: a.crossing, conductorId: mech.id, kv, spanM: a.spanM,
    ...(a.insulator !== 'pin' || a.coastInsulator !== 'pin' ? { insulatorId: a.insulator, coastInsulatorId: a.coastInsulator } : {}) };   // omitted when plain pins: old saves and their hashes stay as they were
  const res = planCached(s, terrain, request, rp);
  if (!res.ok) {
    const r = res.refusal;
    // a crossing family IS chosen and the river is still wider than it spans: never tell the player to pick one
    if (r.key === 'route.noSupportGapTooLong' && a.crossing !== null) {
      const offered = s.level ? specOf(s.level)?.allowed.parts['buildRoute.crossing'] : undefined;   // only a structure the level's kit actually offers
      const fits = rp.families.filter((f) => f.kvMax >= kv && f.maxSpanM >= r.gapM && f.id !== r.familyId && (!offered || (offered as readonly unknown[]).includes(f.id))).sort((x, y) => x.maxSpanM - y.maxSpanM)[0];
      const base = { gap: Math.round(r.gapM), family: familyWord(r.familyId), max: r.maxSpanM };
      return fits ? refusal('route.crossingTooNarrow', { ...base, use: familyWord(fits.id) }) : refusal('route.crossingTooNarrowNone', base);
    }
    return refusal(r.key, refusalParams(r));
  }
  const plan = res;
  // the line's pu values are on the buses' own base: a 0.433 kV pack bus gets the same ohms per km on its own Zbase and a thermal MVA scaled with kV
  const spec: LineSpec = { ...spec0, kv, thermalMva: spec0.thermalMva * (kv / spec0.kv) };
  const rec = (i: number): WorstSpanRecord => {
    const w = plan.spans[i]!;
    return { span: i, lengthM: r3(w.lengthM), over: dominantOver(w.over), sagM: r3(w.sagDesignM), hN: r3(w.hDesignN), wNPerM: r3(weightNPerM(mech)), clearanceM: r3(w.clearanceM), requiredM: r3(w.requiredM) };
  };
  let li = 0;
  plan.spans.forEach((sp, i) => { if (sp.lengthM > plan.spans[li]!.lengthM) li = i; });
  const worst = rec(plan.worstSpan), longest = rec(li);
  const badSpans = plan.spans.flatMap((sp, i) => (sp.ok ? [] : [i]));
  return { ok: true, plan, cost: priceRoute(plan, kv, a.conductor, rp.prices), kv, request, spec, worst, longest, badSpans, salt: saltOf(plan) };
}

// ---- the action ------------------------------------------------------------------------------------------------------------------------
const accept = (s: GridState, name: string, key: string, params: Params = {}): ActionResult => {
  s.actionLog.push({ tick: s.tick, name, key });
  if (s.actionLog.length > 200) s.actionLog.splice(0, s.actionLog.length - 200);
  return { ok: true, message: t(key, params), key, params };
};
const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });
function nextBranchId(s: GridState): string {
  const used = new Set(s.branches.map((b) => b.id));
  for (let n = s.branches.length + 1; ; n++) if (!used.has(`T${n}`)) return `T${n}`;
}

export function buildRouteActions(d: RouteDeps): Record<string, ActionFn<GridState>> {
  return {
    /** Build an overhead line between two buses of the same voltage along the player's waypoints (metres on the map). */
    buildRoute: (s, ...raw: unknown[]) => {
      const a = parseArgs(raw);
      if ('bad' in a) return reject('act.arg', { name: 'fromBus, toBus, conductorId, familyId, crossingFamilyId, spanM, waypointsM, insulatorId?, coastInsulatorId?', expected: t(a.bad) });
      const ev = evaluateRoute(s, a, d);
      if (!ev.ok) return { ok: false, message: ev.refusal.message, key: ev.refusal.key, params: ev.refusal.params };
      const { plan, cost, request, spec } = ev;
      const id = nextBranchId(s);
      const terrain = terrainOf(s.terrain)!;
      const toTile = (p: [number, number]): [number, number] => [r3(p[0] / terrain.tileM - 0.5), r3(p[1] / terrain.tileM - 0.5)];
      s.branches.push(makeLine(spec, id, a.from, a.to, plan.lengthM / 1000, 1, a.waypointsM.map(toTile)));
      s.budget.spent += cost.total; (s.purchases ??= {})[id] = cost.total;
      const rec: RouteRecord = {
        branchId: id, request: { ...request, waypoints: request.waypoints.map((p) => [p[0], p[1]] as [number, number]) }, worstMarginM: r3(plan.worstMarginM), badSpans: ev.badSpans,
        lengthM: r3(plan.lengthM), cost: cost.total, supports: plan.supports.length, worst: ev.worst, longest: ev.longest,
        ...(ev.salt.short.length > 0 ? { saltShort: ev.salt.short, saltWorst: ev.salt.worst! } : {}),
        ...(ev.salt.coastMinCreepageMm !== null ? { coastMinCreepageMm: ev.salt.coastMinCreepageMm, coastWorst: ev.salt.coastWorst! } : {}),
      };
      s.routes.push(rec);
      s.solution = null;
      return accept(s, 'buildRoute', 'route.ok', { id, kv: ev.kv, km: r3(plan.lengthM / 1000), n: plan.supports.length, spans: plan.spans.length, cost: d.money(s, cost.total), margin: r3(plan.worstMarginM) });
    },
  };
}

// ---- the queries -----------------------------------------------------------------------------------------------------------------------
/** The plan as plain finite JSON for the front-end and the world query. */
export function planView(plan: RoutePlan): { supports: unknown[]; spans: unknown[] } {
  return {
    supports: plan.supports.map((p) => ({ x: r3(p.x), y: r3(p.y), familyId: p.familyId, angleDeg: r3(p.angleDeg), angleClass: p.angleClass, foundation: p.foundation, insulatorId: p.insulatorId, creepageMm: r3(p.creepageMm), needMm: r3(p.needMm), pollutionClass: p.pollutionClass, seaM: p.seaM === null ? null : r3(p.seaM) })),
    spans: plan.spans.map((sp) => ({
      lengthM: r3(sp.lengthM), over: [...sp.over], sagM: r3(sp.sagDesignM), clearanceM: r3(sp.clearanceM), requiredM: r3(sp.requiredM), marginM: r3(sp.clearanceM - sp.requiredM), atM: r3(sp.atM), ok: sp.ok,
    })),
  };
}

export function buildRouteQueries(d: RouteDeps): Record<string, QueryFn<GridState>> {
  return {
    /** What `buildRoute` would do with these arguments, without building: the plan with sag and clearance per span, the cost breakdown, or the refusal. Never throws. */
    routePreview: (s, ...raw: unknown[]) => {
      const a = parseArgs(raw);
      if ('bad' in a) { const key = 'act.arg', params = { name: 'fromBus, toBus, conductorId, familyId, crossingFamilyId, spanM, waypointsM, insulatorId?, coastInsulatorId?', expected: t(a.bad) }; return { ok: false, refusal: { key, message: t(key, params), params } }; }
      const ev = evaluateRoute(s as GridState, a, d);
      if (!ev.ok) return { ok: false, refusal: ev.refusal };
      const { plan, cost } = ev;
      return {
        ok: true, ...planView(plan), cost: { supports: r3(cost.supports), foundations: r3(cost.foundations), conductor: r3(cost.conductor), clearing: r3(cost.clearing), insulators: r3(cost.insulators), total: r3(cost.total) },
        lengthM: r3(plan.lengthM), worstMarginM: r3(plan.worstMarginM), worstSpan: plan.worstSpan, badSpans: ev.badSpans, worst: ev.worst, saltShort: ev.salt.short, coastMinCreepageMm: ev.salt.coastMinCreepageMm,
      };
    },
  };
}

/** The routes of a state re-planned from their stored requests (deterministic): what the world query draws. */
export function replanRoutes(s: GridState, rp: RouteParams): { branchId: string; supports: unknown[]; spans: unknown[] }[] {
  const terrain = terrainOf(s.terrain);
  if (!terrain) return [];
  const out: { branchId: string; supports: unknown[]; spans: unknown[] }[] = [];
  for (const r of s.routes) {
    const res = planCached(s, terrain, r.request, rp);
    if (res.ok) out.push({ branchId: r.branchId, ...planView(res) });
  }
  return out;
}
