// The district: building it, and turning a feeder into the sim/distrib models (reliability sections, radial load flow).
import { dmath } from '@core/numerics';
import { CONDUCTORS, reliability, solveRadial, type RadialFeeder, type ReliabilityResult, type ReliabilitySection, type RadialResult } from '../sim/distrib';
import { systemRng } from '../sim/rngs';
import { DISTRICT, FAULTS, GROWTH, INCENTIVE, MONEY, TIMES, WEATHER, WEIBULL } from './data';
import { wearRate, avgHealth } from './ageing';
import { hourlyLoad } from './growth';
import type { Asset, CareerState, Feeder, Primary, Section } from './state';
import { totalCustomers } from './state';

export const conductorRow = (id: string) => CONDUCTORS.find((c) => c.id === id) ?? CONDUCTORS[0]!;
const TAN_PHI = dmath.sqrt(1 / (GROWTH.pf * GROWTH.pf) - 1);
export const LOAD_FACTOR = 0.55;
export const sectionId = (feederId: string, idx: number): string => `${feederId}.${idx + 1}`;

/** Mean of severity x [severity counted] for storms: severity = 0.5 + 2.5 u^2 (u uniform), exceptional above WEATHER.exceptionalSeverity. */
export function meanCountedSeverity(): number {
  const us = dmath.sqrt((WEATHER.exceptionalSeverity - 0.5) / 2.5);
  return 0.5 * us + (2.5 * us * us * us) / 3;
}
/** Expected storm fault uplift (fraction of the calm fault rate, per year) for a vegetation index. */
export function stormUplift(veg: number): number {
  const rate = WEATHER.stormRate.reduce((a, b) => a + b, 0);
  return rate * WEATHER.stormMult * meanCountedSeverity() * (0.5 + veg) * (WEATHER.stormDays / 365);
}

export function buildDistrict(seed: number): CareerState {
  const rng = systemRng(seed, 0, 0, 'district');
  const feeders: Feeder[] = [], primaries: Primary[] = [], assets: Asset[] = [];
  let fi = 0;
  const mkAsset = (a: Partial<Asset> & Pick<Asset, 'id' | 'cls'>, ageYears: number): void => {
    assets.push({ feederId: null, sectionIdx: 0, primaryId: null, installQ: -Math.round(ageYears * 4), wear: DISTRICT.wearMin + rng.next() * (DISTRICT.wearMax - DISTRICT.wearMin), wearFaults: 0, extraYears: 0, ratingMVA: 0, failed: false, outQ: 0, known: null, ...a });
  };
  DISTRICT.primaries.forEach((p, pi) => {
    const unitIds = [`${p.id}-T1`, `${p.id}-T2`];
    unitIds.forEach((id, k) => mkAsset({ id, cls: 'tx', primaryId: p.id, ratingMVA: p.txRatingMVA }, DISTRICT.txAges[pi * 2 + k]! + dmath.round(rng.range(-3, 3))));
    mkAsset({ id: `${p.id}-SG`, cls: 'switchgear', primaryId: p.id }, DISTRICT.swgAges[pi]! + dmath.round(rng.range(-3, 3)));
    primaries.push({ id: p.id, name: p.name, unitIds, switchgearId: `${p.id}-SG` });
    for (let k = 0; k < p.feeders; k++, fi++) {
      const id = `F${fi + 1}`, pat = fi % DISTRICT.conductors.length, cust = p.customersPerFeeder + dmath.round(rng.range(-250, 250));
      const sections: Section[] = DISTRICT.sectionLengthsKm.map((len, i) => {
        const aid = `${id}.${i + 1}`;
        mkAsset({ id: aid, cls: 'line', feederId: id, sectionIdx: i }, Math.max(8, DISTRICT.lineAgeMean + rng.normal(0, DISTRICT.lineAgeSd)));
        return { id: aid, lengthKm: len, conductor: DISTRICT.conductors[pat]![i]!, share: DISTRICT.sectionShares[i]!, device: DISTRICT.devices[(fi + k) % DISTRICT.devices.length]![i]!, assetId: aid };
      });
      feeders.push({
        id, primaryId: p.id, customers: cust, baseKw: cust * DISTRICT.admdKw * rng.range(0.93, 1.07),
        growthPct: dmath.round((GROWTH.baseMinPct + rng.next() * (GROWTH.baseMaxPct - GROWTH.baseMinPct)) * 10) / 10,
        evBias: rng.range(0.6, 1.4), pvBias: rng.range(0.6, 1.4), sections,
        tie: DISTRICT.tiedFeeders.includes(fi), recloser: false, regulator: false, batteryKw: 0, drKw: 0, solarKw: 0, veg: DISTRICT.vegStart + rng.range(-0.15, 0.15),
      });
    }
  });
  const s: CareerState = {
    v: 1, seed, t: 0, phase: 'plan', cash: MONEY.startCash, rab: MONEY.rab0, ar: 0, arYear: 0, opexAllowance: 0,
    feeders, primaries, assets, projects: [], requests: [], incidents: [], crews: DISTRICT.crews, vegLevel: 1, nextId: 1,
    saidiTarget: 0, saifiTarget: 0, ytdCustMin: 0, ytdCustInt: 0, ytdExceptionalMin: 0, ytdIncentiveCapex: 0,
    yearsMet: 0, severeFineYears: 0, delivered: 0, missed: 0, netIncentiveM: 0, startHealth: 0, history: [], reviews: [], log: [], ending: null, pending: null,
  };
  s.startHealth = avgHealth(s);
  s.opexAllowance = MONEY.opexAllowancePerCust * totalCustomers(s);
  s.ar = allowedRevenue(s.rab, s.opexAllowance);
  const e = districtExpected(s);
  s.saidiTarget = e.saidi * INCENTIVE.targetHeadroom;
  s.saifiTarget = e.saifi * INCENTIVE.targetHeadroom;
  return s;
}

/** Allowed revenue per year (GBP m, SIMPLIFIED): RAB x WACC + RAB / asset life (depreciation) + opex allowance. */
export const allowedRevenue = (rab: number, opexAllowance: number): number => rab * MONEY.wacc + rab / MONEY.lifeYears + opexAllowance;

export interface SectionOutage { ci: number; cm: number }
export interface FeederAnalysis {
  id: string; rel: ReliabilityResult; peakKw: number; minKw: number; peakHour: number; loadingPct: number; headLoadingPct: number;
  lossKwPeak: number; minVPu: number; maxVPu: number; vViolation: boolean; converged: boolean;
  /** Sustained customer interruptions and customer-minutes per fault on each section (from the FMEA outage-hour table). */
  perFault: SectionOutage[]; calmLambda: number[]; sections: ReliabilitySection[];
}

/** Calm annual fault rate per km of a section (random + vegetation + wear), x fuse-blown transient uplift, x overload. */
export function calmLambdaPerKm(f: Feeder, secIdx: number, assets: Asset[], t: number, loadingPct: number): number {
  const a = assets.find((x) => x.id === f.sections[secIdx]!.assetId)!;
  const base = FAULTS.randomPerKm + FAULTS.vegPerKm * (0.4 + 1.6 * f.veg) + wearRate(a, t) * WEIBULL.line.wearPerKm;
  const over = 1 + FAULTS.overloadSlope * Math.max(0, loadingPct / 100 - 1);
  return base * (f.recloser ? 1 : 1 + FAULTS.transientFuseUplift) * over;
}

export function toReliability(f: Feeder, assets: Asset[], t: number, peakKw: number, loadingPct: number, uplift: number): ReliabilitySection[] {
  return f.sections.map((sec, i) => ({
    id: sec.id, parent: i ? f.sections[i - 1]!.id : null, lengthKm: sec.lengthKm,
    lambdaPerKm: calmLambdaPerKm(f, i, assets, t, loadingPct) * (1 + uplift), repairH: FAULTS.repairH,
    customers: f.customers * sec.share, avgLoadKw: peakKw * sec.share * LOAD_FACTOR,
    device: sec.device,
    ...(f.tie && i === f.sections.length - 1 ? { tie: { closeH: TIMES.tieCloseH, capacityKw: TIMES.tieCapacityKw } } : {}),
  }));
}

export function toRadial(f: Feeder, netKw: number): RadialFeeder {
  const nodes: RadialFeeder['nodes'] = [{ id: 'src', parent: null, rOhm: 0, xOhm: 0, pKw: 0, qKvar: 0 }];
  f.sections.forEach((sec, i) => {
    const c = conductorRow(sec.conductor), p = netKw * sec.share;
    nodes.push({
      id: sec.id, parent: i ? f.sections[i - 1]!.id : 'src', rOhm: c.rOhmKm * sec.lengthKm, xOhm: c.xOhmKm * sec.lengthKm, pKw: p, qKvar: p > 0 ? p * TAN_PHI : 0,
      ...(f.regulator && i === 2 ? { regulator: { vSetPu: 1.0, bandPu: 0.02 } } : {}),
    });
  });
  return { kV: 11, nodes };
}

const SRC_PEAK = 1.03, SRC_MIN = 1.0, V_LOW = 0.94, V_HIGH = 1.06;

/** Full analysis of a feeder at the current quarter: peak flow, noon voltage rise, expected reliability (annual, calm + expected storm uplift). */
export function analyseFeeder(s: CareerState, f: Feeder, solve = true): FeederAnalysis {
  const hl = hourlyLoad(f, s.t);
  let loading = 0, loss = 0, minV = 1, maxV = 1, converged = true;
  if (solve) {
    const rp: RadialResult = solveRadial(toRadial(f, hl.peakKw), { vSourcePu: SRC_PEAK });
    f.sections.forEach((sec, i) => { loading = Math.max(loading, (rp.sections[i]!.currentA / conductorRow(sec.conductor).ampacityA) * 100); });
    loss = rp.lossKw; minV = rp.minVPu; converged = rp.converged;
    const rm = solveRadial(toRadial(f, hl.minKw), { vSourcePu: SRC_MIN });
    maxV = Math.max(rm.maxVPu, rp.maxVPu); converged = converged && rm.converged;
  } else {
    // cheap loading estimate from the head current alone
    const a = (hl.peakKw / (dmath.sqrt(3) * 11 * GROWTH.pf));
    loading = (a / conductorRow(f.sections[0]!.conductor).ampacityA) * 100;
  }
  const uplift = stormUplift(f.veg);
  const secs = toReliability(f, s.assets, s.t, hl.peakKw, loading, uplift);
  const rel = reliability(secs, { manualH: TIMES.manualH, remoteH: TIMES.remoteH, fuseH: TIMES.fuseH });
  const perFault: SectionOutage[] = f.sections.map((sec) => {
    const row = rel.outageH[sec.id]!;
    let ci = 0, cm = 0;
    f.sections.forEach((k, j) => { const d = row[k.id]!; if (d > 5 / 60) { ci += f.customers * k.share; cm += f.customers * k.share * d * 60; } void j; });
    return { ci, cm };
  });
  const calmLambda = secs.map((x) => x.lambdaPerKm / (1 + uplift) * x.lengthKm);
  return {
    id: f.id, rel, peakKw: hl.peakKw, minKw: hl.minKw, peakHour: hl.peakHour, loadingPct: loading, headLoadingPct: loading, lossKwPeak: loss,
    minVPu: minV, maxVPu: maxV, vViolation: minV < V_LOW || maxV > V_HIGH, converged, perFault, calmLambda, sections: secs,
  };
}

/** District expected SAIDI (min/yr) and SAIFI weighted by customers. */
export function districtExpected(s: CareerState, an?: FeederAnalysis[]): { saidi: number; saifi: number } {
  const A = an ?? s.feeders.map((f) => analyseFeeder(s, f, false));
  const N = totalCustomers(s);
  let di = 0, fi = 0;
  s.feeders.forEach((f, k) => { di += f.customers * A[k]!.rel.saidi; fi += f.customers * A[k]!.rel.saifi; });
  return { saidi: N ? di / N : 0, saifi: N ? fi / N : 0 };
}

export { SRC_PEAK, SRC_MIN, V_LOW, V_HIGH };

/** Share of a section's calm fault rate that is wear (random + vegetation + wear), used to attribute realised faults to ageing. */
export function wearShare(f: Feeder, secIdx: number, assets: Asset[], t: number): number {
  const a = assets.find((x) => x.id === f.sections[secIdx]!.assetId)!;
  const w = wearRate(a, t) * WEIBULL.line.wearPerKm, b = FAULTS.randomPerKm + FAULTS.vegPerKm * (0.4 + 1.6 * f.veg);
  return w / (w + b);
}
