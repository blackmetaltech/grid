// The annual review (regulator Ms Okafor, finance director Vance, crew chief Tobi), the endings and the score.
import { ENDINGS, INCENTIVE, MONEY, SCORE } from './data';
import { allowedRevenue, incentive as incentiveFor } from './money';
import { avgHealth, trueHealth } from './ageing';
import { totalCustomers, type CareerState, type Ending, type Review, type Verdict } from './state';
import { analyseFeeder, districtExpected } from './district';
import { firmMarginPct } from './projects';

/** Load index (RIIO reports one): feeders over their winter cyclic rating at peak, primaries short of firm capacity. Chief Engineer needs both at 0. */
export function loadIndex(s: CareerState): { overloaded: number; firmShort: number } {
  return { overloaded: s.feeders.filter((f) => analyseFeeder(s, f).loadingPct > ENDINGS.cyclicPct).length, firmShort: s.primaries.filter((p) => firmMarginPct(s, p.id) < 0).length };
}

export const yearOf = (t: number): number => Math.floor(t / 4);
export const backlog = (s: CareerState): number => s.assets.filter((a) => trueHealth(a, s.t) < 3).length;

/** Run the review at the end of the 4th quarter. Mutates the cloned state: books the incentive, tightens the target, resets the year. */
export function annualReview(s: CareerState): Review {
  const N = totalCustomers(s), saidi = N ? s.ytdCustMin / N : 0, saifi = N ? s.ytdCustInt / N : 0;
  // the regulator judges a rolling mean of the last INCENTIVE.rollingYears years (this one included), as real schemes smooth weather luck
  const inPeriod = yearOf(s.t) % INCENTIVE.periodYears;   // years of this price-control period already reviewed (a new period starts its own window)
  const k = Math.min(INCENTIVE.rollingYears - 1, inPeriod), last = k > 0 ? s.reviews.slice(-k) : [];
  const saidiR = (saidi + last.reduce((a, r) => a + r.saidi, 0)) / (1 + last.length), saifiR = (saifi + last.reduce((a, r) => a + r.saifi, 0)) / (1 + last.length);
  const inc = incentiveFor(N, saidiR, saifiR, s.saidiTarget, s.saifiTarget, s.ar);
  const met = saidiR <= s.saidiTarget && saifiR <= s.saifiTarget;
  const prevHealth = s.reviews.length ? s.reviews[s.reviews.length - 1]!.avgHealth : s.startHealth;
  const health = avgHealth(s);
  s.cash += inc; s.netIncentiveM += inc;
  if (met) s.yearsMet++;
  // a severe fine counts toward revocation only when the network itself cannot meet the targets (its modelled, luck-free SAIDI or SAIFI is over them): a regulator revokes for failure to invest, not for weather
  const exp = districtExpected(s), inadequate = exp.saidi > s.saidiTarget || exp.saifi > s.saifiTarget;
  // severeFineYears is the current streak: three in a row on an inadequate network ends the licence; a year that is not one resets it
  s.severeFineYears = inc < -(INCENTIVE.severeFinePct / 100) * s.ar && inadequate ? s.severeFineYears + 1 : 0;
  const bl = backlog(s);
  const reg: Verdict = {
    axis: 'regulator', who: 'Ms Okafor', grade: met && inc > 0 ? 'good' : met || inc > -(INCENTIVE.severeFinePct / 100) * s.ar ? 'ok' : 'poor',
    key: '', params: { saidi: saidiR, saifi: saifiR, saidiYear: saidi, saifiYear: saifi, saidiTarget: s.saidiTarget, saifiTarget: s.saifiTarget, incentiveM: inc },
  };
  reg.key = `career.review.regulator.${reg.grade}`;
  const fin: Verdict = { axis: 'finance', who: 'Vance', grade: s.cash >= 2 ? 'good' : s.cash >= 0 ? 'ok' : 'poor', key: '', params: { cash: s.cash, rab: s.rab, arM: s.ar } };
  fin.key = `career.review.finance.${fin.grade}`;
  const crew: Verdict = { axis: 'crew', who: 'Tobi', grade: bl >= 5 || health < prevHealth - 0.4 ? 'poor' : bl <= 2 && health >= prevHealth - 0.05 ? 'good' : 'ok', key: '', params: { health, prevHealth, backlog: bl } };
  crew.key = `career.review.crew.${crew.grade}`;
  const rv: Review = { year: yearOf(s.t), saidi, saifi, saidiTarget: s.saidiTarget, saifiTarget: s.saifiTarget, exceptionalMin: N ? s.ytdExceptionalMin / N : 0, met, incentiveM: inc, saidiRolling: saidiR, saifiRolling: saifiR, avgHealth: health, cash: s.cash, rab: s.rab, verdicts: [reg, fin, crew], ...loadIndex(s) };
  // next year
  s.saidiTarget *= 1 - INCENTIVE.targetTightenPct / 100; s.saifiTarget *= 1 - INCENTIVE.targetTightenPct / 100;
  // the end of a price-control period: targets reset to the network's modelled performance plus a deadband, when that is lower
  if ((yearOf(s.t) + 1) % INCENTIVE.periodYears === 0) {
    s.saidiTarget = Math.min(s.saidiTarget, INCENTIVE.resetFactor * exp.saidi); s.saifiTarget = Math.min(s.saifiTarget, INCENTIVE.resetFactor * exp.saifi);
  }
  s.opexAllowance = (s.opexAllowance / Math.max(1, N)) * N;
  s.ar = allowedRevenue(s.rab, s.opexAllowance); s.arYear = yearOf(s.t) + 1;
  s.ytdCustMin = 0; s.ytdCustInt = 0; s.ytdExceptionalMin = 0;
  s.reviews.push(rv);
  return rv;
}

/** Ending after a quarter (null = play on). */
export function endingOf(s: CareerState, reviewed: boolean): Ending | null {
  if (s.cash < -MONEY.creditLimit) return 'bailedOut';
  if (reviewed && s.severeFineYears >= INCENTIVE.yearsToRevoke) return 'licenceRevoked';
  if (s.t >= ENDINGS.quarters) {
    if (s.yearsMet >= ENDINGS.chiefYearsMet && avgHealth(s) > s.startHealth && s.cash >= 0) { const li = loadIndex(s); if (li.overloaded === 0 && li.firmShort === 0) return 'chiefEngineer'; }
    return 'steady';
  }
  return null;
}

/** Career score (higher is better). Reads the state at any time, including after an early ending. */
export function careerScore(s: CareerState): number {
  const saidiSum = s.history.reduce((a, k) => a + k.saidiReal, 0);
  const bonus = { chiefEngineer: SCORE.chief, steady: SCORE.steady, bailedOut: SCORE.bailed, licenceRevoked: SCORE.revoked }[s.ending ?? 'steady'];
  const early = s.ending === 'bailedOut' || s.ending === 'licenceRevoked' ? (ENDINGS.quarters - s.t) * SCORE.perQuarterLeftLost : 0;
  const cash = s.cash >= 0 ? Math.min(s.cash, 10) * SCORE.perCashM : s.cash * SCORE.perDebtM;
  return Math.round((s.yearsMet * SCORE.perYearMet - saidiSum * SCORE.perSaidiMin + s.netIncentiveM * SCORE.perIncentiveM + (avgHealth(s) - s.startHealth) * SCORE.perHealth + s.delivered * SCORE.perDelivered - s.missed * SCORE.perMissed + cash + bonus - early) * 100) / 100;
}
