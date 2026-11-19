// Money: regulated revenue, the incentive formula, cash flow of a quarter. GBP m. SIMPLIFIED (no rate case, no inflation indexing, one incentive rate).
import { INCENTIVE, MONEY } from './data';
import { allowedRevenue } from './district';

export { allowedRevenue };
/** Incentive in GBP m: N x [cmiRate (Tsaidi - saidi) + cifRate (Tsaifi - saifi)], clamped to [-fineCap, +rewardCap] percent of allowed revenue. Positive = reward. */
export function incentive(N: number, saidi: number, saifi: number, tSaidi: number, tSaifi: number, ar: number): number {
  const raw = N * (INCENTIVE.cmiRateM * (tSaidi - saidi) + INCENTIVE.cifRateM * (tSaifi - saifi));
  return Math.max(-(INCENTIVE.fineCapPct / 100) * ar, Math.min((INCENTIVE.rewardCapPct / 100) * ar, raw));
}
/** Interest on the cash balance for one quarter (borrowing rate when negative, deposit rate when positive). */
export const interestQ = (cash: number): number => (cash < 0 ? cash * MONEY.borrowRate : cash * MONEY.depositRate) / 4;
/** Regulated asset base after one quarter: straight-line depreciation over the asset life, plus allowed additions. */
export const rabNext = (rab: number, additions: number): number => rab - rab / (MONEY.lifeYears * 4) + additions;
/** Base running cost per quarter: per-customer opex plus fixed crew cost. */
export const baseOpexQ = (customers: number, crews: number): number => (MONEY.opexBasePerCust * customers) / 4 + (MONEY.crewCostYr * crews) / 4;
