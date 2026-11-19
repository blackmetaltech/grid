// Projects (the C1 board) and the planning actions. Pure functions: each returns {ok, state, messageKey, params}; `state` is a new object.
import { CONDUCTORS } from '../sim/distrib';
import { systemRng, fnv } from '../sim/rngs';
import { DISTRICT, MONEY, PROJECT_DETAIL, PROJECTS } from './data';
import { analyseFeeder, conductorRow, districtExpected } from './district';
import { trueHealth, avgHealth } from './ageing';
import { hourlyLoad } from './growth';
import { clone, fail, ok, assetById, feederById, primaryById, type ActionResult, type Asset, type CareerState, type Feeder, type Project, type ProjectKind, type Section } from './state';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export const nextConductor = (id: string): string | null => {
  const order = CONDUCTORS.map((c) => c.id), i = order.indexOf(id);
  return i >= 0 && i < order.length - 1 ? order[i + 1]! : null;
};
export function sectionOf(s: CareerState, id: string): { f: Feeder; sec: Section; idx: number } | null {
  for (const f of s.feeders) { const idx = f.sections.findIndex((x) => x.id === id); if (idx >= 0) return { f, sec: f.sections[idx]!, idx }; }
  return null;
}
export const crewsInUse = (s: CareerState): number => s.projects.filter((p) => p.status === 'building').reduce((a, p) => a + p.crew, 0);
export const crewsFree = (s: CareerState): number => s.crews - crewsInUse(s);
export const primaryFeeders = (s: CareerState, pid: string): Feeder[] => s.feeders.filter((f) => f.primaryId === pid);
export const primaryPeakMVA = (s: CareerState, pid: string, t = s.t): number => primaryFeeders(s, pid).reduce((a, f) => a + hourlyLoad(f, t).peakKw, 0) / 1000 / 0.95;
/** Firm capacity (N-1) of a primary in MVA: all units in service except the largest (emergency rating 1.0 here; the 1.2 cyclic emergency factor is applied in shedding). */
export function firmCapacityMVA(s: CareerState, pid: string): number {
  const units = s.assets.filter((a) => a.cls === 'tx' && a.primaryId === pid && !a.failed);
  const r = units.map((u) => u.ratingMVA);
  return r.reduce((a, b) => a + b, 0) - (r.length ? Math.max(...r) : 0);
}
export const firmMarginPct = (s: CareerState, pid: string, t = s.t): number => { const p = primaryPeakMVA(s, pid, t); return p > 0 ? (100 * (firmCapacityMVA(s, pid) - p)) / p : 100; };

export interface ProjectQuote { ok: boolean; messageKey: string; capexM: number; leadQ: number; crew: number; kind: ProjectKind; target: string }

/** Validate and price a project. messageKey names the problem when ok is false, otherwise 'career.quote'. */
export function quoteProject(s: CareerState, kind: ProjectKind, target: string): ProjectQuote {
  const q = (okk: boolean, key: string, row: { capexM: number; leadQ: number; crew: number }, capex = row.capexM): ProjectQuote => ({ ok: okk, messageKey: key, capexM: capex, leadQ: row.leadQ, crew: row.crew, kind, target });
  const none = { capexM: 0, leadQ: 0, crew: 0 };
  if (s.projects.some((p) => (p.status === 'building' || p.status === 'active') && p.kind === kind && p.target === target)) return q(false, 'career.err.duplicate', none);
  const fd = feederById(s, target), sc = sectionOf(s, target), as = assetById(s, target), pr = primaryById(s, target);
  switch (kind) {
    case 'reconductor': {
      if (!sc) return q(false, 'career.err.target', none);
      const nc = nextConductor(sc.sec.conductor);
      if (!nc) return q(false, 'career.err.maxConductor', none);
      return q(true, 'career.quote', PROJECTS.reconductor!, PROJECTS.reconductor!.capexM * conductorRow(nc).costPerKm * sc.sec.lengthKm);
    }
    case 'newFeeder': {
      if (!pr) return q(false, 'career.err.target', none);
      if (s.feeders.length >= DISTRICT.maxFeeders) return q(false, 'career.err.maxFeeders', none);
      return q(true, 'career.quote', PROJECTS.newFeeder!);
    }
    case 'newTransformer': {
      if (!pr) return q(false, 'career.err.target', none);
      if (pr.unitIds.length >= DISTRICT.maxUnitsPerPrimary) return q(false, 'career.err.maxUnits', none);
      return q(true, 'career.quote', PROJECTS.newTransformer!);
    }
    case 'tieSwitch': return !fd ? q(false, 'career.err.target', none) : fd.tie ? q(false, 'career.err.already', none) : q(true, 'career.quote', PROJECTS.tieSwitch!);
    case 'remoteSwitch': {
      if (!sc) return q(false, 'career.err.target', none);
      if (sc.idx === 0) return q(false, 'career.err.headSection', none);
      return sc.sec.device === 'remote' ? q(false, 'career.err.already', none) : q(true, 'career.quote', PROJECTS.remoteSwitch!);
    }
    case 'recloser': return !fd ? q(false, 'career.err.target', none) : fd.recloser ? q(false, 'career.err.already', none) : q(true, 'career.quote', PROJECTS.recloser!);
    case 'vegetation': return !fd ? q(false, 'career.err.target', none) : fd.veg < 0.25 ? q(false, 'career.err.notNeeded', none) : q(true, 'career.quote', PROJECTS.vegetation!);
    case 'regulator': return !fd ? q(false, 'career.err.target', none) : fd.regulator ? q(false, 'career.err.already', none) : q(true, 'career.quote', PROJECTS.regulator!);
    case 'battery': return !fd ? q(false, 'career.err.target', none) : q(true, 'career.quote', PROJECTS.battery!);
    case 'demandResponse': return !fd ? q(false, 'career.err.target', none) : fd.drKw > 0 ? q(false, 'career.err.already', none) : q(true, 'career.quote', PROJECTS.demandResponse!);
    case 'replaceAssets': {
      if (!as) return q(false, 'career.err.target', none);
      if (as.failed && as.outQ > 0) return q(false, 'career.err.beingReplaced', none);
      if (as.cls === 'line') { const sec = sectionOf(s, as.id)!; return q(true, 'career.quote', PROJECTS.replaceLine!, PROJECTS.replaceLine!.capexM * sec.sec.lengthKm); }
      return as.cls === 'tx' ? q(true, 'career.quote', PROJECTS.replaceTx!) : q(true, 'career.quote', PROJECTS.replaceSwitchgear!);
    }
  }
}

/** Planned spending per quarter that is already committed. */
export const committedPerQuarter = (s: CareerState): number => s.projects.filter((p) => p.status === 'building').reduce((a, p) => a + p.capexM / p.leadQ, 0)
  + s.projects.filter((p) => p.status === 'active' && p.kind === 'demandResponse').length * PROJECT_DETAIL.drCostQ;

export function startProject(state: CareerState, kind: ProjectKind, target: string): ActionResult {
  if (state.phase !== 'plan') return fail(state, 'career.err.phase');
  const qt = quoteProject(state, kind, target);
  if (!qt.ok) return fail(state, qt.messageKey, { kind, target });
  if (qt.crew > crewsFree(state)) return fail(state, 'career.err.noCrew', { need: qt.crew, free: crewsFree(state) });
  const id = 'J' + state.nextId;
  const s: CareerState = { ...state, nextId: state.nextId + 1, projects: [...state.projects, { id, kind, target, startQ: state.t, leadQ: qt.leadQ, left: qt.leadQ, crew: qt.crew, capexM: qt.capexM, spentM: 0, status: 'building' }] };
  return ok(s, 'career.project.started', { id, kind, target, capexM: qt.capexM, leadQ: qt.leadQ });
}

export function cancelProject(state: CareerState, id: string): ActionResult {
  if (state.phase === 'over') return fail(state, 'career.err.phase');
  const i = state.projects.findIndex((p) => p.id === id && (p.status === 'building' || p.status === 'active'));
  if (i < 0) return fail(state, 'career.err.noProject', { id });
  const p = { ...state.projects[i]!, status: 'cancelled' as const };
  const s: CareerState = { ...state, projects: state.projects.filter((_, k) => k !== i) };
  if (state.projects[i]!.status === 'active' && p.kind === 'demandResponse') s.feeders = state.feeders.map((f) => (f.id === p.target ? { ...f, drKw: 0 } : f));
  return ok(s, 'career.project.cancelled', { id, sunkM: p.spentM });
}

/** Inspection reveals the true health of one asset (cost: MONEY.inspectionM). */
export function inspect(state: CareerState, assetId: string): ActionResult {
  if (state.phase !== 'plan') return fail(state, 'career.err.phase');
  if (!assetById(state, assetId)) return fail(state, 'career.err.target', { target: assetId });
  const a = assetById(state, assetId)!, known = { health: trueHealth(a, state.t), q: state.t };
  const s: CareerState = { ...state, cash: state.cash - MONEY.inspectionM, assets: state.assets.map((x) => (x === a ? { ...x, known } : x)) };
  return ok(s, 'career.inspect', { asset: assetId, health: Math.round(known.health * 10) / 10, costM: MONEY.inspectionM });
}

export function setVegetationBudget(state: CareerState, level: number): ActionResult {
  if (state.phase === 'over') return fail(state, 'career.err.phase');
  const l = Math.round(level);
  if (l < 0 || l > 3) return fail(state, 'career.err.range', { level });
  const s: CareerState = { ...state, vegLevel: l };
  return ok(s, 'career.veg.set', { level: l, costPerQuarterM: l * MONEY.vegPerLevelFeederQ * s.feeders.length });
}

export function renewAsset(a: Asset, t: number): void { a.installQ = t; a.wear = 1; a.wearFaults = 0; a.extraYears = 0; a.failed = false; a.outQ = 0; a.known = { health: 10, q: t }; }

/** Share of the capex the regulator lets into the RAB: floor + (1 - floor) x need (need 0..1 from the modelled need; 0 for opex-like projects). */
export function allowedShare(s: CareerState, kind: ProjectKind, target: string): number {
  const fl = PROJECT_DETAIL.allowedFloor;
  const fd = feederById(s, target);
  let need = 0.8;
  switch (kind) {
    case 'vegetation': case 'demandResponse': return 0;
    case 'reconductor': {
      const sc = sectionOf(s, target); if (!sc) break;
      const an = analyseFeeder(s, sc.f), a = assetById(s, sc.sec.assetId)!;
      need = Math.max(clamp((an.loadingPct - 60) / 40, 0, 1), clamp((6 - trueHealth(a, s.t)) / 4, 0, 1)); break;
    }
    case 'replaceAssets': { const a = assetById(s, target); if (a) need = clamp((7 - trueHealth(a, s.t)) / 4, 0, 1); break; }
    case 'newFeeder': { const fs = primaryFeeders(s, target); need = clamp((Math.max(0, ...fs.map((f) => analyseFeeder(s, f, false).loadingPct)) - 70) / 30, 0, 1); break; }
    case 'newTransformer': need = clamp(1 - firmMarginPct(s, target) / 25, 0, 1); break;
    case 'tieSwitch': case 'remoteSwitch': case 'recloser': {
      const f = fd ?? sectionOf(s, target)?.f; if (!f) break;
      need = clamp(analyseFeeder(s, f, false).rel.saidi / (0.8 * s.saidiTarget), 0, 1); break;
    }
    case 'regulator': case 'battery': { if (!fd) break; const an = analyseFeeder(s, fd); need = an.vViolation || an.loadingPct > 90 ? 1 : 0.2; break; }
  }
  return fl + (1 - fl) * need;
}

/** Apply a finished project to the (already cloned) state. */
export function completeProject(s: CareerState, p: Project): void {
  const fd = feederById(s, p.target);
  switch (p.kind) {
    case 'reconductor': {
      const sc = sectionOf(s, p.target); if (!sc) return;
      sc.sec.conductor = nextConductor(sc.sec.conductor) ?? sc.sec.conductor;
      renewAsset(assetById(s, sc.sec.assetId)!, s.t);
      break;
    }
    case 'newFeeder': {
      const fs = primaryFeeders(s, p.target); if (!fs.length) return;
      const heavy = fs.reduce((m, f) => (hourlyLoad(f, s.t).peakKw > hourlyLoad(m, s.t).peakKw ? f : m), fs[0]!);
      const n = s.feeders.reduce((m, f) => Math.max(m, Number(f.id.slice(1))), 0) + 1, id = `F${n}`;
      const half = Math.floor(heavy.customers / 2);
      const nf: Feeder = {
        id, primaryId: p.target, customers: half, baseKw: heavy.baseKw / 2, growthPct: heavy.growthPct, evBias: heavy.evBias, pvBias: heavy.pvBias,
        sections: DISTRICT.sectionLengthsKm.map((len, i) => ({ id: `${id}.${i + 1}`, lengthKm: len, conductor: ['Hyena', 'Dog', 'Dog', 'Rabbit'][i]!, share: DISTRICT.sectionShares[i]!, device: (['none', 'manual', 'manual', 'none'] as const)[i]!, assetId: `${id}.${i + 1}` })),
        tie: false, recloser: false, regulator: false, batteryKw: 0, drKw: 0, solarKw: 0, veg: 0.3,
      };
      heavy.customers -= half; heavy.baseKw /= 2;
      nf.sections.forEach((sec, i) => s.assets.push({ id: sec.assetId, cls: 'line', feederId: id, sectionIdx: i, primaryId: null, installQ: s.t, wear: 1, wearFaults: 0, extraYears: 0, ratingMVA: 0, failed: false, outQ: 0, known: { health: 10, q: s.t } }));
      s.feeders.push(nf);
      break;
    }
    case 'newTransformer': {
      const pr = primaryById(s, p.target); if (!pr) return;
      const r = s.assets.find((a) => a.id === pr.unitIds[0])?.ratingMVA ?? 20;
      const id = `${pr.id}-T${pr.unitIds.length + 1}`;
      s.assets.push({ id, cls: 'tx', feederId: null, sectionIdx: 0, primaryId: pr.id, installQ: s.t, wear: 1, wearFaults: 0, extraYears: 0, ratingMVA: r, failed: false, outQ: 0, known: { health: 10, q: s.t } });
      pr.unitIds.push(id);
      break;
    }
    case 'tieSwitch': if (fd) fd.tie = true; break;
    case 'remoteSwitch': { const sc = sectionOf(s, p.target); if (sc) sc.sec.device = 'remote'; break; }
    case 'recloser': if (fd) fd.recloser = true; break;
    case 'vegetation': if (fd) fd.veg = Math.min(fd.veg, PROJECT_DETAIL.deepClearVeg); break;
    case 'regulator': if (fd) fd.regulator = true; break;
    case 'battery': if (fd) fd.batteryKw += PROJECT_DETAIL.batteryKw; break;
    case 'demandResponse': if (fd) { fd.drKw = hourlyLoad({ ...fd, drKw: 0 }, s.t).peakKw * PROJECT_DETAIL.drShare; p.status = 'active'; return; } break;
    case 'replaceAssets': { const a = assetById(s, p.target); if (a) renewAsset(a, s.t); break; }
  }
  p.status = 'done';
}

/** Expected effect of a project (what the board shows as "why this helps"): change in district expected SAIDI/SAIFI, feeder loading, firm margin. */
export interface ProjectPreview { quote: ProjectQuote; dSaidi: number; dSaifi: number; loadingBeforePct: number; loadingAfterPct: number; firmBeforePct: number; firmAfterPct: number; allowedShare: number; whyKey: string }
export function previewProject(state: CareerState, kind: ProjectKind, target: string): ProjectPreview {
  const quote = quoteProject(state, kind, target);
  const f = feederById(state, target) ?? sectionOf(state, target)?.f ?? (assetById(state, target)?.feederId ? feederById(state, assetById(state, target)!.feederId!) : undefined);
  const pid = primaryById(state, target)?.id ?? f?.primaryId ?? assetById(state, target)?.primaryId ?? null;
  const before = districtExpected(state), fb = pid ? firmMarginPct(state, pid) : 0;
  const lb = f ? analyseFeeder(state, f).loadingPct : 0;
  if (!quote.ok) return { quote, dSaidi: 0, dSaifi: 0, loadingBeforePct: lb, loadingAfterPct: lb, firmBeforePct: fb, firmAfterPct: fb, allowedShare: 0, whyKey: quote.messageKey };
  const c = clone(state);
  completeProject(c, { id: 'preview', kind, target, startQ: c.t, leadQ: 0, left: 0, crew: 0, capexM: 0, spentM: 0, status: 'building' });
  const after = districtExpected(c);
  const fa = c.feeders.find((x) => x.id === f?.id), la = fa ? analyseFeeder(c, fa).loadingPct : 0;
  const whyKey = ({ reconductor: 'career.why.reconductor', newFeeder: 'career.why.newFeeder', newTransformer: 'career.why.newTransformer', tieSwitch: 'career.why.tie', remoteSwitch: 'career.why.remote', recloser: 'career.why.recloser', vegetation: 'career.why.vegetation', replaceAssets: 'career.why.replace', regulator: 'career.why.regulator', battery: 'career.why.battery', demandResponse: 'career.why.dr' } as Record<ProjectKind, string>)[kind];
  return { quote, dSaidi: after.saidi - before.saidi, dSaifi: after.saifi - before.saifi, loadingBeforePct: lb, loadingAfterPct: la, firmBeforePct: fb, firmAfterPct: pid ? firmMarginPct(c, pid) : 0, allowedShare: allowedShare(state, kind, target), whyKey };
}

/** Deterministic cost overrun factor (+/- PROJECT_DETAIL.overrunPct %) for a project completing in quarter t. */
export function overrun(seed: number, t: number, id: string): number {
  return 1 + (systemRng(seed, t, fnv(id), 'overrun').range(-1, 1) * PROJECT_DETAIL.overrunPct) / 100;
}
export { avgHealth };

/** Cheap preview for the reliability projects (tie, recloser, remote switch): change in district expected SAIDI / SAIFI from re-running the FMEA of the one feeder. */
export function reliabilityDelta(state: CareerState, kind: 'tieSwitch' | 'recloser' | 'remoteSwitch', target: string): { dSaidi: number; dSaifi: number } {
  const sc = sectionOf(state, target), f = feederById(state, target) ?? sc?.f;
  if (!f) return { dSaidi: 0, dSaifi: 0 };
  const f2: Feeder = clone(f);
  if (kind === 'tieSwitch') f2.tie = true; else if (kind === 'recloser') f2.recloser = true; else if (sc) f2.sections[sc.idx]!.device = 'remote';
  const a = analyseFeeder(state, f, false).rel, b = analyseFeeder(state, f2, false).rel, N = state.feeders.reduce((x, y) => x + y.customers, 0);
  return { dSaidi: ((b.saidi - a.saidi) * f.customers) / N, dSaifi: ((b.saifi - a.saifi) * f.customers) / N };
}
