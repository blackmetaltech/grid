// Career ("The Utility") parameters. Every row carries a `source` string; `recall: true` means a typical value from the author's memory,
// NOT checked against a datasheet, tariff or regulator's determination. Money is in GBP millions, time in years / quarters.
import type { Sourced } from '../sim/distrib/data';

export type { Sourced };

/** Weibull wear-out: lambda(t) = (beta/eta)(t/eta)^(beta-1). wearPerKm scales a per-asset hazard to a per-km line hazard (poles, cross-arms, joints per km). */
export interface WeibullRow extends Sourced { beta: number; eta: number; wearPerKm: number }
export const WEIBULL: Record<'line' | 'tx' | 'switchgear', WeibullRow> = {
  line: { beta: 2.5, eta: 45, wearPerKm: 4, source: 'typical overhead-line component life 40-50 yr, shape 2-3 (DESIGN-1.1 C2); per-km scale tuned', recall: true },
  tx: { beta: 4, eta: 50, wearPerKm: 0, source: 'typical power transformer life 40-60 yr, strong wear-out beta 3-4 (CIGRE-style survey shapes)', recall: true },
  switchgear: { beta: 3, eta: 40, wearPerKm: 0, source: 'typical 11 kV switchboard life 35-45 yr', recall: true },
};
/** Health index 10 (new) .. 1 (end of life): HI = 10 - 9 t_eff / (HI_LIFE_FACTOR eta). */
export const HI_LIFE_FACTOR: Sourced & { value: number } = { value: 1.2, source: 'health index scale chosen so HI = 2.5 at t_eff = eta (illustrative)', recall: true };
/** IEC 60076-7 normal insulation life of thermally upgraded paper at 98 C hot-spot. */
export const TX_NORMAL_LIFE_H: Sourced & { value: number } = { value: 180000, source: 'IEC 60076-7:2005 annex (normal insulation life 180 000 h at the reference hot-spot)', recall: true };
/** The quarter's thermal stress is the peak-day cycle times this share of days at peak-like load (assumption). */
export const PEAK_DAY_SHARE: Sourced & { value: number } = { value: 0.3, source: 'assumption: 30 % of days in the quarter look like the peak day', recall: false };

/** Base fault rates per km per year for an 11 kV overhead line (wear comes on top). */
export const FAULTS: Sourced & { randomPerKm: number; vegPerKm: number; transientFuseUplift: number; repairH: number; repairCostM: number; overloadSlope: number } = {
  randomPerKm: 0.03, vegPerKm: 0.025, transientFuseUplift: 0.3, repairH: 4, repairCostM: 0.006, overloadSlope: 8,
  source: 'DESIGN-1.1 B2 typical 0.1-0.2 faults/km/yr; ~70 % transient, a recloser avoids the fuse-blown share (Billinton and Allan style)', recall: true,
};
export const TIMES = { manualH: 1, remoteH: 0.05, fuseH: 1, tieCloseH: 0.25, tieCapacityKw: 2500 };

/** Storms per quarter (Q1 = winter), severity drawn 0.5-3, each storm lasts ~2 days; exceptional (excluded from the incentive) above 2.5. */
export const WEATHER: Sourced & { stormRate: number[]; stormDays: number; stormMult: number; exceptionalSeverity: number; seasonLoad: number[]; seasonPv: number[]; ambientC: number[]; heatwaveProbQ3: number; heatwaveC: number; heatwaveLoadUp: number } = {
  stormRate: [0.9, 0.35, 0.45, 1.0], stormDays: 2, stormMult: 25, exceptionalSeverity: 2.5,
  seasonLoad: [1.0, 0.82, 0.8, 0.94], seasonPv: [0.35, 0.85, 1.0, 0.5], ambientC: [3, 12, 21, 11], heatwaveProbQ3: 0.3, heatwaveC: 36, heatwaveLoadUp: 1.1,
  source: 'illustrative temperate-maritime climate (Brightwater); not a station record', recall: true,
};

/** Hourly shapes (fraction of the daily maximum). */
export const SHAPES: Sourced & { base: number[]; ev: number[]; pv: number[]; ambientSwing: number[] } = {
  base: [0.55, 0.5, 0.47, 0.46, 0.48, 0.55, 0.7, 0.82, 0.78, 0.72, 0.7, 0.7, 0.7, 0.68, 0.7, 0.76, 0.9, 1.0, 0.99, 0.95, 0.88, 0.78, 0.67, 0.6],
  ev: [0.5, 0.5, 0.4, 0.3, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.15, 0.3, 0.7, 1, 1, 0.95, 0.9, 0.8, 0.65],
  pv: [0, 0, 0, 0, 0, 0.02, 0.1, 0.3, 0.55, 0.78, 0.93, 1, 1, 0.95, 0.8, 0.6, 0.35, 0.12, 0.02, 0, 0, 0, 0, 0],
  ambientSwing: [-3, -3.5, -4, -4, -4, -3, -2, -1, 0, 1, 2, 3, 3.5, 4, 4, 3.5, 3, 2, 1, 0, -1, -1.5, -2, -2.5],
  source: 'typical residential/EV-evening/PV-noon shapes, normalised', recall: true,
};

/** Load growth: base 1-3 %/yr per feeder, EV and rooftop PV adoption by year (share of customers) on top. */
export const GROWTH: Sourced & { baseMinPct: number; baseMaxPct: number; evStart: number; evPerYear: number; evMax: number; evKwEach: number; evCoincidence: number; pvStart: number; pvPerYear: number; pvMax: number; pvKwpEach: number; pf: number } = {
  baseMinPct: 1, baseMaxPct: 3, evStart: 0.02, evPerYear: 0.03, evMax: 0.5, evKwEach: 7, evCoincidence: 0.12,
  pvStart: 0.06, pvPerYear: 0.025, pvMax: 0.4, pvKwpEach: 4, pf: 0.95,
  source: 'DESIGN-1.1 C2: 1-3 %/yr base; EV/PV uptake S-curves are illustrative (national scenarios vary widely)', recall: true,
};

/** The district at the start of the career: 2 primaries (33/11 kV), two transformers each, 9 radial 11 kV feeders, ~40 000 customers. */
export const DISTRICT: Sourced & {
  primaries: { id: string; /** locale key of the substation's name */ name: string; txRatingMVA: number; feeders: number; customersPerFeeder: number }[];
  admdKw: number; sectionLengthsKm: number[]; sectionShares: number[]; conductors: string[][];
  devices: ('none' | 'manual' | 'remote' | 'fuse')[][]; tiedFeeders: number[]; txAges: number[]; swgAges: number[]; lineAgeMean: number; lineAgeSd: number; wearMin: number; wearMax: number; vegStart: number;
  crews: number; maxFeeders: number; maxUnitsPerPrimary: number;
} = {
  primaries: [
    { id: 'P1', name: 'career.primary.P1', txRatingMVA: 28, feeders: 5, customersPerFeeder: 4600 },
    { id: 'P2', name: 'career.primary.P2', txRatingMVA: 20, feeders: 4, customersPerFeeder: 4250 },
  ],
  admdKw: 0.9, sectionLengthsKm: [1.5, 2, 2, 2], sectionShares: [0.2, 0.28, 0.3, 0.22],
  conductors: [['Dog', 'Dog', 'Rabbit', 'Weasel'], ['Hyena', 'Dog', 'Dog', 'Rabbit'], ['Dog', 'Dog', 'Rabbit', 'Rabbit']],
  devices: [['none', 'manual', 'none', 'fuse'], ['none', 'manual', 'manual', 'none'], ['none', 'manual', 'none', 'none']],
  tiedFeeders: [1, 4, 5, 8], txAges: [38, 33, 28, 41], swgAges: [32, 35], lineAgeMean: 36, lineAgeSd: 11, wearMin: 0.75, wearMax: 1.35, vegStart: 0.5,
  crews: 4, maxFeeders: 20, maxUnitsPerPrimary: 3,
  source: 'illustrative district for DESIGN-1.1 C1: sizes from the brief; ADMD 0.9 kW, section lengths and ages are made-up typical values', recall: true,
};

/** Project catalogue: capex in GBP m, lead time in quarters, crews held while building. */
export interface ProjectRow extends Sourced { capexM: number; leadQ: number; crew: number }
export const PROJECTS: Record<string, ProjectRow> = {
  reconductor: { capexM: 0.09, leadQ: 2, crew: 1, source: 'GBP 0.09 m per km per conductor-cost unit (CONDUCTORS.costPerKm); tuned', recall: true },
  newFeeder: { capexM: 2.8, leadQ: 4, crew: 1, source: 'new 11 kV feeder out of a primary, ~12 km (typical order of magnitude)', recall: true },
  newTransformer: { capexM: 3.4, leadQ: 6, crew: 1, source: 'new 33/11 kV unit with bay, typical order of magnitude', recall: true },
  tieSwitch: { capexM: 0.35, leadQ: 2, crew: 1, source: 'normally-open tie with two switches and 1 km of line', recall: true },
  remoteSwitch: { capexM: 0.14, leadQ: 1, crew: 1, source: 'motorised remote-controlled sectionaliser with telecoms', recall: true },
  recloser: { capexM: 0.09, leadQ: 1, crew: 1, source: 'pole-mounted recloser', recall: true },
  vegetation: { capexM: 0.06, leadQ: 1, crew: 1, source: 'one-off deep clearance of a feeder corridor', recall: true },
  replaceLine: { capexM: 0.07, leadQ: 2, crew: 1, source: 'like-for-like rebuild per km (poles, cross-arms, conductor)', recall: true },
  replaceTx: { capexM: 3.0, leadQ: 4, crew: 1, source: 'like-for-like primary transformer replacement', recall: true },
  replaceSwitchgear: { capexM: 1.1, leadQ: 3, crew: 1, source: 'replacement 11 kV switchboard', recall: true },
  regulator: { capexM: 0.22, leadQ: 2, crew: 1, source: 'line voltage regulator, three single-phase units', recall: true },
  battery: { capexM: 1.6, leadQ: 3, crew: 1, source: '1 MW / 2 MWh feeder battery, order of magnitude', recall: true },
  demandResponse: { capexM: 0.02, leadQ: 1, crew: 0, source: 'sign-up cost; running cost below', recall: true },
};
export const PROJECT_DETAIL: Sourced & { batteryKw: number; drShare: number; drCostQ: number; regulatorSetPu: number; overrunPct: number; allowedFloor: number; reconductorVegReset: number; deepClearVeg: number } = {
  batteryKw: 1000, drShare: 0.06, drCostQ: 0.05, regulatorSetPu: 1.0, overrunPct: 10, allowedFloor: 0.35, reconductorVegReset: 0.8, deepClearVeg: 0.15,
  source: 'illustrative project effects; the regulator allows capex into the RAB in proportion to modelled need (floor 35 %), a stand-in for ex-post efficiency review', recall: true,
};

/** Money: simplified RIIO-like building blocks. allowed revenue = RAB x WACC + RAB / life + opex allowance per customer (SIMPLIFIED, no rate case, no inflation indexing). */
export const MONEY: Sourced & {
  wacc: number; lifeYears: number; rab0: number; opexAllowancePerCust: number; opexBasePerCust: number; crewCostYr: number; startCash: number; creditLimit: number;
  borrowRate: number; depositRate: number; lossCostPerMWh: number; inspectionM: number; dispatchM: number; vegPerLevelFeederQ: number; emergencyMult: number; txFailureDamageM: number;
} = {
  wacc: 0.045, lifeYears: 40, rab0: 48, opexAllowancePerCust: 0.000105, opexBasePerCust: 0.00007, crewCostYr: 0.12, startCash: 3, creditLimit: 10,
  borrowRate: 0.07, depositRate: 0.01, lossCostPerMWh: 60, inspectionM: 0.015, dispatchM: 0.03, vegPerLevelFeederQ: 0.008, emergencyMult: 1.2, txFailureDamageM: 0.4,
  source: 'RIIO-ED2-like WACC ~4-5 % real; per-customer opex GBP 80-105 per year; illustrative, not a determination', recall: true,
};

/** Incentive (RIIO-style interruption incentive, SIMPLIFIED: one rate per customer-minute lost and per interruption, symmetric around target, capped). */
export const INCENTIVE: Sourced & { cmiRateM: number; cifRateM: number; rewardCapPct: number; fineCapPct: number; severeFinePct: number; yearsToRevoke: number; targetTightenPct: number; targetHeadroom: number; /** the regulator judges the mean of the last rollingYears years (smooths weather) */ rollingYears: number; /** price-control period (years): at its end the targets reset to resetFactor x the network's modelled expected SAIDI / SAIFI when that is lower (RIIO resets targets each period; SIMPLIFIED) */ periodYears: number; resetFactor: number; /** a reset never tightens a target by more than this in one review (no cliff) */ maxResetCutPct: number } = {
  cmiRateM: 0.12e-6, cifRateM: 12e-6, rewardCapPct: 2, fineCapPct: 5, severeFinePct: 3, yearsToRevoke: 3, targetTightenPct: 1.5, targetHeadroom: 0.9, rollingYears: 3, periodYears: 5, resetFactor: 1.3, maxResetCutPct: 25,
  source: 'RIIO-style ICE: RIIO ICE is roughly GBP 0.2-0.4 per customer-minute lost; scaled down here because this district runs ~3x the SAIDI of a real DNO; caps +2 % / -5 % of allowed revenue (illustrative); targets start 10 % below the day-one expected value (the regulator expects improvement) and tighten 1.5 %/yr',
  recall: true,
};

/** Connection requests. */
export interface ConnRow extends Sourced { kind: string; weight: number; kw: number; customers: number; chargeM: number; solarKw: number; critical: boolean }
export const CONNECTIONS: ConnRow[] = [
  { kind: 'housing', weight: 50, kw: 450, customers: 500, chargeM: 0.2, solarKw: 0, critical: false, source: 'estate of ~450 homes', recall: true },
  { kind: 'industrial', weight: 15, kw: 2000, customers: 5, chargeM: 0.6, solarKw: 0, critical: false, source: 'industrial park first phase', recall: true },
  { kind: 'evHub', weight: 12, kw: 1000, customers: 1, chargeM: 0.25, solarKw: 0, critical: false, source: 'rapid-charging hub', recall: true },
  { kind: 'solarFarm', weight: 15, kw: 0, customers: 1, chargeM: 0.3, solarKw: 3000, critical: false, source: '3 MWp embedded solar farm', recall: true },
  { kind: 'hospital', weight: 8, kw: 1500, customers: 1, chargeM: 0.5, solarKw: 0, critical: true, source: 'district hospital extension', recall: true },
];
export const CONN: Sourced & { ratePerQ: number; deadlineMin: number; deadlineMax: number } = { ratePerQ: 0.7, deadlineMin: 4, deadlineMax: 6, source: 'illustrative', recall: true };

/** Endings and score. */
/** Chief Engineer also needs a clean load index at the end: no feeder over its winter cyclic rating (cyclicPct of the static rating; overhead lines carry about 10 % more on a cold winter peak) and no primary short of firm capacity. */
export const ENDINGS: Sourced & { quarters: number; chiefYearsMet: number; cyclicPct: number } = { quarters: 40, chiefYearsMet: 8, cyclicPct: 110, source: 'DESIGN-1.1 C2; cyclic rating typical of UK practice (ENA ER P27-style), rounded', recall: true };
export const SCORE: Sourced & { perYearMet: number; perSaidiMin: number; perIncentiveM: number; perHealth: number; perDelivered: number; perMissed: number; perCashM: number; perDebtM: number; chief: number; steady: number; bailed: number; revoked: number; perQuarterLeftLost: number } = {
  perYearMet: 60, perSaidiMin: 0.08, perIncentiveM: 60, perHealth: 40, perDelivered: 15, perMissed: 25, perCashM: 8, perDebtM: 25, chief: 300, steady: 100, bailed: -300, revoked: -300, perQuarterLeftLost: 5,
  source: 'game scoring, not from any source', recall: false,
};
