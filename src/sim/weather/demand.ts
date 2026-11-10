// Demand profiles (DESIGN 3.10, 4.8; S32, S33). Pure; per-block fractions of peak. P in MW, Q in MVAr.
export type DemandClass = 'residential' | 'commercial' | 'irrigation' | 'industrial' | 'city' | 'datacenter';

export const BLOCKS_PER_DAY = 96;
/** Temperature sensitivity k_T = 1.5 %/degC above 30 degC (S32), residential and commercial only. */
export const K_T_PER_C = 0.015;
export const T_REF_C = 30;

export const POWER_FACTOR: Readonly<Record<DemandClass, number>> = {
  residential: 0.95, commercial: 0.9, irrigation: 0.8, industrial: 0.85, city: 0.92, datacenter: 0.98,
};

const RES_24 = [0.62, 0.55, 0.5, 0.47, 0.46, 0.5, 0.58, 0.62, 0.6, 0.56, 0.55, 0.56, 0.58, 0.6, 0.62, 0.62, 0.63, 0.7, 0.85, 0.97, 1.0, 0.97, 0.88, 0.75];
const ANCHOR_HOURS = [0, 3, 6, 9, 12, 15, 18, 19, 20, 21, 23];
const COM_ANCHORS = [0.3, 0.28, 0.35, 0.85, 1.0, 0.98, 0.7, 0.6, 0.5, 0.42, 0.33];
const IND_ANCHORS = [0.85, 0.85, 0.92, 1.0, 0.95, 1.0, 0.95, 0.92, 0.9, 0.88, 0.86];

/** Hourly values (24) by linear interpolation between anchors; 23 -> 24 wraps to the hour-0 value. */
function hourlyFromAnchors(vals: number[]): number[] {
  const out: number[] = [];
  for (let h = 0; h < 24; h++) {
    let i = ANCHOR_HOURS.length - 1;
    while (ANCHOR_HOURS[i]! > h) i--;
    const h0 = ANCHOR_HOURS[i]!, v0 = vals[i]!;
    const h1 = i + 1 < ANCHOR_HOURS.length ? ANCHOR_HOURS[i + 1]! : 24;
    const v1 = i + 1 < ANCHOR_HOURS.length ? vals[i + 1]! : vals[0]!;
    out.push(v0 + ((v1 - v0) * (h - h0)) / (h1 - h0));
  }
  return out;
}

/** 96 blocks from 24 hourly values: block 4h equals hourly[h]; linear between, hour 23 wraps to hour 0. */
function toBlocks(hourly: number[]): number[] {
  const out: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) {
    const h = Math.floor(b / 4), f = (b % 4) / 4;
    out.push(hourly[h]! + (hourly[(h + 1) % 24]! - hourly[h]!) * f);
  }
  return out;
}

export const HOURLY_RESIDENTIAL: readonly number[] = RES_24.slice();
export const HOURLY_COMMERCIAL: readonly number[] = hourlyFromAnchors(COM_ANCHORS);
export const HOURLY_INDUSTRIAL: readonly number[] = hourlyFromAnchors(IND_ANCHORS);

const RES_B = toBlocks(RES_24), COM_B = toBlocks(HOURLY_COMMERCIAL as number[]), IND_B = toBlocks(HOURLY_INDUSTRIAL as number[]);
export const CITY_WEIGHTS = { residential: 0.45, commercial: 0.3, industrial: 0.25 } as const;

/** Default irrigation supply windows (inclusive hours, start..end): 00-04 and 10-13, i.e. blocks 0..19 and 40..55. */
export const DEFAULT_IRRIGATION_WINDOWS: ReadonlyArray<readonly [number, number]> = [[0, 4], [10, 13]];
export const IRRIGATION_OFF = 0.05;

/** Irrigation step profile (96): 1.0 in supply windows (hours [start, end] inclusive of the end hour, shifted by shiftHours), else 0.05. */
export function irrigationProfile(windows: ReadonlyArray<readonly [number, number]> = DEFAULT_IRRIGATION_WINDOWS, shiftHours = 0): number[] {
  const out = new Array<number>(BLOCKS_PER_DAY).fill(IRRIGATION_OFF);
  for (const [s, e] of windows) {
    const b0 = Math.round((s + shiftHours) * 4), b1 = Math.round((e + 1 + shiftHours) * 4);
    for (let b = b0; b < b1; b++) out[((b % 96) + 96) % 96] = 1.0;
  }
  return out;
}

/** 96-block demand profile (fraction of peak, before temperature) for a class. Irrigation takes optional windows/shift. */
export function demandProfile(cls: DemandClass, opts: { irrigationWindows?: ReadonlyArray<readonly [number, number]>; irrigationShiftHours?: number } = {}): number[] {
  switch (cls) {
    case 'residential': return RES_B.slice();
    case 'commercial': return COM_B.slice();
    case 'industrial': return IND_B.slice();
    case 'city': return RES_B.map((r, b) => CITY_WEIGHTS.residential * r + CITY_WEIGHTS.commercial * COM_B[b]! + CITY_WEIGHTS.industrial * IND_B[b]!);
    case 'datacenter': return new Array<number>(BLOCKS_PER_DAY).fill(0.95);
    case 'irrigation': return irrigationProfile(opts.irrigationWindows, opts.irrigationShiftHours ?? 0);
  }
}

/** Temperature multiplier 1 + k_T*max(0, T - 30 degC). */
export function temperatureFactor(tempC: number, kT = K_T_PER_C): number {
  return 1 + kT * Math.max(0, tempC - T_REF_C);
}

/**
 * Temperature-adjusted fraction of peak for one block. k_T applies to residential and commercial only;
 * city mixed gets it pro rata through its residential + commercial components (industrial share is unaffected).
 */
export function demandFraction(cls: DemandClass, block: number, tempC: number, kT = K_T_PER_C, profile?: readonly number[]): number {
  const b = ((Math.floor(block) % 96) + 96) % 96;
  const f = temperatureFactor(tempC, kT);
  switch (cls) {
    case 'residential': return RES_B[b]! * f;
    case 'commercial': return COM_B[b]! * f;
    case 'city': return (CITY_WEIGHTS.residential * RES_B[b]! + CITY_WEIGHTS.commercial * COM_B[b]!) * f + CITY_WEIGHTS.industrial * IND_B[b]!;
    default: return (profile ?? demandProfile(cls))[b]!;
  }
}

export interface DemandInput {
  cls: DemandClass;
  /** Peak active power, MW. */
  peakMW: number;
  block: number;
  /** Ambient temperature, degC. */
  tempC: number;
  /** Multiplicative growth factor (1 = none). */
  growth?: number;
  /** Scripted surge multiplier per block (index = block); missing = 1. */
  surge?: ReadonlyArray<number> | ((block: number) => number);
  /** Optional custom profile (96) overriding the class profile (e.g. shifted irrigation). */
  profile?: readonly number[];
  kT?: number;
}

/** P = P_peak * profile[block] * (1 + k_T max(0, T-30)) * growth * surge[block]; Q = P tan(acos pf). MW, MVAr. */
export function demandPQ(inp: DemandInput): { pMW: number; qMVAr: number } {
  const b = ((Math.floor(inp.block) % 96) + 96) % 96;
  const s = inp.surge === undefined ? 1 : typeof inp.surge === 'function' ? inp.surge(b) : (inp.surge[b] ?? 1);
  const pMW = inp.peakMW * demandFraction(inp.cls, b, inp.tempC, inp.kT ?? K_T_PER_C, inp.profile) * (inp.growth ?? 1) * s;
  const pf = POWER_FACTOR[inp.cls];
  return { pMW, qMVAr: pMW * (Math.sqrt(1 - pf * pf) / pf) };
}
