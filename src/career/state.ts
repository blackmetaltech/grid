import type { CharterId } from './data';
// Career state: plain JSON data only (hashable, serialisable). All randomness is derived from (seed, quarter, stream) so a career is a seed + action list.
import { hashOf } from '@core/kit';
import type { SwitchKind } from '../sim/distrib/reliability';

export type AssetClass = 'line' | 'tx' | 'switchgear';
export type ProjectKind = 'reconductor' | 'newFeeder' | 'newTransformer' | 'tieSwitch' | 'remoteSwitch' | 'recloser' | 'vegetation' | 'replaceAssets' | 'regulator' | 'battery' | 'demandResponse';
export const PROJECT_KINDS: ProjectKind[] = ['reconductor', 'newFeeder', 'newTransformer', 'tieSwitch', 'remoteSwitch', 'recloser', 'vegetation', 'replaceAssets', 'regulator', 'battery', 'demandResponse'];
export type Ending = 'chiefEngineer' | 'steady' | 'bailedOut' | 'licenceRevoked';

export interface Asset {
  id: string; cls: AssetClass;
  feederId: string | null; sectionIdx: number; primaryId: string | null;
  /** Quarter index of installation (negative = before the career). Age in years = (t - installQ) / 4. */
  installQ: number;
  /** Hidden condition multiplier on age (inspection reveals the resulting health). */
  wear: number;
  /** Wear-attributed faults patched since installation. */
  wearFaults: number;
  /** Extra effective years from transformer hot-spot ageing (IEC 60076-7 loss of life) and overload. */
  extraYears: number;
  ratingMVA: number;
  /** A transformer / switchboard that failed and is out of service; outQ quarters of repair left. A line asset: has a patched fault awaiting a proper fix. */
  failed: boolean; outQ: number;
  known: { health: number; q: number } | null;
}
export interface Section { id: string; lengthKm: number; conductor: string; share: number; device: SwitchKind; assetId: string }
export interface Feeder {
  id: string; primaryId: string; customers: number;
  /** Winter evening peak at the head, kW, excluding EVs and PV (compounds with growth, steps with connections). */
  baseKw: number; growthPct: number; evBias: number; pvBias: number;
  sections: Section[];
  tie: boolean; recloser: boolean; regulator: boolean; batteryKw: number; drKw: number; solarKw: number;
  /** Vegetation overgrowth, 0..1. */
  veg: number;
}
export interface Primary { id: string; name: string; unitIds: string[]; switchgearId: string }
export interface Project {
  id: string; kind: ProjectKind; target: string; startQ: number; leadQ: number; left: number; crew: number; capexM: number; spentM: number;
  status: 'building' | 'active' | 'done' | 'cancelled';
}
export interface Request { id: string; kind: string; feederId: string; kw: number; customers: number; solarKw: number; chargeM: number; critical: boolean; arrivedQ: number; deadlineQ: number }
export interface Incident {
  id: string; q: number; kind: 'storm' | 'txFailure' | 'switchgearFailure'; feederId: string | null; primaryId: string | null; severity: number;
  faults: number; custInt: number; custMin: number; exceptional: boolean; tied: boolean; crewed: boolean; hasTie: boolean;
}
export interface Verdict { axis: 'regulator' | 'finance' | 'crew'; who: string; key: string; grade: 'good' | 'ok' | 'poor'; params: Record<string, number> }
export interface Review {
  year: number; saidi: number; saifi: number; /** what the regulator judged: the rolling mean over INCENTIVE.rollingYears */ saidiRolling: number; saifiRolling: number; saidiTarget: number; saifiTarget: number; exceptionalMin: number; met: boolean; incentiveM: number;
  avgHealth: number; cash: number; rab: number; verdicts: Verdict[];
  /** Load index at the review: feeders over their rating at peak, primaries short of firm capacity. */
  overloaded: number; firmShort: number;
}
export interface Kpi {
  t: number; year: number; quarter: number;
  saidiReal: number; saifiReal: number; saidiExp: number; saifiExp: number; saidiYtd: number; saifiYtd: number;
  lossesMWh: number; capexM: number; opexM: number; revenueM: number; incentiveM: number; cash: number; rab: number;
  avgHealth: number; worstHealth: number; delivered: number; missed: number; vViolations: number; firmMarginPct: number; maxLoadingPct: number; customers: number; faults: number;
  /** Emergency replacement of failed plant this quarter (included in capexM), at MONEY.emergencyMult times the planned price. */
  emergencyM?: number;
  /** Opex of the quarter by cause (sums to opexM). */
  opexParts?: { base: number; repairs: number; losses: number; dr: number; veg: number; voltage: number };
}
export type Phase = 'plan' | 'incident' | 'over';
export interface QuarterOutcome {
  /** Sustained customer interruptions and customer-minutes that count for the incentive (before incident responses). */
  custInt: number; custMin: number; exceptionalMin: number; faults: number; repairCostM: number;
  lossesMWh: number; vViolations: number; maxLoadingPct: number; firmMarginPct: number; emergencyCapexM: number; heat: boolean;
  expSaidiQ: number; expSaifiQ: number; storms: number;
  /** Money paid in project instalments this quarter and the part of finished projects that enters the RAB. */
  capexM: number; rabAddM: number; completed: string[];
}

export interface CareerState {
  v: 1; seed: number; t: number; phase: Phase;
  /** DESIGN-1.3 district charter; absent = 'standard' (Home Counties), so 1.2 careers hash the same */
  charter?: CharterId;
  cash: number; rab: number; ar: number; arYear: number; opexAllowance: number;
  feeders: Feeder[]; primaries: Primary[]; assets: Asset[];
  projects: Project[]; requests: Request[]; incidents: Incident[];
  crews: number; vegLevel: number; nextId: number;
  /** Targets for the current year (min / yr, interruptions / customer / yr). */
  saidiTarget: number; saifiTarget: number;
  /** Year-to-date accumulators (customer-minutes, customer-interruptions) counted for the incentive, and excluded exceptional customer-minutes. */
  ytdCustMin: number; ytdCustInt: number; ytdExceptionalMin: number; ytdIncentiveCapex: number;
  yearsMet: number; /** current streak of severe-fine years on an inadequate network (three end the licence) */ severeFineYears: number; delivered: number; missed: number; netIncentiveM: number;
  startHealth: number;
  history: Kpi[]; reviews: Review[]; log: string[];
  ending: Ending | null;
  /** The quarter being played while phase is 'incident' (events already rolled, incidents await a response). */
  pending: QuarterOutcome | null;
}

export interface ActionResult { ok: boolean; state: CareerState; messageKey: string; params: Record<string, number | string> }

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const stateHash = (s: CareerState): string => hashOf(s);
export const totalCustomers = (s: CareerState): number => s.feeders.reduce((a, f) => a + f.customers, 0);
export const year = (s: CareerState): number => Math.floor(s.t / 4);
export const feederById = (s: CareerState, id: string): Feeder | undefined => s.feeders.find((f) => f.id === id);
export const assetById = (s: CareerState, id: string): Asset | undefined => s.assets.find((a) => a.id === id);
export const primaryById = (s: CareerState, id: string): Primary | undefined => s.primaries.find((p) => p.id === id);

export function ok(state: CareerState, messageKey: string, params: Record<string, number | string> = {}): ActionResult { return { ok: true, state, messageKey, params }; }
export function fail(state: CareerState, messageKey: string, params: Record<string, number | string> = {}): ActionResult { return { ok: false, state, messageKey, params }; }
