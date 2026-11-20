// Seeded events of a quarter (storms, faults, asset failures, connection requests) and the in-incident actions.
import { dmath } from '@core/numerics';
import type { Rng } from '@core/kit';
import { runCycle } from '../sim/distrib';
import { fnv, systemRng } from '../sim/rngs';
import { CONN, CONNECTIONS, MONEY, PEAK_DAY_SHARE, PROJECTS, SHAPES, WEATHER, WEIBULL } from './data';
import { effectiveAge, failureProb, thermalYearsFromLoL } from './ageing';
import { analyseFeeder, charterOf, wearShare, type FeederAnalysis } from './district';
import { hourlyLoad } from './growth';
import { crewsFree, primaryFeeders } from './projects';
import { fail, feederById, ok, type ActionResult, type CareerState, type Feeder, type Incident, type QuarterOutcome, type Request } from './state';

/** Poisson draw: Knuth's product method for small means, a rounded normal for mean above 30. */
export function poisson(r: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 30) return Math.max(0, dmath.round(mean + dmath.sqrt(mean) * r.normal()));
  const L = dmath.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= r.next(); } while (p > L);
  return k - 1;
}

const HOURS_Q = 91 * 24;
const SHED_PEAK_HOURS = 30;

/** Roll the quarter's random events on a (mutable) cloned state; `an` is the analysis of every feeder at the start of the quarter. */
export interface Rolled extends QuarterOutcome { incidents: Incident[]; newRequests: Request[] }
export function rollQuarter(s: CareerState, an: FeederAnalysis[]): Rolled {
  const t = s.t, season = t % 4;
  const out: Rolled = { capexM: 0, rabAddM: 0, completed: [], custInt: 0, custMin: 0, exceptionalMin: 0, faults: 0, repairCostM: 0, lossesMWh: 0, vViolations: 0, maxLoadingPct: 0, firmMarginPct: 1e9, emergencyCapexM: 0, heat: false, expSaidiQ: 0, expSaifiQ: 0, incidents: [], newRequests: [], storms: 0 };
  const N = s.feeders.reduce((a, f) => a + f.customers, 0);
  let nInc = 0;
  const wearAttribute = (fi: number, si: number, r: Rng, n: number): void => {
    const f = s.feeders[fi]!, a = s.assets.find((x) => x.id === f.sections[si]!.assetId)!, pw = wearShare(f, si, s.assets, t);
    for (let k = 0; k < n; k++) if (r.next() < pw) { a.wearFaults++; a.failed = true; }
  };
  // 1. calm faults, section by section
  s.feeders.forEach((f, fi) => {
    const A = an[fi]!, r = systemRng(s.seed, t, fnv(f.id), 'calm');
    out.maxLoadingPct = Math.max(out.maxLoadingPct, A.loadingPct);
    if (A.vViolation) out.vViolations++;
    out.lossesMWh += (A.lossKwPeak * 0.3 * HOURS_Q) / 1000;
    f.sections.forEach((_, si) => {
      const n = poisson(r, (A.calmLambda[si]! * 91) / 365);
      out.faults += n; out.custInt += n * A.perFault[si]!.ci; out.custMin += n * A.perFault[si]!.cm;
      wearAttribute(fi, si, r, n);
    });
    out.expSaidiQ += (f.customers * A.rel.saidi) / N / 4; out.expSaifiQ += (f.customers * A.rel.saifi) / N / 4;
  });
  out.repairCostM += out.faults * 0.006;
  // 2. storms (district-wide), severity 0.5 + 2.5 u^2; faults on top of the calm rate for the storm days
  const rs = systemRng(s.seed, t, 0, 'storms');
  const nStorms = poisson(rs, WEATHER.stormRate[season]! * charterOf(s).storm);
  out.storms = nStorms;
  for (let j = 0; j < nStorms; j++) {
    const u = rs.next(), sev = 0.5 + 2.5 * u * u, exceptional = sev > WEATHER.exceptionalSeverity;
    let ci = 0, cm = 0, nf = 0, worst = -1, worstCm = -1;
    s.feeders.forEach((f, fi) => {
      const A = an[fi]!, r = systemRng(s.seed, t, fnv(f.id) + j + 1, 'storm');
      let fcm = 0;
      f.sections.forEach((_, si) => {
        const n = poisson(r, A.calmLambda[si]! * WEATHER.stormMult * sev * (0.5 + f.veg) * (WEATHER.stormDays / 365));
        nf += n; ci += n * A.perFault[si]!.ci; cm += n * A.perFault[si]!.cm; fcm += n * A.perFault[si]!.cm;
        wearAttribute(fi, si, r, n);
      });
      if (fcm > worstCm) { worstCm = fcm; worst = fi; }
    });
    out.faults += nf; out.repairCostM += nf * 0.006 * 1.5;
    if (nf >= 3 || exceptional) {
      const wf = worst >= 0 ? s.feeders[worst]! : null;
      out.incidents.push({ id: `I${t}-${nInc++}`, q: t, kind: 'storm', feederId: wf?.id ?? null, primaryId: wf?.primaryId ?? null, severity: sev, faults: nf, custInt: ci, custMin: cm, exceptional, tied: false, crewed: false, hasTie: !!wf?.tie });
    } else if (!exceptional) { out.custInt += ci; out.custMin += cm; }
  }
  // 3. heatwave in the third quarter
  const rh = systemRng(s.seed, t, 0, 'heat');
  out.heat = season === 2 && rh.next() < Math.min(0.9, WEATHER.heatwaveProbQ3 * charterOf(s).heat);
  // 4. primaries: thermal cycle, shedding while a unit is out, new failures
  const anyTie = s.feeders.some((f) => f.tie);
  for (const pr of s.primaries) {
    const fs = primaryFeeders(s, pr.id), N_p = fs.reduce((a, f) => a + f.customers, 0);
    const mva: number[] = [];
    for (let h = 0; h < 24; h++) mva.push(fs.reduce((a, f) => a + hourlyLoad(f, t, out.heat).net[h]!, 0) / 1000 / 0.95);
    const peakMva = Math.max(...mva);
    const units = s.assets.filter((a) => a.cls === 'tx' && a.primaryId === pr.id);
    const inService = units.filter((u) => !u.failed), capIn = inService.reduce((a, u) => a + u.ratingMVA, 0);
    const firm = (capIn - (inService.length ? Math.max(...inService.map((u) => u.ratingMVA)) : 0));
    out.firmMarginPct = Math.min(out.firmMarginPct, peakMva > 0 ? (100 * (firm - peakMva)) / peakMva : 100);
    // shedding for units that were already out at the start of the quarter (full exposure)
    const shed = (frac: number, exposure: number): { ci: number; cm: number } => {
      const cap = capIn * 1.2;
      if (peakMva <= cap || N_p <= 0) return { ci: 0, cm: 0 };
      const sf = Math.min(1, 1 - cap / peakMva), hrs = SHED_PEAK_HOURS * exposure * WEATHER.seasonLoad[season]!;
      return { ci: sf * N_p * (hrs / 3) * frac, cm: sf * N_p * hrs * 60 * frac };
    };
    const base = shed(1, 1);
    out.custInt += base.ci; out.custMin += base.cm;
    // thermal cycle of the in-service units (equal sharing)
    let hot = 0;
    if (inService.length) {
      const K: number[] = [], amb: number[] = [];
      for (let h = 0; h < 24; h++) for (let k = 0; k < 4; k++) { K.push(mva[h]! / capIn); amb.push((out.heat ? WEATHER.heatwaveC : WEATHER.ambientC[season]!) + SHAPES.ambientSwing[h]!); }
      const cyc = runCycle(K, amb, { stepMin: 15 });
      hot = cyc.peakHotC;
      const ey = thermalYearsFromLoL(cyc.lossOfLifeH * 91 * PEAK_DAY_SHARE.value);
      for (const u of inService) u.extraYears += ey;
    }
    // failures drawn from the (pre-quarter) effective age; thermal stress above 110 C hot-spot raises the hazard
    const rf = systemRng(s.seed, t, fnv(pr.id), 'txfail');
    for (const u of inService) {
      const stress = 1 + Math.max(0, hot - 110) / 10;
      if (rf.next() < Math.min(1, failureProb(effectiveAge(u, t), 0.25, WEIBULL.tx.beta, WEIBULL.tx.eta) * stress)) {
        u.failed = true; u.outQ = 2;
        const left = inService.filter((x) => !x.failed).reduce((a, x) => a + x.ratingMVA, 0), cap = left * 1.2;
        const sf = peakMva > cap && N_p > 0 ? Math.min(1, 1 - cap / peakMva) : 0, hrs = SHED_PEAK_HOURS * 0.5 * WEATHER.seasonLoad[season]!;
        out.emergencyCapexM += PROJECTS.replaceTx!.capexM * MONEY.emergencyMult; out.repairCostM += MONEY.txFailureDamageM;
        out.incidents.push({ id: `I${t}-${nInc++}`, q: t, kind: 'txFailure', feederId: null, primaryId: pr.id, severity: stress, faults: 1, custInt: sf * N_p * (hrs / 3), custMin: sf * N_p * hrs * 60, exceptional: false, tied: false, crewed: false, hasTie: anyTie });
      }
    }
    const sg = s.assets.find((a) => a.id === pr.switchgearId)!;
    if (rf.next() < failureProb(effectiveAge(sg, t), 0.25, WEIBULL.switchgear.beta, WEIBULL.switchgear.eta)) {
      sg.failed = true; sg.outQ = 0; out.emergencyCapexM += PROJECTS.replaceSwitchgear!.capexM * MONEY.emergencyMult;
      out.incidents.push({ id: `I${t}-${nInc++}`, q: t, kind: 'switchgearFailure', feederId: null, primaryId: pr.id, severity: 1, faults: 1, custInt: N_p, custMin: N_p * 6 * 60, exceptional: false, tied: false, crewed: false, hasTie: anyTie });
    }
  }
  if (out.firmMarginPct > 1e8) out.firmMarginPct = 100;
  // 5. connection requests
  const rc = systemRng(s.seed, t, 0, 'conn');
  const nReq = poisson(rc, CONN.ratePerQ * charterOf(s).conn), totalW = CONNECTIONS.reduce((a, c) => a + c.weight, 0);
  for (let k = 0; k < nReq; k++) {
    let x = rc.next() * totalW, row = CONNECTIONS[0]!;
    for (const c of CONNECTIONS) { if (x < c.weight) { row = c; break; } x -= c.weight; }
    const f = s.feeders[Math.min(s.feeders.length - 1, Math.floor(rc.next() * s.feeders.length))]!;
    out.newRequests.push({ id: `R${t}-${k}`, kind: row.kind, feederId: f.id, kw: row.kw, customers: row.customers, solarKw: row.solarKw, chargeM: row.chargeM, critical: row.critical, arrivedQ: t, deadlineQ: t + rc.int(CONN.deadlineMin, CONN.deadlineMax) });
  }
  return out;
}

/** Accept a connection request: the load (and customers, solar) land on its feeder now and the connection charge is paid. */
export function acceptConnection(state: CareerState, id: string): ActionResult {
  if (state.phase !== 'plan') return fail(state, 'career.err.phase');
  const r = state.requests.find((x) => x.id === id);
  if (!r) return fail(state, 'career.err.noRequest', { id });
  const f0 = feederById(state, r.feederId)!, f: Feeder = { ...f0, customers: f0.customers + r.customers, baseKw: f0.baseKw + r.kw, solarKw: f0.solarKw + r.solarKw };
  const s: CareerState = { ...state, cash: state.cash + r.chargeM, delivered: state.delivered + 1, requests: state.requests.filter((x) => x.id !== id), feeders: state.feeders.map((x) => (x === f0 ? f : x)) };
  const lp = analyseFeeder(s, f, false).loadingPct;
  return ok(s, lp > 100 ? 'career.accept.overload' : 'career.accept', { id, kind: r.kind, feeder: f.id, chargeM: r.chargeM, loadingPct: Math.round(lp) });
}

/** During an incident: close the tie to restore the feeder from its neighbour (cuts the incident's customer-minutes by 35 %). */
export function switchTie(state: CareerState, incidentId: string): ActionResult {
  if (state.phase !== 'incident') return fail(state, 'career.err.phase');
  const inc = state.incidents.find((x) => x.id === incidentId);
  if (!inc) return fail(state, 'career.err.noIncident', { id: incidentId });
  if (!inc.hasTie) return fail(state, 'career.err.noTie', { id: incidentId });
  if (inc.tied) return fail(state, 'career.err.already', { id: incidentId });
  const s: CareerState = { ...state, incidents: state.incidents.map((x) => (x.id === incidentId ? { ...x, tied: true } : x)) };
  return ok(s, 'career.incident.tied', { id: incidentId, saving: 35 });
}

/** During an incident: send a spare crew (cuts customer-minutes by 20 %, costs MONEY.dispatchM; needs a free crew). */
export function dispatchCrew(state: CareerState, incidentId: string): ActionResult {
  if (state.phase !== 'incident') return fail(state, 'career.err.phase');
  const inc = state.incidents.find((x) => x.id === incidentId);
  if (!inc) return fail(state, 'career.err.noIncident', { id: incidentId });
  if (inc.crewed) return fail(state, 'career.err.already', { id: incidentId });
  const cost = MONEY.dispatchM * (crewsFree(state) >= 1 ? 1 : 2); // no spare crew: a contractor costs double
  const s: CareerState = { ...state, cash: state.cash - cost, incidents: state.incidents.map((x) => (x.id === incidentId ? { ...x, crewed: true } : x)) };
  return ok(s, 'career.incident.crewed', { id: incidentId, saving: 20, costM: cost });
}
export const INCIDENT_TIE_SAVING = 0.35, INCIDENT_CREW_SAVING = 0.2;
