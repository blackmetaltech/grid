// Test personas: idle, firefighter (reacts only), goldPlater (builds everything affordable), planner (the reference heuristic).
import { dmath } from '@core/numerics';
import { shownHealth, trueHealth, wearRate } from './ageing';
import { INCENTIVE, MONEY, WEIBULL } from './data';
import { analyseFeeder, conductorRow, stormUplift, type FeederAnalysis } from './district';
import { forecastPeakKw } from './growth';
import { committedPerQuarter, crewsFree, primaryFeeders, quoteProject, reliabilityDelta } from './projects';
import { applyAction, type CareerAction } from './replay';
import { buildDistrict } from './district';
import { careerScore } from './regulator';
import { totalCustomers, type CareerState, type ProjectKind } from './state';
import { endQuarter } from './turn';

export interface Persona { name: string; plan: (s: CareerState) => CareerAction[]; respond: (s: CareerState) => CareerAction[] }
type Doer = { s: CareerState; acts: CareerAction[]; do: (a: CareerAction) => boolean };
const doer = (s0: CareerState): Doer => {
  const d: Doer = { s: s0, acts: [], do: (a) => { const r = applyAction(d.s, a); if (r.ok) { d.s = r.state; d.acts.push(a); } return r.ok; } };
  return d;
};
const respondAll = (s: CareerState): CareerAction[] => {
  const d = doer(s);
  for (const i of s.incidents) { if (i.hasTie) d.do({ a: 'tie', id: i.id }); d.do({ a: 'crew', id: i.id }); }
  return d.acts;
};
const lineAssets = (s: CareerState) => s.assets.filter((a) => a.cls === 'line');

export const idle: Persona = { name: 'idle', plan: () => [], respond: () => [] };

/** Reacts only: answers incidents, fixes assets that have failed (line with a patched fault, 2+ patches), accepts every connection request. */
export const firefighter: Persona = {
  name: 'firefighter',
  respond: respondAll,
  plan: (s) => {
    const d = doer(s);
    for (const r of s.requests) d.do({ a: 'accept', id: r.id });
    for (const a of lineAssets(d.s).filter((x) => x.failed && x.wearFaults >= 2)) {
      if (d.s.cash < 1) break;
      d.do({ a: 'start', kind: 'replaceAssets', target: a.id });
    }
    return d.acts;
  },
};

/** Builds everything it can afford (it will borrow up to half the credit limit), in a fixed priority order. */
export const goldPlater: Persona = {
  name: 'goldPlater',
  respond: respondAll,
  plan: (s) => {
    const d = doer(s);
    for (const r of s.requests) d.do({ a: 'accept', id: r.id });
    d.do({ a: 'veg', level: 3 });
    const can = (kind: ProjectKind, target: string): boolean => {
      const q = quoteProject(d.s, kind, target);
      return q.ok && q.crew <= crewsFree(d.s) && d.s.cash + MONEY.creditLimit * 0.5 - committedPerQuarter(d.s) * 3 >= q.capexM;
    };
    const go = (kind: ProjectKind, target: string): void => { if (can(kind, target)) d.do({ a: 'start', kind, target }); };
    for (const p of d.s.primaries) { go('newTransformer', p.id); go('newFeeder', p.id); }
    for (const f of d.s.feeders) {
      go('tieSwitch', f.id); go('recloser', f.id); go('regulator', f.id); go('battery', f.id); go('demandResponse', f.id); go('vegetation', f.id);
      f.sections.forEach((sec, i) => { go('reconductor', sec.id); if (i > 0) go('remoteSwitch', sec.id); go('replaceAssets', sec.assetId); });
    }
    for (const a of d.s.assets.filter((x) => x.cls !== 'line')) go('replaceAssets', a.id);
    return d.acts;
  },
};

const sqrt3 = dmath.sqrt(3);
/** The reference heuristic: accept what fits, inspect the old, replace the worst, reinforce what the forecast overloads, buy cheap reliability, keep cash positive. */
export const planner: Persona = {
  name: 'planner',
  respond: respondAll,
  plan: (s) => {
    const d = doer(s);
    const free = (capex: number, lead: number, reserve = 0.8): boolean => d.s.cash - reserve - committedPerQuarter(d.s) * 2 >= capex / lead;
    const nice = (capex: number, lead: number): boolean => committedPerQuarter(d.s) < 1.1 && free(capex, lead, 1.2);
    const an: Record<string, FeederAnalysis> = {};
    for (const f of d.s.feeders) an[f.id] = analyseFeeder(d.s, f);
    const N = totalCustomers(d.s);
    const loadAfter = (fid: string, kw: number): number => { const f = d.s.feeders.find((x) => x.id === fid)!; const a = an[fid]!; return a.loadingPct * ((a.peakKw + kw) / Math.max(1, a.peakKw)) + (f ? 0 : 0); };
    // 1. connections: accept when the feeder stays under 100 % (or a fix is already building, or the deadline is near and it stays under 115 %)
    const fixing = (fid: string): boolean => d.s.projects.some((p) => p.status === 'building' && (p.kind === 'reconductor' || p.kind === 'newFeeder') && (p.target === fid || p.target.startsWith(fid + '.') || d.s.feeders.find((f) => f.id === fid)?.primaryId === p.target));
    for (const r of d.s.requests) {
      const la = loadAfter(r.feederId, r.kw);
      if (la <= 100 || (r.deadlineQ <= d.s.t + 1 && la <= 115) || (fixing(r.feederId) && la <= 110) || r.kw === 0) d.do({ a: 'accept', id: r.id });
    }
    const pendingKw: Record<string, number> = {};
    for (const r of d.s.requests) pendingKw[r.feederId] = (pendingKw[r.feederId] ?? 0) + r.kw;
    // 2. inspections: old assets whose health is only an estimate
    let ins = 0;
    for (const a of d.s.assets.filter((x) => !shownHealth(x, d.s.t).inspected).sort((x, y) => x.installQ - y.installQ)) {
      if (ins >= 3 || d.s.cash < 1) break;
      if ((d.s.t - a.installQ) / 4 >= 28 && d.do({ a: 'inspect', asset: a.id })) ins++;
    }
    // 3. replace: plant (transformers, switchboards) by shown health; lines by value (expected incentive saved per year vs cost)
    const plant = d.s.assets.filter((x) => x.cls !== 'line').map((x) => ({ a: x, h: shownHealth(x, d.s.t).health })).filter((x) => x.h <= 3.2).sort((x, y) => x.h - y.h);
    for (const { a } of plant.slice(0, 1)) {
      const q = quoteProject(d.s, 'replaceAssets', a.id);
      if (q.ok && crewsFree(d.s) >= q.crew && free(q.capexM, q.leadQ, 1.0)) d.do({ a: 'start', kind: 'replaceAssets', target: a.id });
    }
    const lines: { id: string; score: number; capex: number; lead: number }[] = [];
    for (const f of d.s.feeders) f.sections.forEach((sec, i) => {
      const as = d.s.assets.find((x) => x.id === sec.assetId)!;
      if (d.s.projects.some((p) => p.status === 'building' && (p.target === sec.id || p.target === sec.assetId))) return;
      const q = quoteProject(d.s, 'replaceAssets', as.id); if (!q.ok) return;
      const sh = shownHealth(as, d.s.t).health, tEst = ((10 - sh) * 1.2 * WEIBULL.line.eta) / 9;
      const now = wearRate({ ...as, installQ: d.s.t - tEst * 4, wear: 1, extraYears: 0 }, d.s.t), pf = an[f.id]!.perFault[i]!;
      const val = now * WEIBULL.line.wearPerKm * sec.lengthKm * (1 + stormUplift(f.veg)) * (INCENTIVE.cmiRateM * pf.cm + INCENTIVE.cifRateM * pf.ci);
      lines.push({ id: as.id, score: val / q.capexM, capex: q.capexM, lead: q.leadQ });
    });
    lines.sort((x, y) => y.score - x.score);
    let rep = 0;
    for (const l of lines) {
      if (rep >= 3 || l.score < 1 / 10) break;
      if (crewsFree(d.s) >= 1 && free(l.capex, l.lead, 0.6) && d.do({ a: 'start', kind: 'replaceAssets', target: l.id })) rep++;
    }
    // 4. reinforce: feeders forecast over 92 % of rating within 6 quarters, primaries forecast below 8 % firm margin within 8 quarters
    for (const p of d.s.primaries) {
      const peak = primaryFeeders(d.s, p.id).reduce((x, f) => x + forecastPeakKw(f, d.s.t, 8), 0) / 1000 / 0.95;
      const firm = d.s.assets.filter((a) => a.cls === 'tx' && a.primaryId === p.id && !a.failed).map((a) => a.ratingMVA);
      const cap = firm.reduce((x, y) => x + y, 0) - Math.max(...firm, 0);
      if ((100 * (cap - peak)) / peak < 8 && !d.s.projects.some((x) => x.status === 'building' && x.kind === 'newTransformer' && x.target === p.id)) {
        const q = quoteProject(d.s, 'newTransformer', p.id);
        if (q.ok && free(q.capexM, q.leadQ)) d.do({ a: 'start', kind: 'newTransformer', target: p.id });
      }
    }
    for (const f of d.s.feeders) {
      const a = an[f.id]!, pk = forecastPeakKw(f, d.s.t, 6) + (pendingKw[f.id] ?? 0), fc = (a.loadingPct * pk) / Math.max(1, a.peakKw);
      if (fc < 90) continue;
      const iHead = pk / (sqrt3 * 11 * 0.95);
      let best = -1, bl = 0, down = 1;
      f.sections.forEach((sec, i) => { const dn = f.sections.slice(i).reduce((x, y) => x + y.share, 0); const l = (iHead * dn) / conductorRow(sec.conductor).ampacityA; if (l > bl) { bl = l; best = i; } down = dn; });
      void down;
      const inFlight = d.s.projects.some((p) => p.status === 'building' && (p.target === f.id || f.sections.some((x) => x.id === p.target)) && (p.kind === 'reconductor' || p.kind === 'newFeeder'));
      if (inFlight || best < 0) continue;
      const q = quoteProject(d.s, 'reconductor', f.sections[best]!.id);
      if (q.ok && free(q.capexM, q.leadQ)) d.do({ a: 'start', kind: 'reconductor', target: f.sections[best]!.id });
      else if (!q.ok && q.messageKey === 'career.err.maxConductor' && free(2.8, 4)) d.do({ a: 'start', kind: 'newFeeder', target: f.primaryId });
    }
    // 5. voltage problems
    for (const f of d.s.feeders) if (an[f.id]!.vViolation && !f.regulator && free(0.22, 2)) d.do({ a: 'start', kind: 'regulator', target: f.id });
    // 6. reliability: the worst SAIDI contributors, value = incentive per year the project is expected to earn, payback under 15 years
    const behind = (d.s.ytdCustMin / Math.max(1, N)) > d.s.saidiTarget * ((d.s.t % 4) / 4) * 1.0;
    const order = [...d.s.feeders].sort((x, y) => an[y.id]!.rel.saidi * y.customers - an[x.id]!.rel.saidi * x.customers).slice(0, 4);
    const opts: { kind: ProjectKind; target: string; score: number; capex: number; lead: number }[] = [];
    for (const f of order) {
      const cand: [ProjectKind, string][] = [['tieSwitch', f.id], ['recloser', f.id]];
      f.sections.forEach((sec, i) => { if (i > 0) cand.push(['remoteSwitch', sec.id]); });
      for (const [k, t] of cand) {
        const q = quoteProject(d.s, k, t); if (!q.ok) continue;
        const pv = reliabilityDelta(d.s, k as 'tieSwitch' | 'recloser' | 'remoteSwitch', t), val = -(pv.dSaidi * INCENTIVE.cmiRateM + pv.dSaifi * INCENTIVE.cifRateM) * N;
        if (val > 0) opts.push({ kind: k, target: t, score: val / (q.capexM * (behind ? 0.7 : 1)), capex: q.capexM, lead: q.leadQ });
      }
    }
    opts.sort((x, y) => y.score - x.score);
    let started = 0;
    for (const o of opts) {
      if (started >= 2 || o.score < 1 / 15) break;
      if (nice(o.capex, o.lead) && d.do({ a: 'start', kind: o.kind, target: o.target })) started++;
    }
    // 7. vegetation
    const meanVeg = d.s.feeders.reduce((x, f) => x + f.veg, 0) / d.s.feeders.length;
    d.do({ a: 'veg', level: meanVeg > 0.6 ? 2 : meanVeg < 0.25 ? 0 : 1 });
    void trueHealth;
    return d.acts;
  },
};

export const PERSONAS: Persona[] = [idle, firefighter, goldPlater, planner];

/** Play a career with a persona (interactive incidents are answered by `respond`). Returns the final state and the full action list (a replayable career). */
export function runPersona(seed: number, p: Persona, quarters = 40): { state: CareerState; actions: CareerAction[]; score: number } {
  let s = buildDistrict(seed);
  const actions: CareerAction[] = [];
  while (s.phase !== 'over' && s.t < quarters) {
    const d = doer(s);
    for (const a of p.plan(s)) d.do(a);
    actions.push(...d.acts); s = d.s;
    const r = endQuarter(s, true); actions.push({ a: 'end', interactive: true }); s = r.state;
    if (s.phase === 'incident') {
      const d2 = doer(s);
      for (const a of p.respond(s)) d2.do(a);
      actions.push(...d2.acts); s = d2.s;
      const r2 = endQuarter(s, true); actions.push({ a: 'end', interactive: true }); s = r2.state;
    }
  }
  return { state: s, actions, score: careerScore(s) };
}
