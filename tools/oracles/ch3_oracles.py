"""Chapter 3 oracles (L07 power triangle, L08 harmonic resonance, L09 series compensation) -> tools/oracles/ch3_expected.json.

Independent of the engine: numpy complex nodal analysis at h x f0 for the harmonic study, scipy fsolve for the two-bus load flows, closed forms for resonance orders and fault currents.
Run:  python3 -I tools/oracles/ch3_oracles.py
Inputs are the level constants (src/level/levels/l07.ts, l08.ts, l09.ts) and the line templates (src/data/lineTemplates.ts); nothing is read from the engine.
"""
import cmath, json, math, os
import numpy as np
from scipy.optimize import fsolve

HERE = os.path.dirname(os.path.abspath(__file__))
S3 = math.sqrt(3)
tan = lambda pf: math.sqrt(1 - pf * pf) / pf


def two_bus(Vs, kV, r_ohm, x_ohm, P, Q, bank=None):
    """Constant-PQ load at the far bus of one line (ohm, per phase equivalent); bank = (Qc_nameplate_MVAr, p): Q = Qc V^2 / (1-p). Returns |V| pu, I A, supply P, Q (MW, MVAr), losses."""
    zb = kV * kV / 100.0
    z = complex(r_ohm, x_ohm) / zb
    qc, p = bank if bank else (0.0, 0.0)
    def F(u):
        V = u[0] * cmath.exp(1j * u[1])
        Qb = qc / (1 - p) * u[0] ** 2
        I = (Vs - V) / z
        S = V * I.conjugate() - complex(P, Q - Qb) / 100
        return [S.real, S.imag]
    u = fsolve(F, [1, 0], xtol=1e-13)
    V = u[0] * cmath.exp(1j * u[1]); I = (Vs - V) / z
    Ssup = Vs * I.conjugate() * 100
    amps = abs(I) * 100e6 / (S3 * kV * 1e3)
    return dict(V=u[0], I_A=amps, P_MW=Ssup.real, Q_MVAr=Ssup.imag, S_MVA=abs(Ssup), pf=Ssup.real / abs(Ssup))


# ------------------------------------------------------------------------------------------------------------------ L07
def l07():
    mill_p, mill_pf, vil_p, vil_pf = 1.2, 0.70, 0.5, 0.95
    ql = mill_p * tan(mill_pf) + vil_p * tan(vil_pf)
    out = dict(
        mill_peak=dict(P_MW=mill_p, Q_MVAr=mill_p * tan(mill_pf), S_MVA=mill_p / mill_pf, pf=mill_pf, phi_deg=math.degrees(math.acos(mill_pf))),
        lunch=dict(P_MW=0.15, Q_MVAr=0.9, S_MVA=math.hypot(0.15, 0.9), pf=0.15 / math.hypot(0.15, 0.9), phi_deg=math.degrees(math.atan2(0.9, 0.15))),
        peak_load=dict(P_MW=mill_p + vil_p, Q_MVAr=ql, S_MVA=math.hypot(mill_p + vil_p, ql), pf=(mill_p + vil_p) / math.hypot(mill_p + vil_p, ql)),
    )
    out['qc_rule_to_0p95_MVAr'] = (mill_p + vil_p) * (ql / (mill_p + vil_p) - tan(0.95))
    # wattless current at lunch: the village at its midday load is the engine's profile, so the oracle gives the mill's own current at the feeder voltage (1.0 pu, 11 kV)
    out['lunch']['I_mill_A'] = out['lunch']['S_MVA'] * 1e6 / (S3 * 11e3)
    out['peak_mill_A'] = out['mill_peak']['S_MVA'] * 1e6 / (S3 * 11e3)
    return out


# ------------------------------------------------------------------------------------------------------------------ L08
KV8 = 11.0
RABBIT = (0.6728, 0.360)   # ohm/km, 4 km
SSC, XR, DAMP, VFD_PF = 30.0, 10.0, 0.15, 0.95
ORDERS = (5, 7, 11, 13)
ESR = 0.001
MILL, VIL, FAC = 1.2, 0.5, 0.8


def harmonics(Vpu_b2, qc_mvar, p, bank_at, pf_fac=VFD_PF):
    """Two-node network B1 (supply bus) - feeder - B2 (drives, load damping). Returns THD% at B2, bank rms/rated, per-order bank currents, parallel resonance order."""
    L = 4.0
    rf, xf = RABBIT[0] * L, RABBIT[1] * L
    xs = KV8 ** 2 / SSC; rs = xs / XR
    ptot = MILL + VIL + FAC
    rd = KV8 ** 2 / (DAMP * ptot)
    i1 = FAC * 1e6 / (S3 * KV8 * 1e3 * Vpu_b2 * pf_fac)
    xc = KV8 ** 2 / qc_mvar if qc_mvar > 0 else None
    vh, ch = [], []
    for h in ORDERS:
        Ys = 1 / complex(rs, h * xs); Yf = 1 / complex(rf, h * xf)
        Y = np.zeros((2, 2), complex)
        Y[0, 0] += Ys + Yf; Y[1, 1] += Yf; Y[0, 1] -= Yf; Y[1, 0] -= Yf; Y[1, 1] += 1 / rd
        if qc_mvar > 0:
            Zb = complex(ESR * xc, h * p * xc - xc / h)
            k = 1 if bank_at == 'B2' else 0
            Y[k, k] += 1 / Zb
        V = np.linalg.solve(Y, np.array([0, i1 / h], complex))
        vh.append(abs(V[1]))
        if qc_mvar > 0: ch.append(abs(V[1 if bank_at == 'B2' else 0] / Zb))
    v1ph = Vpu_b2 * KV8 * 1e3 / S3
    thd = math.sqrt(sum(v * v for v in vh)) / v1ph * 100
    res = dict(thd_pct=thd, i1_A=i1, I5_A=i1 / 5, vh_V=dict(zip(ORDERS, vh)))
    if qc_mvar > 0:
        rated = qc_mvar * 1e6 / (S3 * KV8 * 1e3)
        fund = v1ph / (xc * (1 - p)) if bank_at == 'B2' else None
        res.update(rated_A=rated, ch_A=dict(zip(ORDERS, ch)))
        if fund is not None:
            res['rms_ratio'] = math.sqrt(fund ** 2 + sum(c * c for c in ch)) / rated
        # parallel resonance with the supply seen at the bank bus: reactance of supply (+ feeder when the bank is at B2)
        xsys = xs + (xf if bank_at == 'B2' else 0)
        res['h_parallel'] = math.sqrt(1 / (qc_mvar / (KV8 ** 2 / xsys) + p))
    return res


def l08():
    out = dict(
        G03=dict(Ssc_MVA=50, Qc_MVAr=2, h_r=math.sqrt(50 / 2), f_Hz=50 * math.sqrt(25)),
        G04=dict(p=0.07, h_series=1 / math.sqrt(0.07), f_series_Hz=50 / math.sqrt(0.07), h_parallel=math.sqrt(1 / (2 / 50 + 0.07)), q_eff_MVAr=2 / (1 - 0.07)),
        filter=dict(h=4.7, p_pct=100 / 4.7 ** 2),
        designs={},
    )
    zb_rf = (RABBIT[0] * 4, RABBIT[1] * 4)
    for bus in ('B2',):
        for q in (0.0, 0.6, 0.9, 1.2):
            for p in (0.0, 0.0453, 0.07, 0.14):
                if q == 0 and p > 0: continue
                bank = (q, p) if q > 0 else None
                P = MILL + VIL + FAC
                Q = MILL * tan(0.70) + VIL * tan(0.95) + FAC * tan(VFD_PF)
                lf = two_bus(1.03, KV8, zb_rf[0], zb_rf[1], P, Q, bank)
                hm = harmonics(lf['V'], q, p, bus)
                out['designs'][f'{bus}-{int(q * 1000)}-{p}'] = dict(lf=lf, **hm)
    # the L07 bank at the mill bus with the drives off (the reason it worked in L07): no resonance because no 5th current
    return out


# ------------------------------------------------------------------------------------------------------------------ L09
R0, X0 = 0.3389, 0.364    # l33-dog ohm/km
L9, KV9, SSC9, XR9, BREAKER = 35.0, 33.0, 250.0, 10.0, 1.4
Q9 = 5.0 * tan(0.7)


def fault(k):
    xs = KV9 ** 2 / SSC9
    r = xs / XR9 + R0 * L9
    xl = X0 * L9
    x = xs + xl * (1 - k)
    kA = KV9 / S3 / math.hypot(r, x)
    kA0 = KV9 / S3 / math.hypot(r, xs + xl)
    xc = xl * k
    return dict(kA=kA, kA0=kA0, f_res_Hz=(50 * math.sqrt(xc / (xs + xl)) if k > 0 else 0.0), xc_ohm=xc, xl_ohm=xl, r_ohm=r)


def l09():
    out = dict(breaker_kA=BREAKER, ks={})
    for k in (0.0, 0.25, 0.40, 0.55, 0.70, 1.00):
        lf = two_bus(1.05, KV9, R0 * L9, X0 * L9 * (1 - k), 5.0, Q9)
        drop = ((R0 * L9) * 5.0 + (X0 * L9 * (1 - k)) * Q9) / KV9 ** 2 * 100
        out['ks'][str(int(k * 100))] = dict(far_V_pu=lf['V'], approx_drop_pct=drop, I_A=lf['I_A'], **fault(k))
    return out


if __name__ == '__main__':
    doc = dict(meta=dict(generator='tools/oracles/ch3_oracles.py', note='unrounded; inputs are the level constants and the line templates; independent of the engine'), L07=l07(), L08=l08(), L09=l09())
    with open(os.path.join(HERE, 'ch3_expected.json'), 'w') as f:
        json.dump(doc, f, indent=1, default=float)
    print('wrote ch3_expected.json')
    for k, v in doc['L08']['designs'].items(): print(k, 'THD %.3f' % v['thd_pct'], 'rms %.4f' % v.get('rms_ratio', float('nan')), 'V %.4f' % v['lf']['V'], 'pf %.4f' % v['lf']['pf'])
    for k, v in doc['L09']['ks'].items(): print(k, 'V %.4f' % v['far_V_pu'], 'kA %.4f' % v['kA'], 'kA0 %.4f' % v['kA0'], 'fres %.2f' % v['f_res_Hz'])
