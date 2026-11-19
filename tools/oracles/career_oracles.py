#!/usr/bin/env python3
"""Career (GRID 1.1 lane E2) oracles: independent checks of the closed forms used by src/career.

  1. Weibull hazard lambda(t) = (beta/eta)(t/eta)^(beta-1), and the expected number of failures over a quarter, here by Simpson
     integration of the hazard (the TypeScript engine uses the closed form H(t+dt) - H(t) with H = (t/eta)^beta).
  2. Allowed revenue = RAB x WACC + RAB / life + opex allowance (simplified RIIO-like), RAB roll-forward.
  3. Incentive pay / fine on SAIDI and SAIFI relative to target, with the reward and fine caps.
  4. District SAIDI / SAIFI as the customer-weighted mean of the feeders.
  5. Compound load growth: L(n quarters) = L0 (1 + g)^(n/4); health index from effective age.
Parameters mirror src/career/data.ts (the TypeScript test checks that data.ts still holds the same values).
Run: python3 tools/oracles/career_oracles.py   -> writes career_expected.json
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
PARAMS = dict(wacc=0.045, lifeYears=40, cmiRateM=0.12e-6, cifRateM=12e-6, rewardCapPct=2.0, fineCapPct=5.0, hiLife=1.2, lineEta=45.0)
OUT = {'params': PARAMS}


def hazard(t, beta, eta):
    return 0.0 if t <= 0 else (beta / eta) * (t / eta) ** (beta - 1)


def simpson(f, a, b, n=2000):
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += (4 if i % 2 else 2) * f(a + i * h)
    return s * h / 3


def weibull():
    cases = []
    for beta, eta, t in [(2.5, 45, 36.0), (2.5, 45, 60.0), (4, 50, 41.0), (3, 40, 30.0), (4, 50, 0.25), (3, 40, 55.5)]:
        dt = 0.25
        cases.append(dict(beta=beta, eta=eta, t=t, hazard=hazard(t, beta, eta),
                          expected=simpson(lambda x: hazard(x, beta, eta), t, t + dt), prob=1 - math.exp(-simpson(lambda x: hazard(x, beta, eta), t, t + dt))))
    OUT['weibull'] = cases


def revenue():
    P = PARAMS
    cases = []
    for rab, opex in [(48.0, 4.2), (64.5, 4.6), (30.0, 3.0)]:
        cases.append(dict(rab=rab, opex=opex, ar=rab * P['wacc'] + rab / P['lifeYears'] + opex))
    # RAB roll-forward over quarters with additions
    rab, rows = 48.0, []
    for q, add in enumerate([0, 0.5, 0, 1.2, 0, 0, 0.3, 2.0]):
        rab = rab - rab / (P['lifeYears'] * 4) + add
        rows.append(rab)
    OUT['revenue'] = dict(cases=cases, rabRoll=dict(additions=[0, 0.5, 0, 1.2, 0, 0, 0.3, 2.0], rab=rows))


def incentive():
    P = PARAMS
    cases = []
    for n, saidi, saifi, ts, tf, ar in [(40000, 400, 2.0, 420, 2.1, 7.5), (40000, 520, 3.0, 420, 2.1, 7.5), (40000, 100, 0.5, 420, 2.1, 7.5),
                                       (41000, 430, 2.15, 420, 2.1, 7.7), (39000, 420, 2.1, 420, 2.1, 7.4)]:
        raw = n * (P['cmiRateM'] * (ts - saidi) + P['cifRateM'] * (tf - saifi))
        v = max(-P['fineCapPct'] / 100 * ar, min(P['rewardCapPct'] / 100 * ar, raw))
        cases.append(dict(n=n, saidi=saidi, saifi=saifi, tSaidi=ts, tSaifi=tf, ar=ar, raw=raw, incentive=v))
    OUT['incentive'] = cases


def aggregation():
    fe = [dict(customers=4600, saidi=380.0, saifi=2.1), dict(customers=4250, saidi=910.0, saifi=5.4), dict(customers=5100, saidi=120.0, saifi=0.7)]
    n = sum(f['customers'] for f in fe)
    OUT['aggregation'] = dict(feeders=fe, saidi=sum(f['customers'] * f['saidi'] for f in fe) / n, saifi=sum(f['customers'] * f['saifi'] for f in fe) / n)


def growth():
    cases = []
    for l0, g, n in [(4000.0, 2.0, 4), (4000.0, 2.0, 40), (3800.0, 1.0, 13), (4500.0, 3.0, 27)]:
        cases.append(dict(kw=l0, pct=g, quarters=n, grown=l0 * (1 + g / 100) ** (n / 4), qfactor=(1 + g / 100) ** 0.25))
    OUT['growth'] = cases
    hi = []
    for t, eta in [(0.0, 45), (20.0, 45), (45.0, 45), (70.0, 45), (30.0, 50)]:
        hi.append(dict(tEff=t, eta=eta, hi=max(1.0, min(10.0, 10 - 9 * t / (PARAMS['hiLife'] * eta)))))
    OUT['health'] = hi


if __name__ == '__main__':
    weibull(); revenue(); incentive(); aggregation(); growth()
    path = os.path.join(HERE, 'career_expected.json')
    json.dump(OUT, open(path, 'w'), indent=1, allow_nan=False)
    print('wrote', path)
    print('weibull', [(c['t'], round(c['hazard'], 5), round(c['expected'], 6)) for c in OUT['weibull']])
    print('incentive', [round(c['incentive'], 4) for c in OUT['incentive']])
    print('aggregation', OUT['aggregation']['saidi'], OUT['aggregation']['saifi'])
