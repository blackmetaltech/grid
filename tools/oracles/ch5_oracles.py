# Chapter 5 oracles (L14-L18), independent of the engine: exact-pi branches, complex Y-bus, scipy fsolve (see ch5_lib.py) and a closed-form P-V nose (L17).
# Writes ch5_expected.json, which src/level/ch5.test.ts compares the engine against. Run: python3 tools/oracles/ch5_oracles.py
import json, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from ch5_lib import *

out = {'meta': {'generator': 'tools/oracles/ch5_oracles.py', 'note': 'independent solver; every case is the engine\'s level at the stated block'}, 'L14': {}, 'L15': {}, 'L16': {}, 'L17': {}, 'L18': {}}
tau = lambda n: 1 - 0.0125 * n

# ---- L14: 132 kV source 1.05, 115 km Panther, 132/33 (50 MVA 12.5 % X/R 30 25 kW), three 33/11 (10 MVA 8.35 % X/R 15 10 kW), constant PQ towns at 20:00 (block 80)
def l14(tap_up, tap_down):
    net = Net(6)
    zs, yh = line_pi(0.1690, 0.415, 2.73, 115, 132); net.line(0, 1, zs, yh)
    z1, g1 = xfmr_pu(50, 12.5, 30, 25); net.xfmr(1, 2, z1, g1, tau(tap_up))
    z2, g2 = xfmr_pu(10, 8.35, 15, 10)
    peaks = [7.4, 6.6, 7.4]; tan = 0.75
    pq = {}
    for k, p in enumerate(peaks): net.xfmr(2, 3 + k, z2, g2, tau(tap_down)); pq[3 + k] = complex(p / 100, p * tan / 100)
    V = solve(net, 0, 1.05, pq)
    return [abs(v) for v in V]
for name, (a, b) in {'tap0': (0, 0), 'tap3_4': (3, 4)}.items():
    v = l14(a, b); out['L14'][name] = {'taps': [a, b], 'V132': v[1], 'V33': v[2], 'V11': v[3:6], 'kV11': [x * 11 for x in v[3:6]]}

# ---- L15: twin Moose 350 km, sending 1.04
r, x, b = 0.0347, 0.327, 3.43
g = cmath.sqrt(complex(r, x) * complex(0, b * 1e-6)); zc = cmath.sqrt(complex(r, x) / complex(0, b * 1e-6))
A = cmath.cosh(g * 350)
out['L15']['line'] = {'absA': abs(A), 'noLoadV2_at_1.0': 1 / abs(A), 'SIL_MW': 400 ** 2 / abs(zc), 'chargingMVAr_at_1pu': 400 ** 2 * b * 1e-6 * 350}
zs, yh = line_pi(r, x, b, 350, 400)
def l15(P, qsh):
    net = Net(2); net.line(0, 1, zs, yh); net.shunt(1, complex(0, qsh / 100))
    V = solve(net, 0, 1.04, {1: complex(P / 100, P / 100 * math.tan(math.acos(0.95)))})
    return abs(V[1])
out['L15']['cases'] = {'night_none': l15(40, 0), 'night_reactor80': l15(40, -80), 'peak_none': None, 'peak_cap150': l15(400, 150), 'peak_cap100': l15(400, 100)}
out['L15']['cases']['peak_none'] = l15(400, 0)

# ---- L16: six-bus ring 70 km, chord B1-B4 30 km (Zebra), loads 370 MW x (.4,.35,.25) pf .95 at 20:00; slack B1, optional plant at B4 100 MW PV 1.0
R, X, B = 0.0836, 0.417, 2.72
def l16(gB, extra_open=(), htls=False):
    net = Net(6); rates = []
    lines = [(i, (i + 1) % 6, 70) for i in range(6)] + [(0, 3, 30)]
    for k, (f, t, km) in enumerate(lines):
        if k in extra_open: continue
        zs_, yh_ = line_pi(R, X, B, km, 220); net.line(f, t, zs_, yh_); rates.append(4.2 if (htls and k == 6) else 2.1)
    tan = math.tan(math.acos(0.95)); pq = {2: complex(1.48, 1.48 * tan), 3: complex(1.295, 1.295 * tan), 4: complex(0.925, 0.925 * tan)}
    V = solve(net, 0, 1.0, pq, {3: (gB / 100, 1.0)} if gB else None)
    fl = net.flow(V)
    return [max(abs(a), abs(bb)) / rr for (a, bb), rr in zip(fl, rates)], [a.real * 100 for a, _ in fl]
ld0, p0 = l16(0); ld1, _ = l16(100)
dc_x = [X * km / (220 ** 2 / 100) for km in [70] * 6 + [30]]
out['L16'] = {'asBuiltLoading': ld0, 'commitLoading': ld1, 'chordXohm': X * 30, 'wayRoundXohm': X * 210, 'ratio': 7.0, 'asBuiltPfromMW': p0}
# DC approximation (B' theta = P) for the Codex lab: angles with the slack at bus 1
def dcflow():
    n = 6; Bm = np.zeros((n, n)); lines = [(i, (i + 1) % 6) for i in range(6)] + [(0, 3)]
    for (f, t), xx in zip(lines, dc_x): Bm[f, f] += 1 / xx; Bm[t, t] += 1 / xx; Bm[f, t] -= 1 / xx; Bm[t, f] -= 1 / xx
    P = np.zeros(n); P[2] = -1.48; P[3] = -1.295; P[4] = -0.925; P[0] = 3.7 - 0  # slack balances
    P[0] = -P[1:].sum()
    th = np.zeros(n); th[1:] = np.linalg.solve(Bm[1:, 1:], P[1:])
    return [ (th[f] - th[t]) / xx * 100 for (f, t), xx in zip(lines, dc_x)]
out['L16']['dcFlowMW'] = dcflow()

# ---- L17: nose margins (closed form, see nose.py logic)
def abcd(zs_, yh_): A_ = 1 + zs_ * yh_; return np.array([[A_, zs_], [2 * yh_ + zs_ * yh_ * yh_, A_]], complex)
def nose(M, tanphi, cap=0.0, stat=0.0, svc=0.0):
    A_, B_ = M[0, 0], M[0, 1]; best = 0.0
    for v in np.linspace(1.2, 0.15, 20000):
        qc = (cap + svc) / 100 * v * v + stat / 100 * v
        c0 = A_ * v * v + 1j * B_ * qc; c1 = B_ * (1 - 1j * tanphi)
        a = abs(c1) ** 2; bq = 2 * (c0 * np.conj(c1)).real; c = abs(c0) ** 2 - v * v
        d = bq * bq - 4 * a * c
        if d < 0: continue
        best = max(best, (-bq + d ** .5) / (2 * a))
    return best * 100
zf, yf = line_pi(0.0418, 0.302, 3.72, 40, 220); zcc, ycc = line_pi(0.0418, 0.302, 3.72, 150, 220)
M = abcd(zf, yf) @ abcd(zcc, ycc); t17 = math.tan(math.acos(0.92))
out['L17']['loadMW'] = 300
for nm, kw in {'none': {}, 'caps100': dict(cap=100), 'caps50+statcom100': dict(cap=50, stat=100), 'caps100+statcom100': dict(cap=100, stat=100), 'svc100': dict(svc=100), 'caps100+svc100': dict(cap=100, svc=100)}.items():
    nz = nose(M, t17, **kw); out['L17'][nm] = {'noseMW': nz, 'marginPct': (nz / 300 - 1) * 100}

# ---- L18: the task case (extra 100 MW + j50 Mvar at bus 2), PV bus Qmax 90 Mvar, textbook per-unit lines; GS/NR numbers of PS-14/15/16 come from expected.json
def l18(cap=0.0, v3=1.05, p3=200.0, qmax=90.0):
    net = Net(3); net.br = [(0, 1, 1 / complex(0.02, 0.04), 0j, 1.0), (0, 2, 1 / complex(0.01, 0.03), 0j, 1.0), (1, 2, 1 / complex(0.0125, 0.025), 0j, 1.0)]
    net.shunt(1, complex(0, cap / 100)); pq = {1: complex(3.566, 1.602)}
    V = solve(net, 0, 1.05, pq, {2: (p3 / 100, v3)}); Y = net.ybus(); S = V * np.conj(Y @ V); q3 = S[2].imag * 100
    if q3 > qmax:
        V = solve(net, 0, 1.05, {**pq, 2: complex(-p3 / 100, -qmax / 100)}); q3 = qmax
    fl = net.flow(V)
    return {'V2': abs(V[1]), 'Q3': q3, 'loadingMVA': [max(abs(a), abs(bb)) * 100 for a, bb in fl]}
out['L18'] = {'cap0': l18(), 'cap0_v3_1.08': l18(v3=1.08), 'cap50_p170': l18(cap=50, p3=170), 'cap100': l18(cap=100), 'cap100_v3_1.08': l18(cap=100, v3=1.08)}

json.dump(out, open(os.path.join(os.path.dirname(__file__), 'ch5_expected.json'), 'w'), indent=1, default=float)
print('wrote ch5_expected.json')
