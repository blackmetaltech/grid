// The quarter: instalments and completions, growth, ageing, analysis, events, incident responses, money, review, endings.
import { MONEY, PROJECT_DETAIL } from './data';
import { avgHealth, worstHealth } from './ageing';
import { analyseFeeder, districtExpected, charterOf } from './district';
import { rollQuarter } from './events';
import { baseOpexQ, interestQ, rabNext } from './money';
import { allowedShare, completeProject, overrun, renewAsset } from './projects';
import { annualReview, endingOf } from './regulator';
import { quarterFactor } from './growth';
import { INCIDENT_CREW_SAVING, INCIDENT_TIE_SAVING } from './events';
import { clone, fail, ok, totalCustomers, type ActionResult, type CareerState, type QuarterOutcome } from './state';

/** Play the quarter. interactive = true pauses when incidents occurred (phase 'incident'; answer with switchTie / dispatchCrew, then call endQuarter again). */
export function endQuarter(state: CareerState, interactive = false): ActionResult {
  if (state.phase === 'over') return fail(state, 'career.err.phase');
  const s = clone(state);
  if (s.phase === 'plan') {
    const out = roll(s);
    s.pending = out;
    if (interactive && s.incidents.length) { s.phase = 'incident'; return ok(s, 'career.incidents', { count: s.incidents.length }); }
  }
  return settle(s);
}

function roll(s: CareerState): QuarterOutcome {
  let capexM = 0, rabAddM = 0;
  const completed: string[] = [];
  // 1. instalments and completions
  for (const p of s.projects) {
    if (p.status !== 'building') continue;
    const inst = p.capexM / p.leadQ;
    capexM += inst; p.spentM += inst; p.left--;
    if (p.left <= 0) {
      const f = overrun(s.seed, s.t, p.id), extra = p.capexM * (f - 1);
      capexM += extra; p.spentM += extra;
      rabAddM += p.capexM * f * allowedShare(s, p.kind, p.target);
      completeProject(s, p); completed.push(p.id);
    }
  }
  // 2. load growth
  for (const f of s.feeders) f.baseKw *= quarterFactor(f.growthPct);
  // 3. analysis, events
  const an = s.feeders.map((f) => analyseFeeder(s, f));
  const r = rollQuarter(s, an);
  s.incidents = r.incidents;
  s.requests.push(...r.newRequests);
  const { incidents: _i, newRequests: _n, ...out } = r;
  void _i; void _n;
  return { ...out, capexM, rabAddM, completed };
}

function settle(s: CareerState): ActionResult {
  const out = s.pending!, N = totalCustomers(s);
  // incident responses
  let incMin = 0, incInt = 0, exMin = 0;
  for (const i of s.incidents) {
    const cm = i.custMin * (1 - (i.tied ? INCIDENT_TIE_SAVING : 0)) * (1 - (i.crewed ? INCIDENT_CREW_SAVING : 0));
    if (i.exceptional) exMin += cm; else { incMin += cm; incInt += i.custInt; }
  }
  const custMin = out.custMin + incMin, custInt = out.custInt + incInt;
  s.ytdCustMin += custMin; s.ytdCustInt += custInt; s.ytdExceptionalMin += exMin;
  // repairs / replacements of failed primaries' plant
  for (const a of s.assets) {
    if (a.cls === 'line' || !a.failed) continue;
    if (a.cls === 'switchgear') renewAsset(a, s.t + 1);
    else if (a.outQ > 0 && --a.outQ === 0) { renewAsset(a, s.t + 1); out.rabAddM += 0; }
  }
  out.rabAddM += out.emergencyCapexM;
  // money
  const revenue = s.ar / 4;
  const drCost = s.projects.filter((p) => p.status === 'active' && p.kind === 'demandResponse').length * PROJECT_DETAIL.drCostQ;
  const vegCost = s.vegLevel * MONEY.vegPerLevelFeederQ * s.feeders.length;
  const baseQ = baseOpexQ(N, s.crews), lossQ = (out.lossesMWh * MONEY.lossCostPerMWh) / 1e6, vQ = out.vViolations * 0.01 * charterOf(s).vPenalty;
  const opex = baseQ + out.repairCostM + lossQ + drCost + vegCost + vQ;
  const capex = out.capexM + out.emergencyCapexM;
  s.cash += revenue - opex - capex + interestQ(s.cash);
  s.rab = rabNext(s.rab, out.rabAddM);
  for (const f of s.feeders) f.veg = Math.max(0.05, Math.min(1, f.veg + 0.06 - 0.07 * s.vegLevel));
  // KPI row
  const saidiYtdBefore = N ? s.ytdCustMin / N : 0, saifiYtdBefore = N ? s.ytdCustInt / N : 0;
  const t = s.t;
  let incentiveBooked = 0;
  const reviewed = t % 4 === 3;
  if (reviewed) { const rv = annualReview(s); incentiveBooked = rv.incentiveM; }
  const ex = districtExpected(s);
  s.history.push({
    t, year: Math.floor(t / 4), quarter: t % 4, saidiReal: N ? custMin / N : 0, saifiReal: N ? custInt / N : 0, saidiExp: out.expSaidiQ, saifiExp: out.expSaifiQ,
    saidiYtd: saidiYtdBefore, saifiYtd: saifiYtdBefore, lossesMWh: out.lossesMWh, capexM: capex, opexM: opex, revenueM: revenue, incentiveM: incentiveBooked, cash: s.cash, rab: s.rab,
    avgHealth: avgHealth(s), worstHealth: worstHealth(s), delivered: s.delivered, missed: s.missed, vViolations: out.vViolations, firmMarginPct: out.firmMarginPct,
    maxLoadingPct: out.maxLoadingPct, customers: N, faults: out.faults, emergencyM: out.emergencyCapexM,
    opexParts: { base: baseQ, repairs: out.repairCostM, losses: lossQ, dr: drCost, veg: vegCost, voltage: vQ },
  });
  void ex;
  s.projects = s.projects.filter((p) => p.status === 'building' || p.status === 'active');
  s.t = t + 1;
  for (const r of s.requests.filter((x) => x.deadlineQ < s.t)) s.missed += r.critical ? 2 : 1;
  s.requests = s.requests.filter((x) => x.deadlineQ >= s.t);
  s.incidents = []; s.pending = null;
  s.ending = endingOf(s, reviewed);
  s.phase = s.ending ? 'over' : 'plan';
  return ok(s, s.ending ? `career.ending.${s.ending}` : 'career.quarter.done', { t: s.t, cash: s.cash });
}
