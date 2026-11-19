#!/usr/bin/env python3
"""Chapter 8 oracles (L31 Long Feeder, L32 Count the Outages, L33 Fuse Saving, L34 Firm Capacity, L35 Sun on the Roofs).

Independent of the TypeScript engine (src/sim/dist): the load flow here is a Zbus fixed-point (not a backward-forward sweep), the
reliability numbers come from a hand-derived outage-time table, the thermal model is integrated by RK4 on the differential form of
IEC 60076-7 (not the exact step solution), the hosting capacity uses its own flow and bisection.  Scenario inputs are shared through
src/sim/dist/scenarios.json (data only).   Run: python3 tools/oracles/ch8_oracles.py   -> writes ch8_expected.json
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SC = json.load(open(os.path.join(HERE, '..', '..', 'src', 'sim', 'dist', 'scenarios.json')))
OUT = {}


# ------------------------------------------------------------------------------------------------ L31 feeder: Zbus fixed point
def zbus_flow(kv, secs, scale=1.0, vs=1.0, extra=None):
    """secs: chain src -> n1 -> ... ; loads kW/kvar (3 phase); returns per-unit |V| of the nodes, loss kW, per-section loss. Per phase, volts."""
    n = len(secs)
    vb = kv * 1000 / math.sqrt(3)
    z = np.array([complex(s['rOhm'], s['xOhm']) for s in secs])
    # nodal admittance of the chain with the source eliminated: Y_ij built from series branches, bus 0 = n1
    Y = np.zeros((n, n), complex)
    for i in range(n):
        y = 1 / z[i]
        Y[i, i] += y
        if i > 0:
            Y[i - 1, i - 1] += y; Y[i, i - 1] -= y; Y[i - 1, i] -= y
    Zm = np.linalg.inv(Y)
    ysrc = 1 / z[0]
    V0 = np.full(n, vs * vb, complex)             # open-circuit voltage = source everywhere
    S = np.array([complex(s['pKw'], s['qKvar']) * 1000 / 3 * scale for s in secs])
    if extra is not None: S = S - extra * 1000 / 3
    V = V0.copy()
    for _ in range(2000):
        I = np.conj(S / V)
        Vn = V0 - Zm @ I
        if np.max(abs(Vn - V)) < 1e-12 * vb: V = Vn; break
        V = Vn
    I = np.conj(S / V)
    # section currents: current in section i = sum of injected currents downstream
    J = np.cumsum(I[::-1])[::-1]
    loss = np.array([3 * abs(J[i]) ** 2 * secs[i]['rOhm'] / 1000 for i in range(n)])
    return abs(V) / vb, loss, J


def hand_drop(kv, secs):
    """Textbook approximate drop, cumulative dV = sum (R P + X Q) / V over sections with downstream flow (losses ignored)."""
    out, acc = [], 0.0
    for i, s in enumerate(secs):
        P = sum(t['pKw'] for t in secs[i:]) * 1000; Q = sum(t['qKvar'] for t in secs[i:]) * 1000
        acc += (s['rOhm'] * P + s['xOhm'] * Q) / (kv * 1000) / (kv * 1000)
        out.append(1 - acc)
    return out


def l31():
    f = SC['feeder5']; v, loss, J = zbus_flow(f['kV'], f['sections'])
    OUT['feeder5'] = {'vPu': list(v), 'sectionLossKw': list(loss), 'totalLossKw': float(loss.sum()), 'currentA': [float(abs(j)) for j in J],
                      'handVPu': hand_drop(f['kV'], f['sections'])}


# ------------------------------------------------------------------------------------------------ L32 reliability: hand table
def rel_case(table, secs, thr=5 / 60):
    """table[f][k] = outage hours at load point k for a fault on f (derived by hand, see comments in l32)."""
    NT = sum(s['customers'] for s in secs)
    saifi = saidi = ens = 0.0
    per = []
    for f, sf in enumerate(secs):
        lam = sf['lambdaPerKm'] * sf['lengthKm']
        ci = sum(secs[k]['customers'] for k in range(3) if table[f][k] > thr)
        cm = sum(secs[k]['customers'] * table[f][k] * 60 for k in range(3) if table[f][k] > thr)
        e = sum(secs[k]['avgLoadKw'] * table[f][k] / 1000 for k in range(3))
        per.append({'saifi': lam * ci / NT, 'saidiMin': lam * cm / NT, 'ensMWh': lam * e})
        saifi += lam * ci / NT; saidi += lam * cm / NT; ens += lam * e
    return {'saifi': saifi, 'saidi': saidi, 'caidi': saidi / saifi, 'ensMWh': ens, 'sections': per, 'table': table}


def l32():
    secs = SC['reliability']['sections']; t = SC['reliability']['times']
    r = secs[0]['repairH']; man = t['manualH']; fuse = t['fuseH']; tie = secs[2]['tie']['closeH']
    # Feeder S1 (breaker at head) -> S2 (manual sectionaliser at its start) -> S3 (fuse at its start, normally-open tie at its end).
    # Fault on S1: breaker trips; S1 stays out r; S2 and S3 are cut off downstream of the zone: open S2's sectionaliser (1 h) and close the tie at
    #   S3's end (0.25 h): 1.25 h. (S3's fuse is intact; the tie capacity 2000 kW covers S2 + S3 = 1500 kW.)
    # Fault on S2: breaker trips; open the sectionaliser, close the breaker: S1 back after 1 h; S2 out r; S3 via the tie after the fuse switch + tie:
    #   fuse switching 1 h + 0.25 h = 1.25 h.
    # Fault on S3: its fuse clears it: only S3 is out, r hours (fuse replaced, fault repaired).
    table = [[r, man + tie, fuse + tie], [man, r, fuse + tie], [0, 0, r]]
    OUT['reliability'] = {'withTie': rel_case(table, secs)}
    # same feeder, tie removed: downstream loads stay out for r
    table2 = [[r, r, r], [man, r, r], [0, 0, r]]
    OUT['reliability']['noTie'] = rel_case(table2, secs)
    # remote sectionaliser at S2 (3 min): S1 outage after a fault on S2 is momentary (< 5 min) and not counted in SAIDI
    t3 = [[r, t['remoteH'] + tie, fuse + tie], [t['remoteH'], r, fuse + tie], [0, 0, r]]
    OUT['reliability']['remoteS2'] = rel_case(t3, secs)


# ------------------------------------------------------------------------------------------------ L33 coordination
IEEE = {'MI': (0.0104, 0.0226, 0.02), 'VI': (3.922, 0.0982, 2.0), 'EI': (5.64, 0.0243, 2.0)}
KSHAPE = [(2.2, 300), (3, 60), (4, 14), (6, 2.6), (10, 0.5), (20, 0.15), (50, 0.05), (100, 0.025)]


def t_ieee(curve, td, i, ip, tmin):
    A, B, p = IEEE[curve]; m = i / ip
    return max(tmin, td * (A / (m ** p - 1) + B)) if m > 1 else math.inf


def loglog(pts, i):
    xs = np.log([a for a, _ in pts]); ys = np.log([b for _, b in pts]); x = math.log(i)
    if x < xs[0]: return math.inf
    if x >= xs[-1]: return pts[-1][1]
    return math.exp(float(np.interp(x, xs, ys)))


def l33():
    c = SC['coordination']; fk = c['fuseK']
    mm = [(m * fk, t) for m, t in KSHAPE]; tc = [(a, t * 1.2 + 0.01) for a, t in mm]
    rows = []
    for i in c['currentsA']:
        tf = t_ieee('VI', c['fastTd'], i, c['pickupA'], 0.03); ts = t_ieee('VI', c['slowTd'], i, c['pickupA'], 0.06)
        rows.append({'currentA': i, 'tFast': tf, 'tSlow': ts, 'tMM': loglog(mm, i), 'tTC': loglog(tc, i),
                     'marginFast': loglog(mm, i) - tf, 'marginSlow': ts - loglog(tc, i)})
    OUT['coordination'] = {'rows': rows}


# ------------------------------------------------------------------------------------------------ L34 IEC 60076-7 (RK4, differential form)
P = dict(x=0.8, y=1.3, k11=0.5, k21=2.0, k22=2.0, to=210.0, tw=10.0, dTor=55.0, Hgr=23.0, R=5.0)


def tx_rhs(s, K):
    do, h1, h2 = s
    return np.array([
        (P['dTor'] * ((1 + P['R'] * K * K) / (1 + P['R'])) ** P['x'] - do) / (P['k11'] * P['to']),
        (P['k21'] * P['Hgr'] * K ** P['y'] - h1) / (P['k22'] * P['tw']),
        ((P['k21'] - 1) * P['Hgr'] * K ** P['y'] - h2) / (P['to'] / P['k22'])])


def tx_steady(K):
    return np.array([P['dTor'] * ((1 + P['R'] * K * K) / (1 + P['R'])) ** P['x'], P['k21'] * P['Hgr'] * K ** P['y'], (P['k21'] - 1) * P['Hgr'] * K ** P['y']])


def l34():
    th = SC['thermal']; amb = th['ambientC']; dt = 0.25  # minutes
    # step response
    st = th['step']; s = tx_steady(st['k0']); t = 0.0; step = {}
    for m in st['minutes']:
        while t < m - 1e-9:
            k1 = tx_rhs(s, st['k']); k2 = tx_rhs(s + dt / 2 * k1, st['k']); k3 = tx_rhs(s + dt / 2 * k2, st['k']); k4 = tx_rhs(s + dt * k3, st['k'])
            s = s + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4); t += dt
        step[str(m)] = {'hot': amb + s[0] + s[1] - s[2], 'top': amb + s[0]}
    OUT['thermal'] = {'step': step}
    # 24 h cycle, K per 15 min; ageing integrated on the 0.25 min grid with the trapezoid rule
    s = tx_steady(th['cycleK'][0]); loss = 0.0; peak = -1e9; hot_end = []
    prevV = 2 ** ((amb + s[0] + s[1] - s[2] - 98) / 6)
    for K in th['cycleK']:
        for _ in range(int(15 / dt)):
            k1 = tx_rhs(s, K); k2 = tx_rhs(s + dt / 2 * k1, K); k3 = tx_rhs(s + dt / 2 * k2, K); k4 = tx_rhs(s + dt * k3, K)
            s = s + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
            h = amb + s[0] + s[1] - s[2]; V = 2 ** ((h - 98) / 6)
            loss += 0.5 * (prevV + V) * dt / 60; prevV = V; peak = max(peak, h)
        hot_end.append(h)
    OUT['thermal']['cycle'] = {'peakHotC': peak, 'lossOfLifeH': loss, 'hotEnd': [hot_end[i] for i in (0, 27, 28, 50, 67, 68, 83, 84, 95)]}


# ------------------------------------------------------------------------------------------------ L35 hosting
def vv_curve(v, pts):
    if v <= pts[0][0]: return pts[0][1]
    for (a, qa), (b, qb) in zip(pts, pts[1:]):
        if v <= b: return qa + (qb - qa) * (v - a) / (b - a)
    return pts[-1][1]


def host_flow(total_kw, use_vv):
    h = SC['hosting']; f = SC['feeder5']; names = [s['id'] for s in f['sections']]
    n = len(names); sh = sum(s['share'] for s in h['sites'])
    pv = np.zeros(n); kva = np.zeros(n)
    for s in h['sites']:
        i = names.index(s['node']); pv[i] = total_kw * s['share'] / sh; kva[i] = pv[i] * 1.1
    q = np.zeros(n)
    for _ in range(300):
        v, loss, J = zbus_flow(f['kV'], f['sections'], h['loadScale'], 1.0, extra=pv + 1j * q)
        if not use_vv: break
        lim = np.sqrt(np.maximum(0, kva ** 2 - pv ** 2))
        want = np.clip(np.array([vv_curve(v[i], h['voltVar']) for i in range(n)]) * kva * (pv > 0), -lim, lim)
        qn = 0.5 * q + 0.5 * want
        if np.max(abs(qn - q)) < 1e-9: q = qn; break
        q = qn
    return v, J, q


def host_bisect(use_vv, upper=50000.0):
    vmax = SC['hosting']['vMaxPu']
    lo, hi = 0.0, upper
    for _ in range(80):
        mid = (lo + hi) / 2
        if host_flow(mid, use_vv)[0].max() <= vmax: lo = mid
        else: hi = mid
    return lo


def l35():
    out = {}
    for name, vv in (('unity', False), ('voltvar', True)):
        hc = host_bisect(vv); v, J, q = host_flow(hc, vv)
        out[name] = {'hostingKw': hc, 'maxVPu': float(v.max()), 'vPu': list(v), 'qKvar': list(q)}
    v0 = host_flow(0.0, False)[0]; out['noPvVPu'] = list(v0)
    OUT['hosting'] = out


if __name__ == '__main__':
    l31(); l32(); l33(); l34(); l35()
    path = os.path.join(HERE, 'ch8_expected.json')
    json.dump(OUT, open(path, 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o), allow_nan=False)
    print('wrote', path)
    print('feeder5', OUT['feeder5']['vPu'], OUT['feeder5']['totalLossKw'], 'hand', OUT['feeder5']['handVPu'])
    print('rel', {k: (round(v['saifi'], 4), round(v['saidi'], 2), round(v['ensMWh'], 3)) for k, v in OUT['reliability'].items()})
    print('coord', [(r['currentA'], round(r['marginFast'], 3), round(r['marginSlow'], 3)) for r in OUT['coordination']['rows']])
    print('thermal', OUT['thermal']['step'], OUT['thermal']['cycle']['peakHotC'], OUT['thermal']['cycle']['lossOfLifeH'])
    print('hosting', {k: (round(v['hostingKw'], 1), round(v['maxVPu'], 4)) for k, v in OUT['hosting'].items() if isinstance(v, dict)})
