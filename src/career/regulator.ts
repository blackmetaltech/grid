// The annual review (regulator Ms Okafor, finance director Vance, crew chief Tobi), the endings and the score.
import { ENDINGS, INCENTIVE, MONEY, SCORE } from './data';
import { allowedRevenue, incentive as incentiveFor } from './money';
import { avgHealth, trueHealth } from './ageing';
import { totalCustomers, type CareerState, type Ending, type Review, type Verdict } from './state';
import { analyseFeeder, districtExpected, charterOf } from './district';
import { firmMarginPct } from './projects';

/** Load index (RIIO reports one): feeders over their winter cyclic rating at peak, primaries short of firm capacity. Chief Engineer needs both at 0. */
export function loadIndex(s: CareerState): { overloaded: number; firmShort: number } {
  const tw = s.t - (s.t % 4), w = { ...s, t: tw };   // read at the year's winter peak (the highest of the four seasons), so the index does not swing with the season
  return { overloaded: s.feeders.filter((f) => analyseFeeder(w, f).loadingPct > ENDINGS.cyclicPct).length, firmShort: s.primaries.filter((p) => firmMarginPct(s, p.id, tw) < 0).length };
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
  if (reg.grade === 'poor') {   // say which it is: a strike toward the licence (count it) or a fine that does not count (a tester read the same threat every year)
    reg.key = s.severeFineYears > 0 ? 'career.review.regulator.strike' : 'career.review.regulator.poorNoStrike';
    reg.params = { ...reg.params, strike: s.severeFineYears, strikes: INCENTIVE.yearsToRevoke };
  }
  const fin: Verdict = { axis: 'finance', who: 'Vance', grade: s.cash >= 2 ? 'good' : s.cash >= 0 ? 'ok' : 'poor', key: '', params: { cash: s.cash, rab: s.rab, arM: s.ar, creditM: MONEY.creditLimit } };
  fin.key = `career.review.finance.${fin.grade}`;
  const crew: Verdict = { axis: 'crew', who: 'Tobi', grade: bl >= 5 || health < prevHealth - 0.4 ? 'poor' : bl <= 2 && health >= prevHealth - 0.05 ? 'good' : 'ok', key: '', params: { health, prevHealth, backlog: bl } };
  crew.key = `career.review.crew.${crew.grade}`;
  const rv: Review = { year: yearOf(s.t), saidi, saifi, saidiTarget: s.saidiTarget, saifiTarget: s.saifiTarget, exceptionalMin: N ? s.ytdExceptionalMin / N : 0, met, incentiveM: inc, saidiRolling: saidiR, saifiRolling: saifiR, avgHealth: health, cash: s.cash, rab: s.rab, verdicts: [reg, fin, crew], ...loadIndex(s) };
  // next year
  { const g = yearStep(s.saidiTarget, s.saifiTarget, exp); s.saidiTarget = g.saidi; s.saifiTarget = g.saifi; }
  // the end of a price-control period: targets reset to the network's modelled performance plus a deadband, when that is lower
  if ((yearOf(s.t) + 1) % INCENTIVE.periodYears === 0) {
    const nt = periodReset(s.saidiTarget, s.saifiTarget, exp); s.saidiTarget = nt.saidi; s.saifiTarget = nt.saifi;
  }
  s.opexAllowance = (s.opexAllowance / Math.max(1, N)) * N;
  s.ar = allowedRevenue(s.rab, s.opexAllowance) * charterOf(s).revenue; s.arYear = yearOf(s.t) + 1;   // Lean Years: an efficiency challenge on the whole revenue
  s.ytdCustMin = 0; s.ytdCustInt = 0; s.ytdExceptionalMin = 0;
  s.reviews.push(rv);
  return rv;
}

/** Ending after a quarter (null = play on). */
/** One year's tightening: targetTightenPct, and more (up to glideMaxPct in all) while the network's expected performance x resetFactor
 * is well below the target, so targets follow a network that heals fast instead of waiting for the five-year reset (Old Iron tester). */
export function yearStep(saidiT: number, saifiT: number, exp: { saidi: number; saifi: number }): { saidi: number; saifi: number } {
  const step = (t: number, e: number): number => { const base = t * (1 - INCENTIVE.targetTightenPct / 100), aim = INCENTIVE.resetFactor * e;
    return aim >= base ? base : Math.max(aim, t * (1 - INCENTIVE.glideMaxPct / 100)); };
  return { saidi: step(saidiT, exp.saidi), saifi: step(saifiT, exp.saifi) };
}

/** Next period's targets: resetFactor x the expected value where that is tighter, but never more than INCENTIVE.maxResetCutPct below the old target in one review (no cliff). */
export function periodReset(saidiT: number, saifiT: number, exp: { saidi: number; saifi: number }): { saidi: number; saifi: number } {
  const floor = 1 - INCENTIVE.maxResetCutPct / 100;
  return { saidi: Math.max(saidiT * floor, Math.min(saidiT, INCENTIVE.resetFactor * exp.saidi)), saifi: Math.max(saifiT * floor, Math.min(saifiT, INCENTIVE.resetFactor * exp.saifi)) };
}

/** What stands between this career and Chief Engineer at the end (empty = none): keys career.short.<x>. */
export function chiefShortfalls(s: CareerState): string[] {
  const out: string[] = [];
  if (s.yearsMet < ENDINGS.chiefYearsMet) out.push('years');
  if (avgHealth(s) <= s.startHealth) out.push('health');
  if (s.cash < 0) out.push('debt');
  const li = loadIndex(s);
  if (li.overloaded > 0) out.push('overloaded');
  if (li.firmShort > 0) out.push('firm');
  return out;
}

export function endingOf(s: CareerState, reviewed: boolean): Ending | null {
  if (s.cash < -MONEY.creditLimit) return 'bailedOut';
  if (reviewed && s.severeFineYears >= INCENTIVE.yearsToRevoke) return 'licenceRevoked';
  if (s.t >= ENDINGS.quarters) {
    if (chiefShortfalls(s).length === 0) return 'chiefEngineer';   // any debt at the end, an overload, a short primary, too few years met or older assets cap the career below Chief
    return 'steady';
  }
  return null;
}

/** Career score (higher is better). Reads the state at any time, including after an early ending. */
/** The career score's parts, for display only (careerScore stays the one formula the leaderboard verifies): key -> points. */
export function scoreParts(s: CareerState): { key: string; points: number }[] {
  const saidiSum = s.history.reduce((a, k) => a + k.saidiReal, 0);
  const bonus = { chiefEngineer: SCORE.chief, steady: SCORE.steady, bailedOut: SCORE.bailed, licenceRevoked: SCORE.revoked }[s.ending ?? 'steady'];
  const early = s.ending === 'bailedOut' || s.ending === 'licenceRevoked' ? (ENDINGS.quarters - s.t) * SCORE.perQuarterLeftLost : 0;
  const cash = s.cash >= 0 ? Math.min(s.cash, 10) * SCORE.perCashM : s.cash * SCORE.perDebtM;
  return [
    { key: 'years', points: s.yearsMet * SCORE.perYearMet }, { key: 'saidi', points: -saidiSum * SCORE.perSaidiMin },
    { key: 'incentive', points: s.netIncentiveM * SCORE.perIncentiveM }, { key: 'health', points: (avgHealth(s) - s.startHealth) * SCORE.perHealth },
    { key: 'delivered', points: s.delivered * SCORE.perDelivered }, { key: 'missed', points: -s.missed * SCORE.perMissed },
    { key: 'cash', points: cash }, { key: 'ending', points: bonus - early },
  ];
}

export function careerScore(s: CareerState): number {
  const saidiSum = s.history.reduce((a, k) => a + k.saidiReal, 0);
  const bonus = { chiefEngineer: SCORE.chief, steady: SCORE.steady, bailedOut: SCORE.bailed, licenceRevoked: SCORE.revoked }[s.ending ?? 'steady'];
  const early = s.ending === 'bailedOut' || s.ending === 'licenceRevoked' ? (ENDINGS.quarters - s.t) * SCORE.perQuarterLeftLost : 0;
  const cash = s.cash >= 0 ? Math.min(s.cash, 10) * SCORE.perCashM : s.cash * SCORE.perDebtM;
  return Math.round((s.yearsMet * SCORE.perYearMet - saidiSum * SCORE.perSaidiMin + s.netIncentiveM * SCORE.perIncentiveM + (avgHealth(s) - s.startHealth) * SCORE.perHealth + s.delivered * SCORE.perDelivered - s.missed * SCORE.perMissed + cash + bonus - early) * 100) / 100;
}
