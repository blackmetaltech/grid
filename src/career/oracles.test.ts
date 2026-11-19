// Career closed forms vs the independent Python oracles (tools/oracles/career_expected.json). Tolerances: closed forms 1e-9, Weibull integral 1e-8.
import { describe, expect, it } from 'vitest';
import exp from '../../tools/oracles/career_expected.json';
import { expectedFailures, failureProb, healthFromAge, weibullHazard } from './ageing';
import { INCENTIVE, MONEY, WEIBULL, HI_LIFE_FACTOR } from './data';
import { buildDistrict, districtExpected, type FeederAnalysis } from './district';
import { grownLoad, quarterFactor } from './growth';
import { allowedRevenue, incentive, rabNext } from './money';

const rel = (a: number, b: number, tol: number): void => { expect(Math.abs(a - b) / Math.max(1e-12, Math.abs(b))).toBeLessThan(tol); };

describe('career oracles', () => {
  it('data.ts still holds the parameters the oracle assumed', () => {
    expect(MONEY.wacc).toBe(exp.params.wacc); expect(MONEY.lifeYears).toBe(exp.params.lifeYears);
    expect(INCENTIVE.cmiRateM).toBe(exp.params.cmiRateM); expect(INCENTIVE.cifRateM).toBe(exp.params.cifRateM);
    expect(INCENTIVE.rewardCapPct).toBe(exp.params.rewardCapPct); expect(INCENTIVE.fineCapPct).toBe(exp.params.fineCapPct);
    expect(HI_LIFE_FACTOR.value).toBe(exp.params.hiLife); expect(WEIBULL.line.eta).toBe(exp.params.lineEta);
  });
  it('Weibull hazard, expected failures over a quarter (closed form vs Simpson), failure probability', () => {
    for (const c of exp.weibull) {
      rel(weibullHazard(c.t, c.beta, c.eta), c.hazard, 1e-9);
      if (c.expected > 1e-6) rel(expectedFailures(c.t, 0.25, c.beta, c.eta), c.expected, 1e-8);
      expect(Math.abs(failureProb(c.t, 0.25, c.beta, c.eta) - c.prob)).toBeLessThan(1e-9);
    }
  });
  it('allowed revenue and the RAB roll-forward', () => {
    for (const c of exp.revenue.cases) rel(allowedRevenue(c.rab, c.opex), c.ar, 1e-12);
    let rab = 48;
    exp.revenue.rabRoll.additions.forEach((a, i) => { rab = rabNext(rab, a); rel(rab, exp.revenue.rabRoll.rab[i]!, 1e-12); });
  });
  it('incentive pay / fine, with reward and fine caps', () => {
    for (const c of exp.incentive) expect(Math.abs(incentive(c.n, c.saidi, c.saifi, c.tSaidi, c.tSaifi, c.ar) - c.incentive)).toBeLessThan(1e-12);
    expect(exp.incentive[1]!.incentive).toBeCloseTo(-0.05 * 7.5, 12); // fine cap reached
    expect(exp.incentive[2]!.incentive).toBeCloseTo(0.02 * 7.5, 12);  // reward cap reached
  });
  it('district SAIDI / SAIFI are the customer-weighted mean of the feeders', () => {
    const s = buildDistrict(1);
    s.feeders = s.feeders.slice(0, 3).map((f, i) => ({ ...f, customers: exp.aggregation.feeders[i]!.customers }));
    const an = exp.aggregation.feeders.map((f) => ({ rel: { saidi: f.saidi, saifi: f.saifi } }) as FeederAnalysis);
    const d = districtExpected(s, an);
    rel(d.saidi, exp.aggregation.saidi, 1e-12); rel(d.saifi, exp.aggregation.saifi, 1e-12);
  });
  it('compound load growth and the health index', () => {
    for (const c of exp.growth) { rel(grownLoad(c.kw, c.pct, c.quarters), c.grown, 1e-9); rel(quarterFactor(c.pct), c.qfactor, 1e-9); }
    for (const h of exp.health) {
      const cls = h.eta === 45 ? 'line' : 'tx'; // eta 45 -> line, 50 -> tx
      expect(Math.abs(healthFromAge(cls, h.tEff) - h.hi)).toBeLessThan(1e-12);
    }
  });
});
