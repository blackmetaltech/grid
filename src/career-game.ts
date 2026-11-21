// Career "The Utility" wired into the game (DESIGN-1.1 Part C): the pure engine in src/career runs inside GridState.career as a seed plus an
// action list, so a save, a career code and a replay are the same thing. Engine money is in model millions (GBP-scale, see src/career/data.ts);
// everything the player reads is converted to the region's currency here: model M x 1e6 x US$ per GBP x the pack's money factor.
import type { ActionFn, ActionResult, QueryFn } from '@core/kit';
import { formatMoney } from '@core/regions';
import { t } from './i18n';
import { REGIONS } from './regions';
import type { GridState } from './types';
import { moneyFactor } from './sim/ch7/data';
import {
  applyAction, buildDistrict, encodeCareer, decodeCareer, replayCareer, careerScore, analyseFeeder, districtExpected, previewProject, quoteProject,
  crewsFree, firmMarginPct, primaryPeakMVA, firmCapacityMVA, shownHealth, avgHealth, committedPerQuarter, allowedRevenue,
  PROJECT_KINDS, PROJECTS, ENDINGS, MONEY, INCENTIVE, periodReset, chiefShortfalls, CHARTER_IDS, weeklyDistrict, isoWeekOf, vegStep, scoreParts, SCORE, STORM, stormForecast, charterOf, type CharterId, WEIBULL, effectiveAge, failureProb, trueHealth, type CareerAction, type CareerState, type ProjectKind,
} from './career';

/** US$ per GBP used to bring the career's GBP-scale model money onto the packs' US$ basis (2024 average, rounded; illustrative). */
export const USD_PER_GBP = 1.27;
/** A feeder's tree index after four quarters at a tree-cutting level (turn.ts applies the same step each quarter). */
const vegAfterYear = (v: number, lv: number): number => { for (let q = 0; q < 4; q++) v = vegStep(v, lv); return v; };
/** What the projects already building still have to pay (model millions). */
const owedM = (st: CareerState): number => st.projects.filter((p) => p.status === 'building').reduce((a, p) => a + Math.max(0, p.capexM - p.spentM), 0);
export interface CareerSlot { seed: number; actions: CareerAction[]; state: CareerState; /** DESIGN-1.3: the ISO week ('2026-W47') when this is the weekly district */ weekly?: string }
const charterArg = (x: unknown): CharterId => ((CHARTER_IDS as string[]).includes(String(x)) ? (x as CharterId) : 'standard');

type Params = Record<string, string | number>;
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** Model millions to the pack's currency. */
export const careerMoney = (s: Pick<GridState, 'region'>, m: number): number => m * 1e6 * USD_PER_GBP * moneyFactor(s.region);
const moneyText = (s: GridState, m: number): string => formatMoney(careerMoney(s, m), REGIONS.get(s.region), { decimals: 0 });

/** Engine params: every numeric `xxxM` gets a money-formatted `xxx` twin; a `kind` gets its readable name as `kindName`. */
function withMoney(s: GridState, p: Record<string, number | string>): Params {
  const out: Params = { ...p };
  for (const [k, v] of Object.entries(p)) if (k.length > 1 && k.endsWith('M') && typeof v === 'number') out[k.slice(0, -1)] = moneyText(s, v);
  if (typeof p.cash === 'number') out.cashText = moneyText(s, p.cash);
  if (typeof p.rab === 'number') out.rabText = moneyText(s, p.rab);
  if (typeof p.kind === 'string') out.kindName = t((PROJECT_KINDS as string[]).includes(p.kind) ? `career.kind.${p.kind}` : `career.conn.${p.kind}`);
  return out;
}

const reject = (key: string, params: Params = {}): ActionResult => ({ ok: false, message: t(key, params), key, params });

export function buildCareerActions(): Record<string, ActionFn<GridState>> {
  const act = (s: GridState, a: CareerAction): ActionResult => {
    const c = s.career;
    if (!c) return reject('career.err.none');
    const r = applyAction(c.state, a), params = withMoney(s, r.params);
    if (!r.ok) return reject(r.messageKey, params);
    c.state = r.state; c.actions.push(a);
    return { ok: true, message: t(r.messageKey, params), key: r.messageKey, params };
  };
  const str = (x: unknown): string => String(x ?? '');
  return {
    /** Start a new ten-year career in a fresh district (seed: optional; the game seed by default). Replaces a career in progress. */
    careerStart: (s, seed: unknown, charter: unknown) => {
      const sd = typeof seed === 'number' && Number.isFinite(seed) ? Math.floor(Math.abs(seed)) : s.seed;
      s.career = { seed: sd, actions: [], state: buildDistrict(sd, charterArg(charter)) };
      const params = { seed: sd, customers: s.career.state.feeders.reduce((a, f) => a + f.customers, 0), feeders: s.career.state.feeders.length, years: ENDINGS.quarters / 4 };
      return { ok: true, message: t('career.started', params), key: 'career.started', params };
    },
    /** DESIGN-1.3: start this ISO week's district (the same seed and charter for everyone that week; the caller supplies the date). */
    careerWeekly: (s, year: unknown, week: unknown) => {
      const y = Number(year), w = Number(week);
      if (!Number.isFinite(y) || !Number.isFinite(w) || w < 1 || w > 53) return reject('career.err.week');
      const wd = weeklyDistrict(y, w);
      s.career = { seed: wd.seed, actions: [], state: buildDistrict(wd.seed, wd.charter), weekly: wd.key };
      const params = { week: wd.key, charter: t(`career.charter.${wd.charter}.name`) };
      return { ok: true, message: t('career.weeklyStarted', params), key: 'career.weeklyStarted', params };
    },
    /** Load a career from its code (C1/seed/actions): the actions are replayed, so the code is also the save. */
    careerLoad: (s, code: unknown, week: unknown) => {
      const d = typeof code === 'string' ? decodeCareer(code.trim()) : null;
      if (!d) return reject('career.err.code');
      const { state, rejected } = replayCareer(d.seed, d.actions, d.charter);
      if (rejected) return reject('career.err.codeRejected', { n: rejected });
      // a weekly career keeps its week when the week's district is the code's (the saved code alone cannot tell which week it was)
      const wm = typeof week === 'string' ? /^(\d{4})-W(\d{2})$/.exec(week) : null, wd = wm ? weeklyDistrict(Number(wm[1]), Number(wm[2])) : null;
      s.career = { seed: d.seed, actions: d.actions, state, ...(wd && wd.seed === d.seed && wd.charter === d.charter ? { weekly: wd.key } : {}) };
      const params = { year: Math.floor(state.t / 4) + 1, quarter: (state.t % 4) + 1 };
      return { ok: true, message: t('career.loaded', params), key: 'career.loaded', params };
    },
    careerQuit: (s) => { s.career = null; return { ok: true, message: t('career.quit'), key: 'career.quit', params: {} }; },
    /** Start a project: kind (reconductor, newFeeder, newTransformer, tieSwitch, remoteSwitch, recloser, vegetation, replaceAssets, regulator, battery, demandResponse) on a target (feeder F1, section F1.2, primary P1 or asset id). */
    careerProject: (s, kind: unknown, target: unknown) => {
      if (!(PROJECT_KINDS as unknown[]).includes(kind)) return reject('career.err.kind', { kind: str(kind), list: PROJECT_KINDS.join(', ') });
      return act(s, { a: 'start', kind: kind as ProjectKind, target: str(target) });
    },
    careerCancel: (s, id: unknown) => act(s, { a: 'cancel', id: str(id) }),
    careerInspect: (s, asset: unknown) => act(s, { a: 'inspect', asset: str(asset) }),
    /** Routine vegetation budget 0..3 (per feeder per quarter). */
    /** 1.5: storm readiness for the coming quarters, 0-2 (sticky, charged each quarter). */
    careerReadiness: (s, level: unknown) => act(s, { a: 'ready', level: Number(level) }),
    careerVegetation: (s, level: unknown) => act(s, { a: 'veg', level: Number(level) }),
    careerAccept: (s, id: unknown) => act(s, { a: 'accept', id: str(id) }),
    careerTie: (s, id: unknown) => act(s, { a: 'tie', id: str(id) }),
    careerCrew: (s, id: unknown) => act(s, { a: 'crew', id: str(id) }),
    /** End the quarter. interactive (default true): stop at the incident cards when the quarter has major events; calling it again settles the quarter. */
    careerEndQuarter: (s, interactive: unknown) => act(s, { a: 'end', interactive: interactive !== false }),
  };
}

/** Replacing a transformer or switchboard does not move the expected SAIDI (plant failures are events, not the feeder FMEA), so its card gives the chance it fails in the next year, old against new, and what a failure costs. */
/** Transformers and switchboards whose chance of failing within a year is at least 5 %, worst first, with the cost of an emergency replacement. */
function plantRisk(st: CareerState): { id: string; cls: string; health: number; pFail: number; emergencyM: number; building: boolean }[] {
  return st.assets.filter((a) => a.cls !== 'line' && !a.failed).map((a) => {
    const w = WEIBULL[a.cls], pFail = failureProb(effectiveAge(a, st.t), 1, w.beta, w.eta);
    const emergencyM = (a.cls === 'tx' ? PROJECTS.replaceTx!.capexM + MONEY.txFailureDamageM / MONEY.emergencyMult : PROJECTS.replaceSwitchgear!.capexM) * MONEY.emergencyMult;
    return { id: a.id, cls: a.cls, health: r1(trueHealth(a, st.t)), pFail, emergencyM, building: st.projects.some((p) => p.status === 'building' && p.kind === 'replaceAssets' && p.target === a.id) };
  }).filter((r) => r.pFail >= 0.05 && !r.building).sort((x, y) => y.pFail - x.pFail);
}

/** The 3-year rule ahead of the review: this year so far plus the expected rest, averaged with the period's earlier years
 * (a tester was fined for a good year because of two bad ones before it, and learned why only at the review). */
function rollingProj(st: CareerState, ytdSaidi: number, expSaidi: number): { rollingText: string; rollingOk: boolean } {
  const inP = Math.floor(st.t / 4) % INCENTIVE.periodYears, k = Math.min(INCENTIVE.rollingYears - 1, inP), past = k > 0 ? st.reviews.slice(-k).map((r) => r.saidi) : [];
  if (!past.length || st.ending) return { rollingText: '', rollingOk: true };
  const thisYear = ytdSaidi + expSaidi * (4 - (st.t % 4)) / 4, avg = (past.reduce((a, b) => a + b, 0) + thisYear) / (past.length + 1), ok = avg <= st.saidiTarget;
  return { rollingText: t(ok ? 'career.rolling.ok' : 'career.rolling.bad', { years: past.length + 1, thisYear: r1(thisYear), avg: r1(avg), target: r1(st.saidiTarget) }), rollingOk: ok };
}

/** 1.6 Storm Coast, the passive player: what readiness is costing, whether to stand it down after a settled forecast, and a nudge when cash sits idle
 * while SAIDI heads past its target (a 1.5 tester kept cash in the bank, set no readiness and lost the licence to storms they never prepared for). */
function stormAdvice(st: CareerState, m: (x: number) => string, ytdSaidi: number, expSaidi: number): { readyRunText: string; standDownText: string; stormNudgeText: string } {
  const none = { readyRunText: '', standDownText: '', stormNudgeText: '' };
  if (st.ending) return none;
  const lv = st.readiness ?? 0, costQ = STORM.readyCostQ[lv]!, spent = st.history.reduce((a, k) => a + (k.opexParts?.ready ?? 0), 0), fc = stormForecast(st);
  const readyRunText = lv > 0 ? t('career.ready.running', { level: lv, costQ: m(costQ), spent: m(spent) }) : '';
  const standDownText = lv > 0 && fc === 'calm' ? t('career.ready.standDown', { costQ: m(costQ) }) : '';
  // heading for a strike: the 3-year rule (or this year alone, early in a period) projected over the expected rest of the year
  const inP = Math.floor(st.t / 4) % INCENTIVE.periodYears, k = Math.min(INCENTIVE.rollingYears - 1, inP), past = k > 0 ? st.reviews.slice(-k).map((r) => r.saidi) : [];
  const thisYear = ytdSaidi + expSaidi * (4 - (st.t % 4)) / 4, avg = (past.reduce((a, b) => a + b, 0) + thisYear) / (past.length + 1);
  const free = st.cash - owedM(st), unhardened = st.feeders.filter((f) => !f.hardened).length;
  let stormNudgeText = '';
  if (avg > st.saidiTarget && free >= PROJECTS.harden!.capexM && (lv < 2 || unhardened > 0) && charterOf(st).storm > 1) {
    const next = Math.min(2, lv + 1);
    stormNudgeText = t('career.stormNudge', { free: m(free), avg: r1(avg), target: r1(st.saidiTarget), level: next, costQ: m(STORM.readyCostQ[next]!), cm: Math.round((1 - STORM.readyCmFactor[next]!) * 100),
      harden: m(PROJECTS.harden!.capexM), hardenPct: Math.round((1 - STORM.hardenFactor) * 100), unhardened });
  }
  return { readyRunText, standDownText, stormNudgeText };
}

/** 1.7 HUD alarm (fun-critic tester: "it needs a visible alarm on the HUD, not text inside a scrolling report"): when the year, projected over its
 * expected rest and averaged as the regulator will average it, ends over the SAIDI target. It says whether that would be a licence strike (the
 * same test as regulator.ts: the network's fair-weather SAIDI or SAIFI is over target) and how many strikes are already on the books. */
function strikeAlarm(st: CareerState, ytdSaidi: number, exp: { saidi: number; saifi: number }): string {
  if (st.ending) return '';
  const inP = Math.floor(st.t / 4) % INCENTIVE.periodYears, k = Math.min(INCENTIVE.rollingYears - 1, inP), past = k > 0 ? st.reviews.slice(-k).map((r) => r.saidi) : [];
  const thisYear = ytdSaidi + exp.saidi * (4 - (st.t % 4)) / 4, avg = (past.reduce((a, b) => a + b, 0) + thisYear) / (past.length + 1);
  if (avg <= st.saidiTarget) return '';
  const inadequate = exp.saidi > st.saidiTarget || exp.saifi > st.saifiTarget;
  return t(inadequate ? 'career.alarm.strike' : 'career.alarm.fine', { avg: r1(avg), target: r1(st.saidiTarget), strike: st.severeFineYears + 1, strikes: INCENTIVE.yearsToRevoke, exp: r1(exp.saidi) });
}

function plantWhy(st: CareerState, kind: ProjectKind, target: string): string | null {
  const a = st.assets.find((x) => x.id === target);
  if (kind !== 'replaceAssets' || !a || a.cls === 'line') return null;
  const w = WEIBULL[a.cls], pNow = failureProb(effectiveAge(a, st.t), 1, w.beta, w.eta), pNew = failureProb(0, 1, w.beta, w.eta);
  return t(a.cls === 'tx' ? 'career.why.replaceTx' : 'career.why.replaceSwitchgear', { health: r1(trueHealth(a, st.t)), pNow: r1(pNow * 100), pNew: r1(pNew * 100), mult: MONEY.emergencyMult });
}

export function buildCareerQueries(): Record<string, QueryFn<GridState>> {
  return {
    /** Everything the career screens draw. Money comes as numbers in the pack currency plus ready texts. */
    career: (s) => {
      const c = s.career;
      if (!c) return { active: false };
      const st = c.state, m = (x: number): string => moneyText(s, x), N = st.feeders.reduce((a, f) => a + f.customers, 0);
      const an = st.feeders.map((f) => analyseFeeder(st, f)), exp = districtExpected(st, an);
      const healthOf = (id: string) => { const a = st.assets.find((x) => x.id === id)!; const h = shownHealth(a, st.t); return { health: r1(h.health), inspected: h.inspected, failed: a.failed, outQ: a.outQ }; };
      const nextT = (i: number) => (st.reviews[i + 1] ? { saidi: st.reviews[i + 1]!.saidiTarget, saifi: st.reviews[i + 1]!.saifiTarget } : { saidi: st.saidiTarget, saifi: st.saifiTarget });
      const ytdSaidi = N ? st.ytdCustMin / N : 0, ytdSaifi = N ? st.ytdCustInt / N : 0;
      return {
        active: true, seed: c.seed,
        // substation plant at risk (transformers, switchboards): expected SAIDI does not count a failure, so the worst-assets list and the
        // quarter report name them with the chance of failing this year and what an emergency replacement would cost (Old Iron tester)
        plantRisk: plantRisk(st).map((r) => ({ ...r, pFail: r1(r.pFail * 100), emergencyText: m(r.emergencyM), text: t('career.plantRisk', { id: r.id, pFail: r1(r.pFail * 100), emergency: m(r.emergencyM) }) })),
        scoreParts: scoreParts(st).map((p) => ({ key: p.key, points: Math.round(p.points), text: t(`career.scorePart.${p.key}`, { points: `${p.points > 0 ? '+' : ''}${Math.round(p.points)}`, years: st.yearsMet, missed: st.missed, delivered: st.delivered, per: SCORE.perMissed }) })),
        // the 3-year rule, ahead of the review: this year as it has gone so far plus the expected rest, averaged with the period's earlier years
        // (a tester was fined for a good year because of two bad ones before it, and only learned why at the review)
        ...rollingProj(st, ytdSaidi, exp.saidi),
        // 1.5 storm levers: this quarter's forecast and the readiness levels (the storm card is a decision, not a dice roll)
        forecast: st.ending ? '' : stormForecast(st), forecastText: st.ending ? '' : t(`career.forecast.${stormForecast(st)}`),
        readiness: st.readiness ?? 0,
        ...stormAdvice(st, m, ytdSaidi, exp.saidi),
        alarmText: strikeAlarm(st, ytdSaidi, exp), alarmStrike: !st.ending && (exp.saidi > st.saidiTarget || exp.saifi > st.saifiTarget) && strikeAlarm(st, ytdSaidi, exp) !== '',
        readyLevels: [0, 1, 2].map((lv) => ({ level: lv, costQText: m(STORM.readyCostQ[lv]!), text: t(`career.ready.${lv}`, { costQ: m(STORM.readyCostQ[lv]!), cm: Math.round((1 - STORM.readyCmFactor[lv]!) * 100), ci: Math.round((1 - STORM.readyCiFactor[lv]!) * 100) }) })),
        // plant out of service after a failure: when it is back (a tester read firm margin -100 % after the 'replacement' and took it for a bug)
        plantOut: st.assets.filter((a) => a.cls !== 'line' && a.failed && a.outQ > 0).map((a) => t('career.plantOut', { id: a.id, n: a.outQ })),
        boardScore: Math.round(careerScore(st)), boardLevel: c.weekly ? `career.${c.weekly}` : '', code: encodeCareer(c.seed, c.actions, st.charter ?? 'standard'), actions: c.actions.length,
        charter: st.charter ?? 'standard', charterName: t(`career.charter.${st.charter ?? 'standard'}.name`), charterText: t(`career.charter.${st.charter ?? 'standard'}.text`), weekly: c.weekly ?? '',
        t: st.t, year: Math.floor(st.t / 4) + 1, quarter: (st.t % 4) + 1, quarters: ENDINGS.quarters, phase: st.phase, ending: st.ending,
        endingText: st.ending ? t(`career.endingName.${st.ending}`) : '', score: careerScore(st),
        // what keeps this career from Chief Engineer, in words (on the ending sheet and the last review)
        shortfalls: chiefShortfalls(st).map((k) => t(`career.short.${k}`, { met: st.yearsMet, need: ENDINGS.chiefYearsMet, cashText: m(st.cash), health: r1(avgHealth(st)), start: r1(st.startHealth) })),
        cash: careerMoney(s, st.cash), cashText: m(st.cash), creditText: m(MONEY.creditLimit), arText: m(st.ar), rabText: m(st.rab), committedQText: m(committedPerQuarter(st)), committedQ: careerMoney(s, committedPerQuarter(st)), owedText: m(owedM(st)), cashAfterText: m(st.cash - owedM(st)), borrowing: st.cash < 0,
        netIncentiveText: m(st.netIncentiveM), yearsMet: st.yearsMet, severeFineYears: st.severeFineYears, delivered: st.delivered, missed: st.missed,
        crews: st.crews, crewsFree: crewsFree(st), vegLevel: st.vegLevel, vegCostQText: m(st.vegLevel * MONEY.vegPerLevelFeederQ * st.feeders.length),
        // what each tree-cutting level buys: the expected SAIDI after a year held at that level (the same tree growth rule as turn.ts), and its cost
        vegLevels: [0, 1, 2, 3].map((lv) => { const yr = { ...st, feeders: st.feeders.map((f) => ({ ...f, veg: vegAfterYear(f.veg, lv) })) }; const e = districtExpected(yr);
          return { level: lv, saidi: r1(e.saidi), dSaidi: r1(e.saidi - exp.saidi), costQText: m(lv * MONEY.vegPerLevelFeederQ * st.feeders.length), text: t('career.vegLevel', { dSaidi: `${e.saidi - exp.saidi > 0 ? '+' : ''}${r1(e.saidi - exp.saidi)}`, costQ: m(lv * MONEY.vegPerLevelFeederQ * st.feeders.length) }) }; }),
        customers: N, health: r2(avgHealth(st)), startHealth: r2(st.startHealth),
        targets: { saidi: r1(st.saidiTarget), saifi: r2(st.saifiTarget) }, ytd: { saidi: r1(ytdSaidi), saifi: r2(ytdSaifi) }, expected: { saidi: r1(exp.saidi), saifi: r2(exp.saifi) },
        primaries: st.primaries.map((p) => ({ id: p.id, name: t(p.name), peakMva: r1(primaryPeakMVA(st, p.id)), firmMva: r1(firmCapacityMVA(st, p.id)), firmMarginPct: r1(firmMarginPct(st, p.id)),
          units: p.unitIds.map((u) => ({ id: u, ratingMva: st.assets.find((a) => a.id === u)!.ratingMVA, ...healthOf(u) })), switchgear: { id: p.switchgearId, ...healthOf(p.switchgearId) } })),
        feeders: st.feeders.map((f, i) => {
          const a = an[i]!;
          return { id: f.id, primaryId: f.primaryId, customers: f.customers, peakKw: Math.round(a.peakKw), loadingPct: r1(a.loadingPct), minV: r2(a.minVPu), maxV: r2(a.maxVPu), vViolation: a.vViolation,
            saidi: r1(a.rel.saidi), saifi: r2(a.rel.saifi), veg: r2(f.veg), tie: f.tie, recloser: f.recloser, hardened: !!f.hardened, regulator: f.regulator, batteryKw: f.batteryKw, drKw: Math.round(f.drKw), solarKw: f.solarKw,
            sections: f.sections.map((sec) => ({ id: sec.id, km: sec.lengthKm, conductor: sec.conductor, device: sec.device, assetId: sec.assetId, ...healthOf(sec.assetId) })) };
        }),
        projects: st.projects.map((p) => ({ id: p.id, kind: p.kind, kindName: t(`career.kind.${p.kind}`), target: p.target, left: p.left, leadQ: p.leadQ, crew: p.crew, status: p.status, capexText: m(p.capexM), spentText: m(p.spentM) })),
        requests: st.requests.map((r) => {
          const f0 = st.feeders.find((f) => f.id === r.feederId);   // the feeder's peak loading once this load is connected (what accepting does to it)
          const wst = { ...st, t: st.t % 4 === 0 ? st.t : st.t + 4 - (st.t % 4) };   // both read at the next winter peak, where the load index judges (a tester saw 96 % promised in autumn, 115 % in winter)
          const after = f0 ? analyseFeeder(wst, { ...f0, customers: f0.customers + r.customers, baseKw: f0.baseKw + r.kw, solarKw: f0.solarKw + r.solarKw }).loadingPct : 0;
          const before = f0 ? analyseFeeder(wst, f0).loadingPct : 0;
          return { id: r.id, kind: r.kind, kindName: t(`career.conn.${r.kind}`), feederId: r.feederId, kw: r.kw, customers: r.customers, solarKw: r.solarKw, critical: r.critical, chargeText: m(r.chargeM), deadlineQ: r.deadlineQ, quartersLeft: r.deadlineQ - st.t, loadingAfterPct: r1(after), loadingWinterPct: r1(before) };
        }),
        incidents: st.incidents.map((x) => ({ ...x, kindName: t(`career.incident.${x.kind}`), custMin: Math.round(x.custMin), saidiMin: r1(N ? x.custMin / N : 0) })),
        history: st.history.map((k) => ({ t: k.t, year: k.year + 1, quarter: k.quarter + 1, saidiReal: r1(k.saidiReal), saidiExp: r1(k.saidiExp), saifiReal: r2(k.saifiReal), saifiExp: r2(k.saifiExp), saidiYtd: r1(k.saidiYtd), saifiYtd: r2(k.saifiYtd),
          cash: careerMoney(s, k.cash), cashText: m(k.cash), capexText: m(k.capexM), opexPartsText: k.opexParts ? t('career.opexParts', { base: m(k.opexParts.base), repairs: m(k.opexParts.repairs), losses: m(k.opexParts.losses), dr: m(k.opexParts.dr), veg: m(k.opexParts.veg), voltage: m(k.opexParts.voltage) }) + (k.opexParts.ready ? ' ' + t('career.opexReady', { ready: m(k.opexParts.ready) }) : '') : '',
          emergencyText: (k.emergencyM ?? 0) > 0 ? t('career.emergency', { emergency: m(k.emergencyM ?? 0), mult: MONEY.emergencyMult }) : '', opexText: m(k.opexM), revenueText: m(k.revenueM), incentiveText: m(k.incentiveM), avgHealth: r2(k.avgHealth), worstHealth: r2(k.worstHealth),
          lossesMWh: Math.round(k.lossesMWh), delivered: k.delivered, missed: k.missed, vViolations: k.vViolations, firmMarginPct: r1(k.firmMarginPct), maxLoadingPct: r1(k.maxLoadingPct), faults: k.faults })),
        reviews: st.reviews.map((rv, i) => ({ year: rv.year + 1, saidi: r1(rv.saidi), saifi: r2(rv.saifi), saidiTarget: r1(rv.saidiTarget), saifiTarget: r2(rv.saifiTarget), met: rv.met, incentiveText: m(rv.incentiveM), incentive: careerMoney(s, rv.incentiveM),
          avgHealth: r2(rv.avgHealth), cashText: m(rv.cash), rabText: m(rv.rab), overloaded: rv.overloaded ?? 0, firmShort: rv.firmShort ?? 0, saidiRolling: r1(rv.saidiRolling ?? rv.saidi), saifiRolling: r2(rv.saifiRolling ?? rv.saifi),
          nextText: rv.year + 1 < ENDINGS.quarters / 4 && rv.year % INCENTIVE.periodYears !== INCENTIVE.periodYears - 1 ? (() => { const pct = (1 - nextT(i).saidi / rv.saidiTarget) * 100, fast = pct > INCENTIVE.targetTightenPct + 0.05;
            return t(fast ? 'career.review.nextFast' : 'career.review.next', { saidiTarget: r1(nextT(i).saidi), saifiTarget: r2(nextT(i).saifi), tightenPct: fast ? r1(pct) : INCENTIVE.targetTightenPct }); })() : '',
          resetText: rv.year + 1 < ENDINGS.quarters / 4 && rv.year % INCENTIVE.periodYears === INCENTIVE.periodYears - 1 ? t('career.review.reset', { resetPct: Math.round(INCENTIVE.resetFactor * 100), cutPct: INCENTIVE.maxResetCutPct, saidiTarget: r1(nextT(i).saidi), saifiTarget: r2(nextT(i).saifi) }) : '',
          verdicts: rv.verdicts.map((v) => { const p = withMoney(s, { ...v.params, saidi: r1(Number(v.params.saidi ?? 0)), saifi: r2(Number(v.params.saifi ?? 0)), saidiYear: r1(Number(v.params.saidiYear ?? v.params.saidi ?? 0)), saidiTarget: r1(Number(v.params.saidiTarget ?? 0)), saifiTarget: r2(Number(v.params.saifiTarget ?? 0)), health: r1(Number(v.params.health ?? 0)), prevHealth: r1(Number(v.params.prevHealth ?? 0)) });
            return { axis: v.axis, who: t(`career.who.${v.axis}`), grade: v.grade, text: t(v.key, p) }; }) })),
        allowedRevenueText: m(allowedRevenue(st.rab, st.opexAllowance)),
        // the year a price-control period ends: say what the reset will do, before it happens
        resetWarnText: Math.floor(st.t / 4) % INCENTIVE.periodYears === INCENTIVE.periodYears - 1 && st.t < ENDINGS.quarters - 4 && !st.ending ? (() => { const nt = periodReset(st.saidiTarget * (1 - INCENTIVE.targetTightenPct / 100), st.saifiTarget * (1 - INCENTIVE.targetTightenPct / 100), exp); return t('career.resetWarn', { resetPct: Math.round(INCENTIVE.resetFactor * 100), cutPct: INCENTIVE.maxResetCutPct, saidiNow: r1(st.saidiTarget), saidiNext: r1(nt.saidi), saifiNext: r2(nt.saifi) }); })() : '',
        crewCostText: m(MONEY.dispatchM * (crewsFree(st) >= 1 ? 1 : 2)), tieSavingPct: 35, crewSavingPct: 20,
      };
    },
    /** Price, lead time and expected effect of a project before it is started (the board's card): the "why this helps" line in the player's own numbers. */
    /** DESIGN-1.3: the ways into a career: every charter with its pressure, and this ISO week's district (the caller supplies the date). */
    /** The ISO week of a calendar date (year, month 1-12, day), for careerWeekly / careerCharters. */
    careerWeek: (_s, year: unknown, month: unknown, day: unknown) => isoWeekOf(Number(year), Number(month), Number(day)),
    careerCharters: (_s, year: unknown, week: unknown) => {
      const y = Number(year), w = Number(week), ok = Number.isFinite(y) && Number.isFinite(w) && w >= 1 && w <= 53;
      const wd = ok ? weeklyDistrict(y, w) : null;
      return {
        charters: CHARTER_IDS.map((id) => ({ id, name: t(`career.charter.${id}.name`), text: t(`career.charter.${id}.text`) })),
        weekly: wd ? { key: wd.key, seed: wd.seed, charter: wd.charter, name: t(`career.charter.${wd.charter}.name`), text: t(`career.charter.${wd.charter}.text`) } : null,
      };
    },
    careerQuote: (s, kind: unknown, target: unknown) => {
      const c = s.career;
      if (!c || !(PROJECT_KINDS as unknown[]).includes(kind)) return { ok: false, text: t('career.err.none') };
      const p = previewProject(c.state, kind as ProjectKind, String(target ?? '')), q = p.quote;
      const params = withMoney(s, { kind: q.kind, target: q.target, capexM: q.capexM, leadQ: q.leadQ, crew: q.crew, dSaidi: r1(p.dSaidi), dSaifi: r2(p.dSaifi), loadingBefore: Math.round(p.loadingBeforePct), loadingAfter: Math.round(p.loadingAfterPct),
        firmBefore: Math.round(p.firmBeforePct), firmAfter: Math.round(p.firmAfterPct), allowedPct: Math.round(p.allowedShare * 100) });
      return { ok: q.ok, kind: q.kind, target: q.target, capex: careerMoney(s, q.capexM), capexText: params.capex, leadQ: q.leadQ, crew: q.crew, dSaidi: r1(p.dSaidi), dSaifi: r2(p.dSaifi),
        loadingBeforePct: r1(p.loadingBeforePct), loadingAfterPct: r1(p.loadingAfterPct), firmBeforePct: r1(p.firmBeforePct), firmAfterPct: r1(p.firmAfterPct), allowedPct: Math.round(p.allowedShare * 100),
        // a project that would take cash below zero once everything already building is paid for says so before you start it
        overdrawText: q.ok && c.state.cash - owedM(c.state) - q.capexM < 0 ? t('career.overdraw', { after: moneyText(s, c.state.cash - owedM(c.state) - q.capexM), credit: moneyText(s, MONEY.creditLimit) }) : '',
        text: t(q.ok ? 'career.quote' : q.messageKey, params), why: q.ok ? plantWhy(c.state, kind as ProjectKind, String(target ?? '')) ?? t(p.whyKey, params) : '' };
    },
    /** The board: for every project kind, the targets it can be built on now with price and lead time (no effect study; careerQuote gives that). */
    careerBoard: (s) => {
      const c = s.career;
      if (!c) return { active: false };
      const st = c.state, targets: Record<ProjectKind, string[]> = {
        reconductor: st.feeders.flatMap((f) => f.sections.map((x) => x.id)), remoteSwitch: st.feeders.flatMap((f) => f.sections.map((x) => x.id)),
        newFeeder: st.feeders.map((f) => f.id), newTransformer: st.primaries.map((p) => p.id),
        tieSwitch: st.feeders.map((f) => f.id), recloser: st.feeders.map((f) => f.id), harden: st.feeders.map((f) => f.id), vegetation: st.feeders.map((f) => f.id), regulator: st.feeders.map((f) => f.id), battery: st.feeders.map((f) => f.id), demandResponse: st.feeders.map((f) => f.id),
        replaceAssets: st.assets.map((a) => a.id),
      };
      return { active: true, kinds: PROJECT_KINDS.map((k) => ({ kind: k, name: t(`career.kind.${k}`), blurb: t(`career.blurb.${k}`),
        options: targets[k].map((tg) => quoteProject(st, k, tg)).filter((q) => q.ok).map((q) => ({ target: q.target, capexText: moneyText(s, q.capexM), capex: careerMoney(s, q.capexM), leadQ: q.leadQ, crew: q.crew })) })) };
    },
  };
}
