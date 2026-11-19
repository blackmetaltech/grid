// Chapter 8 "The Feeder" scenario constants (Brightwater, ten years on): a 33/11 kV primary substation and 11 kV feeders. Prices are US$ (a pack scales them by `moneyFactor`).
// The physics is the lane-E1 engine in src/sim/distrib (radial sweep, FMEA reliability, TCC, IEC 60076-7, PV hosting); this file holds only the SCENARIOS and price lists.
// Every number is an engineering-typical value, not a vendor quote (the engine's own data.ts tags each catalogue row with its source).
import { CONDUCTORS, FUSE_LINKS_K, SWITCHING_H } from '../distrib';
export { moneyFactor, r1, r2, r3 } from '../ch7/data';

/** Customer voltage band: EN 50160 style, 230 V nominal. The low edge is -6 % in every pack; the high edge is the pack's LV band (global +10 %, in +6 %). */
export const V_NOM = 230;
export const V_LO_PU = 0.94;
export const MIN_LOAD_FRAC = 0.3;

export type Ch8Id = 'L31' | 'L32' | 'L33' | 'L34' | 'L35' | 'L36';

// ---- feeder scenarios (L31, L35, L36) ------------------------------------------------------------------------------------------------
/** A feeder node: the section from its parent (km), the peak load of the distribution transformer hanging at it, that transformer's kVA and the customers it serves. */
export interface NodeData { id: string; km: number; kw: number; kvar: number; kva: number; customers: number }
export interface FeederScenario { /** The conductor the line stands in (rebuilding to a dearer one is paid per km over it, a lighter one costs nothing) */ base: string; kV: number; sourcePu: number; nodes: NodeData[]; /** distribution transformer impedance, percent, X/R */ zPct: number; xr: number }

export const L31: FeederScenario = {
  base: 'Weasel', kV: 11, sourcePu: 1.0, zPct: 4.5, xr: 4,
  nodes: [
    { id: 'N1', km: 4, kw: 390, kvar: 190, kva: 630, customers: 380 },
    { id: 'N2', km: 3, kw: 345, kvar: 165, kva: 500, customers: 330 },
    { id: 'N3', km: 3, kw: 300, kvar: 145, kva: 500, customers: 290 },
    { id: 'N4', km: 3, kw: 255, kvar: 125, kva: 400, customers: 240 },
    { id: 'N5', km: 3, kw: 210, kvar: 100, kva: 315, customers: 200 },
  ],
};
export const L35: FeederScenario = {
  base: 'Rabbit', kV: 11, sourcePu: 1.0, zPct: 4.5, xr: 4,
  nodes: [
    { id: 'N1', km: 3, kw: 380, kvar: 125, kva: 630, customers: 300 },
    { id: 'N2', km: 3, kw: 340, kvar: 112, kva: 500, customers: 270 },
    { id: 'N3', km: 2.5, kw: 300, kvar: 99, kva: 500, customers: 240 },
    { id: 'N4', km: 2.5, kw: 260, kvar: 86, kva: 400, customers: 210 },
    { id: 'N5', km: 2, kw: 220, kvar: 72, kva: 315, customers: 180 },
  ],
};
/** The exam feeder (L36): three sections with fixed conductors. */
export const L36 = {
  kV: 11, conductor: 'Rabbit', lambdaPerKm: 0.15, repairH: 4, manualH: 1,
  sections: [
    { id: 'A', km: 4, customers: 300, kw: 400, kvar: 150, parent: null as string | null, device: 'none' as const },
    { id: 'B', km: 5, customers: 200, kw: 300, kvar: 100, parent: 'A', device: 'manual' as const },
    { id: 'C', km: 3, customers: 100, kw: 200, kvar: 80, parent: 'B', device: 'fuse' as const },
  ],
  tolPct: 5, tolStarPct: 1,
  whyChoices: ['dv-rp-xq', 'dv-ir-only', 'dv-pf-only'] as const, whyRight: 'dv-rp-xq',
};

export const CONDUCTOR_IDS = CONDUCTORS.map((c) => c.id);
/** Reconductoring price per km in US$ (the line stands as Weasel; keeping it costs nothing). */
export const CONDUCTOR_PRICE_KM: Record<string, number> = { Weasel: 0, Rabbit: 14000, Dog: 24000, Hyena: 36000 };
export const REGULATOR = { price: 90000, vSetOptions: [0.98, 1.0, 1.02, 1.04], bandPu: 0.0125, stepPct: 0.625, maxSteps: 16 };
export const TAPS = [-5, -2.5, 0, 2.5, 5];

// ---- L32 reliability --------------------------------------------------------------------------------------------------------------------
export interface RelNode { id: string; parent: string | null; km: number; customers: number; kw: number }
export const L32 = {
  lambdaPerKm: 0.15, repairH: 4, times: { manualH: SWITCHING_H.manual, remoteH: SWITCHING_H.remote, fuseH: SWITCHING_H.fuse }, tie: { closeH: SWITCHING_H.tie, capacityKw: 1500 },
  maxSectionalisers: 3,
  /** Sections: trunk T1..T4 from the substation breaker, spurs P1..P3. Devices sit at the upstream end of a section. */
  sections: [
    { id: 'T1', parent: null, km: 3, customers: 300, kw: 900 },
    { id: 'T2', parent: 'T1', km: 4, customers: 250, kw: 750 },
    { id: 'T3', parent: 'T2', km: 4, customers: 200, kw: 600 },
    { id: 'T4', parent: 'T3', km: 3, customers: 150, kw: 450 },
    { id: 'P1', parent: 'T1', km: 2, customers: 120, kw: 280 },
    { id: 'P2', parent: 'T2', km: 3, customers: 100, kw: 240 },
    { id: 'P3', parent: 'T3', km: 2.5, customers: 80, kw: 200 },
  ] as RelNode[],
  sectionaliserSites: ['T2', 'T3', 'T4'], spurs: ['P1', 'P2', 'P3'], tieSites: ['T4'],
  price: { manual: 9000, remote: 34000, fuse: 1500, tie: 90000 },
  saidiMaxMin: 275, saifiMax: 1.7, ensStarMWh: 14.65,
};

// ---- L33 fuse saving --------------------------------------------------------------------------------------------------------------------
export interface SpurData { id: string; loadA: number; iMaxA: number; iMinA: number; customers: number }
export const L33 = {
  headLoadA: 140, tempFaultShare: 0.8, marginStarS: 0.2, fastShotsOptions: [0, 1, 2], pickupOptions: [100, 150, 200, 300], fastTdOptions: [0.05, 0.1, 0.25, 0.4], slowTdOptions: [1, 2, 3, 5],
  fuseOptions: FUSE_LINKS_K, feederCustomers: 1000,
  spurs: [
    { id: 'S1', loadA: 12, iMaxA: 1000, iMinA: 420, customers: 90 },
    { id: 'S2', loadA: 20, iMaxA: 700, iMinA: 300, customers: 140 },
    { id: 'S3', loadA: 8, iMaxA: 500, iMinA: 260, customers: 60 },
  ] as SpurData[],
  fuseLoadFactor: 1.5, spurFaultsPerYear: 0.6, price: { recloserSetting: 0 },
};

// ---- L34 firm capacity ------------------------------------------------------------------------------------------------------------------
export const L34 = {
  baseMva: 20, count: 2, peakMva: 30, ambientC: 40, hotSpotLimitC: 140, restoreWithinH: 3, lolStarDays: 1, kMaxShed: 1.5,
  /** Day load shape (fraction of the peak), hourly, hour 0 = 00:00; the trip is at 18:00 on the peak day. */
  shape: [0.55, 0.5, 0.48, 0.47, 0.5, 0.58, 0.7, 0.8, 0.85, 0.85, 0.84, 0.83, 0.82, 0.8, 0.8, 0.82, 0.88, 0.95, 1, 0.98, 0.92, 0.82, 0.7, 0.6],
  tripHour: 18,
  sizes: [20, 31.5, 40], sizePrice: { 20: 900000, 31.5: 1300000, 40: 1600000 } as Record<number, number>, thirdBay: 200000,
  busSection: { manualH: 1, price: 60000 },
  ties: { none: { mva: 0, h: 0, price: 0 }, manual: { mva: 6, h: 1.5, price: 150000 }, remote: { mva: 6, h: 0.1, price: 350000 } },
  dr: { none: { mva: 0, price: 0 }, small: { mva: 2, price: 100000 }, large: { mva: 4, price: 200000 } }, drLeadH: 0.25,
};

// ---- L35 sun on the roofs ---------------------------------------------------------------------------------------------------------------
export const L35S = {
  pvNodes: ['N2', 'N3', 'N4', 'N5'], noonLoadFrac: 0.3, eveningLoadFrac: 1, minPvKw: 1000, starPvKw: 3000, pvLimitsKw: [0, 500, 1000, 1500, 2000, 2500, 3000],
  oltcSetOptions: [1.0, 1.02, 1.04], oltc: { stepPct: 0.625, bandPu: 0.0125, ratedA: 200, rLdcPu: 0.04, xLdcPu: 0.06 },
  price: { oltcLdc: 30000, voltVar: 8000, cableKm: 36000, cable: 'Hyena' },
  baseConductor: 'Rabbit',
};

export const FUSE_PRICE_NOTE = 'one fuse link per spur is part of the spur';
