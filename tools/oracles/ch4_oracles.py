#!/usr/bin/env python3
"""Chapter 4 oracles (L10 Balance the Phases, L11 Star or Delta, L12 Over the Hill, L13 Exam Bridge): independent numpy/stdlib re-derivations of the
engine's numbers, written BEFORE the engine (src/sim/ch4). Writes tools/oracles/ch4_expected.json; src/level/ch4.test.ts compares the engine to it.

Nothing here imports the TypeScript data: every constant below is the design value of the level (DESIGN 2.6, DEPTH 3-4) and is repeated in
src/sim/ch4/data.ts on purpose, so a typo in one place fails the test.  Run:  python3 tools/oracles/ch4_oracles.py
"""
import cmath, json, math, os
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), 'ch4_expected.json')

# ------------------------------------------------------------------------------------------------------------------------------ L10 4-wire feeder
F0 = 50.0
V_PH = 230.0                     # nominal phase-to-neutral volts (IEC 60038); loads are constant-Z at this voltage
EMF_PH = 237.0                   # transformer EMF behind its impedance (1.03 pu, OLTC set high for the evening)
Z_TX = complex(0.012, 0.038)     # 160 kVA 4 % 11/0.4 kV, per phase (ohm)
RN_TX = 0.0005                   # neutral bonding of the transformer riser (ohm), the star point is earthed through 1 ohm (S23)
SPANS, SPAN_M = 6, 70.0
Z_PH_KM = complex(0.443, 0.082)  # ABC 3x70 mm2 Al phase conductors (ohm/km)
NEUTRAL = {54.6: (0.554, 150.0, 3.0), 70.0: (0.443, 175.0, 3.9), 95.0: (0.320, 215.0, 5.2)}   # mm2 -> (r ohm/km, ampacity A, price USD/m)
X_N_KM = 0.082
HOUSES = [(3.2, 0.95), (1.1, 0.85), (4.0, 0.80), (0.8, 0.90), (2.4, 1.0), (1.6, 0.85),
          (3.6, 0.90), (0.5, 0.95), (2.0, 0.80), (1.4, 1.0), (3.0, 0.85), (0.9, 0.90),
          (2.8, 0.95), (1.8, 0.80), (0.6, 1.0), (3.9, 0.85), (1.2, 0.90), (2.2, 0.95)]   # kW, pf  (3 houses per pole, poles 1..6)
SHAPE = [0.95, 1, 1, 1, 1, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]   # 19:00..23:00, 16 blocks


def feeder(phases, neutral_mm2=54.6, scale=1.0, neutral_open=False):
    rn = NEUTRAL[neutral_mm2][0]
    names, elems = {}, []
    ix = lambda n: names.setdefault(n, len(names))
    for ph, ang in (('a', 0), ('b', -120), ('c', 120)):
        elems.append(('V', f'{ph}0', 'n0', cmath.rect(EMF_PH, math.radians(ang))))
    elems.append(('Z', 'n0', 'g', 1.0))
    for k in range(1, SPANS + 2):
        zp = Z_TX if k == 1 else Z_PH_KM * SPAN_M / 1000
        zn = complex(RN_TX, 0) if k == 1 else complex(rn, X_N_KM) * SPAN_M / 1000
        if neutral_open and k == 2: zn = complex(1e9, 0)
        for ph in 'abc': elems.append(('Z', f'{ph}{k-1}', f'{ph}{k}', zp))
        elems.append(('Z', f'n{k}', f'n{k-1}', zn))
    y = {}
    for i, (kw, pf) in enumerate(HOUSES):
        k, ph = i // 3 + 2, phases[i]
        p = kw * 1000 * scale; q = p * math.tan(math.acos(pf))
        y[(k, ph)] = y.get((k, ph), 0j) + complex(p, -q) / V_PH ** 2
    for (k, ph), yy in y.items(): elems.append(('Z', f'{ph}{k}', f'n{k}', 1 / yy))
    for e in elems:
        for n in e[1:3]:
            if n != 'g': ix(n)
    n = len(names); vs = [e for e in elems if e[0] == 'V']
    A = np.zeros((n + len(vs), n + len(vs)), complex); b = np.zeros(n + len(vs), complex)
    for e in elems:
        if e[0] == 'Z':
            yy = 1 / e[3]; i = names.get(e[1], -1); j = names.get(e[2], -1)
            if i >= 0: A[i, i] += yy
            if j >= 0: A[j, j] += yy
            if i >= 0 and j >= 0: A[i, j] -= yy; A[j, i] -= yy
    for m, e in enumerate(vs):
        i, j, r = names.get(e[1], -1), names.get(e[2], -1), n + m
        if i >= 0: A[i, r] += 1; A[r, i] += 1
        if j >= 0: A[j, r] -= 1; A[r, j] -= 1
        b[r] = e[3]
    x = np.linalg.solve(A, b)
    V = lambda nm: x[names[nm]]
    ip = {ph: (V(f'{ph}0') - V(f'{ph}1')) / Z_TX for ph in 'abc'}
    i_n = (V('n1') - V('n0')) / complex(RN_TX, 0)
    vfar = {ph: abs(V(f'{ph}{SPANS+1}') - V(f'n{SPANS+1}')) for ph in 'abc'}
    loss = 0.0
    for k in range(1, SPANS + 2):
        zp = Z_TX if k == 1 else Z_PH_KM * SPAN_M / 1000
        zn = complex(RN_TX, 0) if k == 1 else complex(rn, X_N_KM) * SPAN_M / 1000
        for ph in 'abc': loss += abs((V(f'{ph}{k-1}') - V(f'{ph}{k}')) / zp) ** 2 * zp.real
        loss += abs((V(f'n{k}') - V(f'n{k-1}')) / zn) ** 2 * zn.real
    psup = sum(((V(f'{ph}0') - V('n0')) * np.conj(ip[ph])).real for ph in 'abc')
    return dict(iN=abs(i_n), iMax=max(abs(v) for v in ip.values()), iPhase={p: abs(v) for p, v in ip.items()}, vFar=vfar, lossPct=100 * loss / psup,
                pSupplyW=psup, iNpct=100 * abs(i_n) / max(abs(v) for v in ip.values()), neutralShiftFarV=abs(V(f'n{SPANS+1}') - V('n0')))


def greedy(key):
    order = sorted(range(18), key=lambda i: (-key(HOUSES[i]), i)); load = {p: 0.0 for p in 'abc'}; ph = ['a'] * 18
    for i in order:
        p = min('abc', key=lambda q: (load[q], q)); ph[i] = p; load[p] += key(HOUSES[i])
    return ''.join(ph)


def min_moves_reference():
    """Greedy descent from the all-on-a street: move the house that lowers I_N/I_max most, until I_N <= 15 % of I_max and far-pole phase voltages are within +-5 %."""
    ph = ['a'] * 18; moves = 0
    while moves < 18:
        r = feeder(ph)
        if r['iNpct'] <= 15 and min(r['vFar'].values()) >= V_PH * 0.95 and max(r['vFar'].values()) <= V_PH * 1.05: break
        best = None
        for i in range(18):
            if ph[i] == 'a':
                for p in 'bc':
                    q = ph[:]; q[i] = p; s = feeder(q)['iNpct']
                    if best is None or s < best[0] - 1e-12: best = (s, q)
        ph = best[1]; moves += 1
    return ''.join(ph)


def l10():
    asg = {'allA': 'a' * 18, 'roundRobin': ''.join('abc'[i % 3] for i in range(18)), 'greedyKW': greedy(lambda h: h[0]), 'greedyKVA': greedy(lambda h: h[0] / h[1]),
           'minMoves': min_moves_reference()}
    out = {'assignments': asg, 'cases': {}}
    for name, a in asg.items():
        r = feeder(list(a)); out['cases'][name] = {k: (float(v) if not isinstance(v, dict) else {p: float(w) for p, w in v.items()}) for k, v in r.items()}
        out['cases'][name]['moves'] = sum(1 for c in a if c != 'a')
    out['neutralOpenAllA'] = {k: (float(v) if not isinstance(v, dict) else {p: float(w) for p, w in v.items()}) for k, v in feeder(list('a' * 18), neutral_open=True).items()}
    out['balancedSumMag'] = abs(1 + cmath.rect(1, math.radians(120)) + cmath.rect(1, math.radians(240)))
    ia, ib, ic = cmath.rect(10, 0), cmath.rect(6, math.radians(-120)), cmath.rect(4, math.radians(120))   # G-05
    out['g05'] = {'iN': abs(ia + ib + ic), 'deg': math.degrees(cmath.phase(ia + ib + ic))}
    out['totalKW'] = sum(h[0] for h in HOUSES)
    return out


# ------------------------------------------------------------------------------------------------------------------------------ L11 power-factor bank
W = 2 * math.pi * F0
VL = 400.0
P_EST, PF_EST = 500e3, 0.70
Q_EST = P_EST * math.tan(math.acos(PF_EST))
ZS = complex(0.2 * 0.04, 0.98 * 0.04)      # estate supply (weak rural feeder, ~4 MVA short-circuit level) behind the estate bus
PUMP_KW, PUMP_ETA, PUMP_PF, START_PF = 75.0, 0.92, 0.88, 0.30
MULT = {'dol': 6.0, 'yd': 2.0, 'soft': 3.5}


def bank(units, unit_uf, conn, rated):
    cph = units * unit_uf * 1e-6
    q = W * cph * VL ** 2 * (1 if conn == 'Y' else 3)
    can_v = VL / math.sqrt(3) if conn == 'Y' else VL
    return dict(cPhaseUF=units * unit_uf, qKvar=q / 1e3, canV=can_v, burst=can_v > rated * 1.1)


def l11_case(q_c_var, starter):
    vph = VL / math.sqrt(3)
    y = complex(P_EST, -Q_EST + q_c_var) / (3 * vph ** 2)
    v = lambda yl: vph / (1 + ZS * yl)
    ifl = PUMP_KW * 1e3 / (math.sqrt(3) * VL * PUMP_PF * PUMP_ETA)
    yst = (MULT[starter] * ifl / vph) * cmath.exp(-1j * math.acos(START_PF))
    v0, v1 = abs(v(y)), abs(v(y + yst))
    qnet = Q_EST - q_c_var
    return dict(pf=P_EST / math.hypot(P_EST, qnet), qNetKvar=qnet / 1e3, vBusPu=v0 / vph, dipPct=100 * (1 - v1 / v0), iStartA=MULT[starter] * ifl, iFullA=ifl)


def l11():
    qc_need = P_EST * (math.tan(math.acos(PF_EST)) - math.tan(math.acos(0.95)))
    out = {'qcNeedKvar': qc_need / 1e3, 'cYuF': qc_need / (W * VL ** 2) * 1e6, 'cDuF': qc_need / (3 * W * VL ** 2) * 1e6, 'qMotorsKvar': Q_EST / 1e3, 'iFullA': l11_case(0, 'dol')['iFullA']}
    out['banks'] = {}
    for key, (n, uf, conn, rated) in {'Y250x72': (72, 100, 'Y', 250), 'D440x24': (24, 100, 'D', 440), 'D250x24': (24, 100, 'D', 250), 'Y250x55': (55, 100, 'Y', 250), 'Y250x110': (110, 100, 'Y', 250)}.items():
        b = bank(n, uf, conn, rated); out['banks'][key] = {**b, **{f'{s}': l11_case(b['qKvar'] * 1e3, s) for s in MULT}}
    out['nocap'] = {s: l11_case(0, s) for s in MULT}
    return out


# ------------------------------------------------------------------------------------------------------------------------------ L12 over the hill
BASE_MVA = 100.0
X_D1, X_GSU = 0.16, 0.06                     # generator X'd and step-up transformers, pu on 100 MVA (X'd + GSU = 0.22)
ZEBRA_X, KM, KV = 0.417, 300.0, 220.0        # DESIGN 4.3 l220-zebra
X_CIRC = ZEBRA_X * KM / (KV ** 2 / BASE_MVA)
H_S, D_PU, P_PU = 3.0, 1.5, 2.0              # two 100 MW units, H = 3 s, damper windings D = 1.5 pu, 200 MW at 19:30


def l12_case(vref, series_pct=0, third=False, reduce_mw=0.0):
    pm = P_PU - reduce_mw / BASE_MVA
    x1 = X_CIRC * (1 - series_pct / 100.0)
    n_pre = 3 if third else 2
    x_ext_pre = X_GSU + x1 / n_pre
    x_ext_post = X_GSU + x1 / (n_pre - 1)
    s = pm * x_ext_pre / vref
    if s > 1: return dict(ok=False)
    th = math.asin(s); vt = cmath.rect(vref, th)
    i = (vt - 1) / (1j * x_ext_pre)
    e = vt + 1j * X_D1 * i
    em, d0 = abs(e), cmath.phase(e)
    pmax_pre, pmax_post = em / (X_D1 + x_ext_pre), em / (X_D1 + x_ext_post)
    out = dict(ok=True, E=em, delta0Deg=math.degrees(d0), pmaxPre=pmax_pre, pmaxPost=pmax_post, pm=pm, xPre=X_D1 + x_ext_pre, xPost=X_D1 + x_ext_post)
    if pm > pmax_post:
        out.update(noEquilibrium=True, lost=True); return out
    du = math.pi - math.asin(pm / pmax_post); ws = 2 * math.pi * F0
    d, w, t, dt, dmax, lost, t_lost = d0, 1.0, 0.0, 1e-3, d0, False, None
    f = lambda dd, ww: (ws * (ww - 1), (pm - pmax_post * math.sin(dd) - D_PU * (ww - 1)) / (2 * H_S))
    while t < 3.0 - 1e-12:
        k1 = f(d, w); k2 = f(d + dt / 2 * k1[0], w + dt / 2 * k1[1]); k3 = f(d + dt / 2 * k2[0], w + dt / 2 * k2[1]); k4 = f(d + dt * k3[0], w + dt * k3[1])
        d += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); w += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); t += dt
        dmax = max(dmax, d)
        if d > du and w > 1: lost, t_lost = True, t; break
    out.update(noEquilibrium=False, deltaPostDeg=math.degrees(math.asin(pm / pmax_post)), deltaUDeg=math.degrees(du), deltaMaxDeg=math.degrees(dmax), lost=lost, tLossS=t_lost,
               marginDeg=math.degrees(du - dmax))
    return out


def l12():
    cases = {'night0.90': (0.90, 0, False, 0), 'v0.95': (0.95, 0, False, 0), 'v1.00': (1.00, 0, False, 0), 'v1.05': (1.05, 0, False, 0),
             'v1.05s30': (1.05, 30, False, 0), 'v1.05s50': (1.05, 50, False, 0), 'v1.05r20': (1.05, 0, False, 20), 'v1.00s30': (1.00, 30, False, 0),
             'v0.90third': (0.90, 0, True, 0), 'v0.90r60': (0.90, 0, False, 60)}
    return {'xCircuitPu': X_CIRC, 'cases': {k: l12_case(*v) for k, v in cases.items()}}


# ------------------------------------------------------------------------------------------------------------------------------ L13 generator phasors
XS = 1.2
P_NIGHT, Q_NIGHT_TARGET = 0.6, -0.2


def l13():
    e = 1 + 1j * XS * cmath.rect(1.0, -math.acos(0.8))            # V = 1, I = 1 pf 0.8 lagging
    em, d = abs(e), cmath.phase(e)
    night = 1 + 1j * XS * complex(P_NIGHT, -Q_NIGHT_TARGET)         # I = (P - jQ)/V* ; Q = -0.2 (absorbs)
    en, dn = abs(night), cmath.phase(night)

    def at(E):    # night operation at excitation E: P fixed, Q from the phasor diagram
        dd = math.asin(P_NIGHT * XS / E)
        return dict(deltaDeg=math.degrees(dd), q=(E * math.cos(dd) - 1) / XS)
    return {'E': em, 'deltaDeg': math.degrees(d), 'pmax': em / XS, 'pAtDelta': em * math.sin(d) / XS,
            'night': {'E': en, 'deltaDeg': math.degrees(dn), 'q': Q_NIGHT_TARGET}, 'atE': {k: at(v) for k, v in {'1.00': 1.00, '1.04': 1.04, '1.05': 1.05, '1.20': 1.2}.items()}}


if __name__ == '__main__':
    data = {'meta': {'generator': 'tools/oracles/ch4_oracles.py', 'numpy': np.__version__, 'note': 'independent oracles for chapter 4 (L10-L13); the engine tests read this file'},
            'L10': l10(), 'L11': l11(), 'L12': l12(), 'L13': l13()}
    with open(OUT, 'w') as f: json.dump(data, f, indent=1, sort_keys=True)
    L = data['L10']['cases']
    for k, v in L.items(): print('L10', k, 'iN %.2f iMax %.2f iN%% %.1f vFar %s loss %.2f moves %d' % (v['iN'], v['iMax'], v['iNpct'], {p: round(w, 1) for p, w in v['vFar'].items()}, v['lossPct'], v['moves']))
    print('L10 minMoves', data['L10']['assignments']['minMoves'], 'greedyKVA', data['L10']['assignments']['greedyKVA'], 'greedyKW', data['L10']['assignments']['greedyKW'])
    print('L11', json.dumps({k: (round(v, 3) if isinstance(v, float) else '...') for k, v in data['L11'].items()}))
    for k, v in data['L11']['banks'].items(): print('L11', k, round(v['qKvar'], 1), 'burst', v['burst'], {s: (round(v[s]['pf'], 3), round(v[s]['dipPct'], 2)) for s in MULT})
    for k, v in data['L12']['cases'].items(): print('L12', k, {a: (round(b, 3) if isinstance(b, float) else b) for a, b in v.items() if a in ('E', 'pmaxPre', 'pmaxPost', 'deltaPostDeg', 'deltaMaxDeg', 'lost', 'marginDeg')})
    print('L13', data['L13'])
