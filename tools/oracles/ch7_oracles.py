#!/usr/bin/env python3
"""Chapter 7 oracles (L23 Fault Level, L24 Coordination, L25 Clear It in Time, L26 Merit Order, L27 Exam Bridge).

Independent of the TypeScript engine: numpy Zbus, its own IDMT, its own RK4 and its own lambda-iteration. The scenario constants are shared
with the engine through src/sim/ch7/scenarios.json (data, not algorithms). Writes tools/oracles/ch7_expected.json; the tests in
src/level/ch7.test.ts compare the engine against it.  Run: python3 tools/oracles/ch7_oracles.py
"""
import itertools, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SC = json.load(open(os.path.join(HERE, '..', '..', 'src', 'sim', 'ch7', 'scenarios.json')))
OUT = {}


# ---------------------------------------------------------------------------------------------------------------- L23 / L27 board
def board(cfg, uk_pct, coupler_x, extra_gen=0, extra_xfmr=0):
    """Per-unit (100 MVA) board: H = 132 kV grid bus, A / B = 33 kV sections. Returns buses, branches (a, b, x), gens (bus, x1, x0)."""
    S = cfg['baseMVA']
    xt = uk_pct / 100.0 * S / cfg['xfmr']['mva']
    xg = cfg['gen']['xdd'] * S / cfg['gen']['mva']
    br = [('H', 'A', xt), ('H', 'B', xt)]
    if extra_xfmr: br.append(('H', 'A', xt))
    if coupler_x is not None: br.append(('A', 'B', coupler_x))
    gens = [('H', S / cfg['gridSscMVA'], 0.5 * S / cfg['gridSscMVA'])]
    gens += [('A', xg, 0.5 * xg), ('B', xg, 0.5 * xg)]
    if extra_gen: gens.append(('B', xg, 0.5 * xg))
    return ['H', 'A', 'B'], br, gens


def zmat(buses, branches, gens, seq):
    idx = {b: i for i, b in enumerate(buses)}
    Y = np.zeros((len(buses), len(buses)), complex)
    for a, b, x in branches:
        if seq == 0 and a == 'H':   # zero sequence: transformers are YNd (delta on the 33 kV side): no path through them
            continue
        if seq == 0: x = 3 * x   # lines (the bus-section tie): Z0 = 3 Z1
        y = 1 / (1j * x); i, j = idx[a], idx[b]
        Y[i, i] += y; Y[j, j] += y; Y[i, j] -= y; Y[j, i] -= y
    for bus, x1, x0 in gens:
        x = x1 if seq else x0
        Y[idx[bus], idx[bus]] += 1 / (1j * x)
    return Y, idx


def fault_kA(cfg, buses, branches, gens, at, kind):
    kv = cfg['kv']; S = cfg['baseMVA']; ib = S / (math.sqrt(3) * kv)
    Y1, idx = zmat(buses, branches, gens, 1)
    z1 = np.linalg.inv(Y1)[idx[at], idx[at]]
    if kind == '3ph':
        return abs(1 / z1) * ib
    # SLG: Z2 = Z1; Z0 from the zero-sequence net (only generators with a path to ground at the 33 kV sections; transformers block H)
    Y0, _ = zmat(buses, branches, [g for g in gens if g[0] != 'H'], 0)
    for i in range(3):
        if abs(Y0[i, i]) == 0: Y0[i, i] = 1e-12
    z0 = np.linalg.inv(Y0)[idx[at], idx[at]]
    return abs(3 / (z1 + z1 + z0)) * ib


def quad_v(v1, x, p, q):
    """|V2| of a lossless series reactance x from v1 to a constant-PQ load (pu): V^4 + (2 q x - v1^2) V^2 + x^2 (p^2 + q^2) = 0, larger root."""
    b = 2 * q * x - v1 * v1; c = x * x * (p * p + q * q)
    d = b * b - 4 * c
    if d < 0: return 0.0
    return math.sqrt((-b + math.sqrt(d)) / 2)


def l23_design(rating_i, uk_i, coupler, reactor_i):
    c = SC['l23']; S = c['baseMVA']
    uk = c['xfmr']['ukPct'][uk_i]
    cx_ = None if coupler == 'open' else (c['couplerTieX'] if reactor_i == 0 else c['reactorX'][reactor_i])
    buses, br, gens = board(c, uk, cx_)
    I = fault_kA(c, buses, br, gens, 'A', '3ph')
    rating = c['breakers']['ratingsKA'][rating_i]
    cost = c['breakers']['count'] * c['breakers']['price'][rating_i] + c['xfmr']['extraPrice'][uk_i] + c['reactorPrice'][reactor_i]
    # N-1: one transformer out, the grid and the whole estate on the other; generators off. Coupler open: the section behind it is dark (not N-1 secure).
    xt = uk / 100 * S / c['xfmr']['mva']; xg = S / c['gridSscMVA']
    sa = c['estate']['mva'] / S; pf = c['estate']['pf']
    p = sa * pf; q = sa * math.sqrt(1 - pf * pf)
    if coupler == 'open':
        n1 = {'secure': False, 'vPu': quad_v(1.0, xg + xt, p / 2, q / 2)}
    else:
        va = quad_v(1.0, xg + xt, p, q)
        vb = quad_v(va, cx_, p / 2, q / 2)
        # the section A load is fed straight from V_A, section B's through the coupler
        n1 = {'secure': True, 'vPu': min(quad_v(va, 0.0 + 1e-9, p / 2, q / 2), vb)}
    return {'faultKA': I, 'rating': rating, 'ok': I <= rating, 'cost': cost, 'n1Secure': n1['secure'], 'n1VPu': n1['vPu']}


def l23():
    c = SC['l23']
    out = {'designs': {}}
    for r, u, cp, re in itertools.product(range(3), range(2), ['closed', 'open'], range(3)):
        out['designs'][f'{r}/{u}/{cp}/{re}'] = l23_design(r, u, cp, re)
    # duty per breaker for the default design (coupler closed): contribution through each breaker for a fault at A
    buses, br, gens = board(c, c['xfmr']['ukPct'][0], c['couplerTieX'])
    out['preGensKA'] = fault_kA(c, buses, br, [gens[0]], 'A', '3ph')
    OUT['l23'] = out


# ---------------------------------------------------------------------------------------------------------------- L24
IDMT = {'SI': (0.14, 0.02), 'VI': (13.5, 1.0), 'EI': (80.0, 2.0)}


def idmt(curve, tms, i, is_):
    if i <= 1.1 * is_: return math.inf
    k, a = IDMT[curve]
    return tms * k / ((i / is_) ** a - 1)


def l24_fault_amps(c):
    S = c['baseMVA']; kv = c['kv']; zb = kv * kv / S; ib = S / (math.sqrt(3) * kv) * 1000
    zs = 1j * S / c['sscMVA']
    zk = complex(*c['zPerKmOhm'])
    starts = [0.0]
    for s in c['sections']: starts.append(starts[-1] + s['km'])
    amps = []
    for f in c['faults']:
        km = starts[f['section'] - 1] + f['at'] * c['sections'][f['section'] - 1]['km']
        z = zs + zk * km / zb
        amps.append(ib / abs(z))
    return amps


def l24_eval(curve, pct, tms):
    c = SC['l24']
    amps = l24_fault_amps(c)
    pk = c['pickupPct'][pct]
    Is = [ct * pk / 100.0 for ct in c['ctA']]
    nuisance = [Is[k] < c['pickupLoadFactor'] * c['loadA'][k] for k in range(4)]
    times = []; margins = []; burnt = False; mis = False; blind = False
    for f, i in zip(c['faults'], amps):
        k = f['section'] - 1
        tk = idmt(curve, tms[k], i, Is[k])
        if not math.isfinite(tk): blind = True
        times.append(tk)
        for j in range(k):
            tj = idmt(curve, tms[j], i, Is[j])
            m = tj - tk - c['ctiS']
            margins.append(m)
            if m < -1e-12: mis = True
        # conductor on the faulted section carries I for tk
        mm2 = c['sections'][k]['mm2']
        if math.isfinite(tk) and i * i * tk > (c['kAlu'] * mm2) ** 2: burnt = True
    total = sum(times) if not blind else math.inf
    kind = 'nuisance' if any(nuisance) else 'blind' if blind else 'burnt' if burnt else 'miscoordination' if mis else None
    return {'amps': amps, 'times': times, 'total': total, 'minMargin': min(margins) if margins else math.inf, 'kind': kind, 'ok': kind is None}


def l24():
    c = SC['l24']
    tms_opts = [[0.05, 0.15, 0.25, 0.35, 0.5], [0.05, 0.15, 0.25, 0.35, 0.5], [0.05, 0.15, 0.25, 0.35, 0.5], [0.05, 0.15, 0.25, 0.35, 0.5, 0.75]]
    # site order in the level: R1 (upstream, largest) .. R4; the last option list belongs to R1
    tms_opts = [[0.05, 0.15, 0.25, 0.35, 0.5, 0.75], [0.05, 0.15, 0.25, 0.35, 0.5], [0.05, 0.15, 0.25, 0.35, 0.5], [0.05, 0.15, 0.25, 0.35, 0.5]]
    out = {'amps': l24_fault_amps(c), 'cases': {}, 'population': {}}
    cases = {
        'naive': ('SI', 'right', [0.15] * 4),
        'lesson': ('SI', 'right', [0.35, 0.25, 0.15, 0.05]),
        'low': ('SI', 'low', [0.35, 0.25, 0.15, 0.05]),
        'slowR1': ('SI', 'right', [0.75, 0.25, 0.15, 0.05]),
    }
    for k, (cv, pc, t) in cases.items():
        r = l24_eval(cv, pc, t); out['cases'][k] = {**r, 'total': r['total'] if math.isfinite(r['total']) else None, 'minMargin': r['minMargin'] if math.isfinite(r['minMargin']) else None}
    # whole site list
    passing = []; count = 0
    for cv in ('SI', 'VI', 'EI'):
        for pc in ('low', 'right', 'high'):
            for t in itertools.product(*tms_opts):
                count += 1
                r = l24_eval(cv, pc, list(t))
                if r['ok']: passing.append((r['total'], r['minMargin'], cv, pc, t))
    passing.sort()
    out['population'] = {'designs': count, 'passing': len(passing), 'best': [[p[0], p[1], p[2], p[3], list(p[4])] for p in passing[:5]],
                         'totals': [p[0] for p in passing], 'margins': [p[1] for p in passing]}
    OUT['l24'] = out


# ---------------------------------------------------------------------------------------------------------------- L25
def smib(c, tclear, reclose, tend=None, dt=1e-3):
    H, f0, Pm, Ppre, Pf, Ppost = c['H'], c['f0'], c['Pm'], c['PmaxPre'], c['PmaxDuring'], c['PmaxPost']
    ws = 2 * math.pi * f0
    trec = tclear + c['recloseDeadS'] if reclose else None
    d = math.asin(Pm / Ppre); w = 1.0; t = 0.0
    tend = tend or c['tEndS']

    def stage(tt):
        if tt < tclear - 1e-12: return Pf
        if trec is not None and tt >= trec - 1e-12: return Ppre
        return Ppost

    def f(dd, ww, P): return ws * (ww - 1), (Pm - P * math.sin(dd)) / (2 * H)
    bps = [tclear] + ([trec] if trec else [])
    maxd = d; peak_t = 0.0
    while t < tend - 1e-12:
        h = dt
        for bp in bps:
            if t < bp - 1e-12 and t + h > bp - 1e-12: h = bp - t
        P = stage(t + 1e-12)
        a = f(d, w, P); b = f(d + h / 2 * a[0], w + h / 2 * a[1], P); cc = f(d + h / 2 * b[0], w + h / 2 * b[1], P); e = f(d + h * cc[0], w + h * cc[1], P)
        d += h / 6 * (a[0] + 2 * b[0] + 2 * cc[0] + e[0]); w += h / 6 * (a[1] + 2 * b[1] + 2 * cc[1] + e[1]); t += h
        if d > maxd: maxd = d; peak_t = t
        P2 = stage(t + 1e-12)
        du = math.pi - math.asin(Pm / P2) if P2 > Pm else math.pi
        if t >= tclear - 1e-12 and d > du and w > 1: return {'stable': False, 'tLoss': t, 'maxDeg': math.degrees(maxd)}
    return {'stable': True, 'tLoss': None, 'maxDeg': math.degrees(maxd)}


def l25():
    c = SC['l25']
    lo, hi = 0.0, 2.0
    for _ in range(60):
        m = (lo + hi) / 2
        if smib(c, m, False, tend=max(c['tEndS'], m + 3))['stable']: lo = m
        else: hi = m
    tcr = lo
    d0 = math.asin(c['Pm'] / c['PmaxPre']); du = math.pi - math.asin(c['Pm'] / c['PmaxPost'])
    cosc = (c['Pm'] * (du - d0) + c['PmaxPost'] * math.cos(du) - c['PmaxDuring'] * math.cos(d0)) / (c['PmaxPost'] - c['PmaxDuring'])
    out = {'tCrS': tcr, 'deltaCrDeg': math.degrees(math.acos(cosc)), 'delta0Deg': math.degrees(d0), 'deltaUDeg': math.degrees(du), 'designs': {}}
    cycles_s = {n: n / c['f0'] for n in c['breakerCycles']}
    for rid, r in c['relays'].items():
        if r['kind'] == 'idmt': tr = idmt(r['curve'], r['tms'], c['faultKA'] * 1000, c['ctA'])
        else: tr = r['delayS']
        for cy in c['breakerCycles']:
            for rc in (False, True):
                tcl = tr + cycles_s[cy]
                s = smib(c, tcl, rc)
                cost = r['price'] + c['breakerPrice'][str(cy)] + (c['reclosePrice'] if rc else 0)
                out['designs'][f'{rid}/{cy}/{int(rc)}'] = {'tClearS': tcl, 'stable': s['stable'], 'marginMs': (tcr - tcl) * 1000, 'cost': cost, 'maxDeg': s['maxDeg']}
    OUT['l25'] = out


# ---------------------------------------------------------------------------------------------------------------- L26
def ed_exact(units, D):
    """units: list of (name, a, b, c, lo, hi). Returns (lambda, {name: P}, shortfall, surplus)."""
    lo_t = sum(u[4] for u in units); hi_t = sum(u[5] for u in units)
    if D > hi_t + 1e-9: return None, {u[0]: u[5] for u in units}, D - hi_t, 0.0
    if D < lo_t - 1e-9: return None, {u[0]: u[4] for u in units}, 0.0, lo_t - D
    def P(lam): return {u[0]: min(u[5], max(u[4], (lam - u[2]) / (2 * u[3]))) for u in units}
    a, b = -1000.0, 1000.0
    for _ in range(200):
        m = (a + b) / 2
        if sum(P(m).values()) < D: a = m
        else: b = m
    lam = (a + b) / 2
    return lam, P(lam), 0.0, 0.0


def bounds(p, prev):
    """The engine's unit bounds: [pMin, pMax] cut to prev +- ramp x 15 min; the nearest limit when the ramp window misses it."""
    lo, hi = p['pMin'], p['pMax']
    d = p['rampMWperMin'] * 15
    wl, wh = prev - d, prev + d
    nlo, nhi = max(lo, wl), min(hi, wh)
    if nlo <= nhi: return nlo, nhi
    pt = lo if wh < lo else hi
    return pt, pt


class L26:
    def __init__(self):
        c = SC['l26']; self.c = c; nb = c['blocks']
        self.D = [self.interp(c['demandHourlyMW'], b) for b in range(nb)]
        self.sol = [self.interp(c['solarHourlyMW'], b) for b in range(nb)]
        self.hydro, self.nu = self.water_value()

    @staticmethod
    def interp(arr, b):
        h = b / 4.0; i = int(h) % 24; j = (i + 1) % 24; fr = h - int(h)
        return arr[i] * (1 - fr) + arr[j] * fr

    def water_value(self):
        c = self.c; keys = list(c['plants']); pmax = c['hydro']['pMaxMW']; E = c['hydro']['energyMWh']
        def lam_at(b, net):
            units = [(k, c['plants'][k]['a'], c['plants'][k]['b'], c['plants'][k]['c'], 0.0, c['plants'][k]['pMax']) for k in keys]
            lam, P, sf, su = ed_exact(units, max(net, 0.0))
            return lam if lam is not None else 500.0
        def disp(nu):
            out = []
            for b in range(c['blocks']):
                d = self.D[b] - self.sol[b]
                if lam_at(b, d - pmax) >= nu: out.append(pmax); continue
                if lam_at(b, d) <= nu: out.append(0.0); continue
                lo, hi = 0.0, pmax
                for _ in range(50):
                    m = (lo + hi) / 2
                    if lam_at(b, d - m) > nu: lo = m
                    else: hi = m
                out.append((lo + hi) / 2)
            return out
        a, bq = 0.0, 200.0
        for _ in range(50):
            nu = (a + bq) / 2
            if sum(disp(nu)) * c['dtH'] > E: a = nu
            else: bq = nu
        nu = (a + bq) / 2
        return disp(nu), nu

    def run(self, mode, windows):
        c = self.c; P_ = c['plants']; DT = c['dtH']
        F = c['corridorMW']; FOP = c['corridorOpFrac'] * F
        prev = {k: (P_[k]['pMin'] if windows[k][0] == 0 and windows[k][1] > 0 else 0.0) for k in P_}
        cost = 0.0; ens = 0.0; surplus = 0.0; trip = None; maxflow = 0.0; lam20 = None; flows = []
        for b in range(c['blocks']):
            h = b / 4.0
            units = []; avail = []
            for k, p in P_.items():
                s, e = windows[k]
                on = s < e and s <= h < e
                warm = on and s > 0 and h < s + p['startH']
                if on and abs(h - s) < 1e-9 and s > 0: cost += p['startCost']
                if on and not warm:
                    lo, hi = bounds(p, prev[k])
                    units.append((k, p['a'], p['b'], p['c'], lo, hi)); avail.append(k)
            for k in P_:
                if k not in avail: prev[k] = 0.0
            D = self.D[b]; DG = c['gDemandMW']; DS = D - DG
            hyd = self.hydro[b]; sol = self.sol[b]
            need = D - hyd - sol
            lamG = lamS = None; sf = su = 0.0; Pd = {}; flow = 0.0
            def curtail(need, sol):
                lam, Pd, sf, su = ed_exact(units, need)
                if lam is None and su > 0 and sol > 0:
                    cs = min(sol, su); sol -= cs; need = D - hyd - sol
                    lam, Pd, sf, su = ed_exact(units, need)
                return lam, Pd, sf, su, sol
            if mode == 'merit':
                # cheapest first by full-load average cost; everyone at the minimum, then fill in order
                Pd = {u[0]: u[4] for u in units}; rem = need - sum(Pd.values())
                order = sorted(units, key=lambda u: (u[1] / u[5] + u[2] + u[3] * u[5]) if u[5] > 0 else 1e9)
                if rem < 0 and sol > 0:
                    cs = min(sol, -rem); sol -= cs; need += cs; rem = need - sum(Pd.values())
                if rem < 0: su = -rem
                for u in order:
                    if rem <= 0: break
                    add = min(u[5] - Pd[u[0]], rem); Pd[u[0]] += add; rem -= add
                sf = max(rem, 0.0)
                lamG = lamS = max([u[2] + 2 * u[3] * Pd[u[0]] for u in units] or [0.0])
                flow = sum(Pd[k] for k in Pd if P_[k]['area'] == 'G') + hyd + sol - DG
            else:
                lam, Pd, sf, su, sol = curtail(need, sol)
                flow = sum(Pd[k] for k in Pd if P_[k]['area'] == 'G') + hyd + sol - DG
                lamG = lamS = lam
                if mode == 'corridor' and lam is not None and abs(flow) > FOP + 1e-6:
                    fl = FOP if flow > 0 else -FOP
                    uG = [u for u in units if P_[u[0]]['area'] == 'G']; uS = [u for u in units if P_[u[0]]['area'] == 'S']
                    lg, PG, sfg, sug = ed_exact(uG, DG + fl - hyd - sol); ls, PS, sfs, sus = ed_exact(uS, DS - fl)
                    Pd = {**PG, **PS}; sf = sfg + sfs; su = sug + sus; lamG, lamS = lg, ls; flow = fl
            if mode != 'corridor' and abs(flow) > F + 1e-6 and trip is None: trip = (b, flow)
            ens += sf * DT; surplus += su * DT
            for k in avail: prev[k] = Pd.get(k, 0.0)
            for u in units: cost += (u[1] + u[2] * Pd[u[0]] + u[3] * Pd[u[0]] ** 2) * DT
            flows.append(abs(flow)); maxflow = max(maxflow, abs(flow))
            if b == 80: lam20 = (lamG, lamS, flow)
        ok = trip is None and ens < 0.05 and surplus < 0.05
        return {'cost': cost, 'ens': ens, 'surplus': surplus, 'trip': list(trip) if trip else None, 'maxFlow': maxflow, 'lam20': list(lam20) if lam20 else None, 'ok': ok}


def l26():
    m = L26(); c = SC['l26']
    out = {'nu': m.nu, 'hydroEnergyMWh': sum(m.hydro) * c['dtH'], 'hydroHourly': [round(x, 6) for x in m.hydro[::4]], 'designs': {}}
    names = list(c['windows'])
    for mode in ('merit', 'lambda', 'corridor'):
        for combo in itertools.product(*[range(len(c['windows'][k])) for k in names]):
            w = {k: c['windows'][k][i] for k, i in zip(names, combo)}
            r = m.run(mode, w)
            out['designs'][f"{mode}/{'.'.join(map(str, combo))}"] = r
    best = min(v['cost'] for v in out['designs'].values() if v['ok'])
    out['optCost'] = best
    OUT['l26'] = out


# ---------------------------------------------------------------------------------------------------------------- L27
def l27():
    c = SC['l27']; t = c['textbook']
    # PS-17: gen 0.15, T 0.10 (delta-Yg), line 40 ohm @138 kV; 100 MVA base
    zb = t['ps17']['kv'] ** 2 / t['ps17']['baseMVA']; xl = t['ps17']['lineXOhm'] / zb
    z1 = t['ps17']['genX'] + t['ps17']['xfmrX'] + xl
    ib = t['ps17']['baseMVA'] / (math.sqrt(3) * t['ps17']['kv'])
    ps17 = {'z1': z1, 'iPu': 1 / z1, 'kA': ib / z1, 'mva': 100 / z1}
    # PS-18: SLG at the line end; gen X2 0.17, X0 0.05 (blocked by the delta); line X0 = 3 x X1 (120 ohm)
    z2 = t['ps18']['genX2'] + t['ps17']['xfmrX'] + xl
    z0 = t['ps17']['xfmrX'] + t['ps18']['lineX0Ohm'] / zb
    ipu = 3 / (z1 + z2 + z0)
    ps18 = {'z2': z2, 'z0': z0, 'iPu': ipu, 'kA': ipu * ib}
    # PS-20 / 21 / 22
    u = c['ed']['units']
    def lam_ed(D, limits):
        us = [('u%d' % i, x['a'], x['b'], x['c'], *( (x['pMin'], x['pMax']) if limits else (0.0, 1e6))) for i, x in enumerate(u)]
        lam, P, sf, su = ed_exact(us, D)
        cost = sum(x['a'] + x['b'] * P['u%d' % i] + x['c'] * P['u%d' % i] ** 2 for i, x in enumerate(u))
        return {'lambda': lam, 'p': [P['u%d' % i] for i in range(3)], 'cost': cost}
    ps20 = lam_ed(c['ed']['demandNoLimitsMW'], False)
    ps21 = lam_ed(c['ed']['demandMW'], True)
    # PS-22: coordination equations dC_i/dP_i = lambda (1 - dPL/dP_i), PL = sum P_i B_ij P_j (solved by Newton on [P1, P2, lambda])
    t22 = t['ps22']; B = np.array(t22['B']); us = t22['units']
    p = np.array([150.0, 150.0]); lam = 10.0
    for _ in range(200):
        PL = p @ B @ p; dPL = 2 * B @ p
        F = np.array([us[i]['b'] + 2 * us[i]['c'] * p[i] - lam * (1 - dPL[i]) for i in range(2)] + [p.sum() - PL - t22['demandMW']])
        J = np.zeros((3, 3))
        for i in range(2):
            J[i, i] = 2 * us[i]['c'] + lam * 2 * B[i, i]
            J[i, 1 - i] = lam * 2 * B[i, 1 - i]
            J[i, 2] = -(1 - dPL[i])
        J[2, 0] = 1 - 2 * (B[0, 0] * p[0] + B[0, 1] * p[1]); J[2, 1] = 1 - 2 * (B[1, 0] * p[0] + B[1, 1] * p[1])
        step = np.linalg.solve(J, -F); p = p + step[:2]; lam = lam + step[2]
        if np.abs(step).max() < 1e-13: break
    ps22 = {'p': p.tolist(), 'lambda': lam, 'loss': float(p @ B @ p)}
    OUT['l27'] = {'ps17': ps17, 'ps18': ps18, 'ps20': ps20, 'ps21': ps21, 'ps22': ps22}
    # PS-24 (60 Hz equal-area): closed form + RK4
    p24 = t['ps24']
    d0 = math.asin(p24['Pm'] / p24['Pmax']); du = math.pi - d0
    cosc = (p24['Pm'] * (du - d0) + p24['Pmax'] * math.cos(du)) / p24['Pmax']
    dcr = math.acos(cosc); ws = 2 * math.pi * p24['f0']
    OUT['l27']['ps24'] = {'delta0Deg': math.degrees(d0), 'deltaCrDeg': math.degrees(dcr), 'tCrS': math.sqrt(4 * p24['H'] * (dcr - d0) / (ws * p24['Pm']))}
    # the grown board of the task: one more captive generator on B and one more transformer on A, coupler closed (tie), uk 10 %
    cb = SC['l23']
    buses, br, gens = board(cb, cb['xfmr']['ukPct'][0], cb['couplerTieX'], extra_gen=1, extra_xfmr=1)
    OUT['l27']['board'] = {'threePhKA': fault_kA(cb, buses, br, gens, 'A', '3ph'), 'slgKA': fault_kA(cb, buses, br, gens, 'A', 'slg')}


if __name__ == '__main__':
    l23(); l24(); l25(); l26(); l27()
    path = os.path.join(HERE, 'ch7_expected.json')
    json.dump(OUT, open(path, 'w'), indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o), allow_nan=False)
    print('wrote', path)
    print('L23 default', OUT['l23']['designs']['0/0/closed/0'])
    print('L24', OUT['l24']['population']['designs'], OUT['l24']['population']['passing'], OUT['l24']['population']['best'][:2])
    print('L24 naive', OUT['l24']['cases']['naive']['kind'], 'lesson', OUT['l24']['cases']['lesson'])
    print('L25 tcr', OUT['l25']['tCrS'], OUT['l25']['deltaCrDeg'])
    print('L26', OUT['l26']['optCost'], OUT['l26']['nu'])
    print('L27', OUT['l27']['ps17'], OUT['l27']['ps18'], OUT['l27']['board'])
