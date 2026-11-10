"""Chapter 6 oracles (L19 Fifty Hertz, L20 Sun Goes Down, L21 Inertia Matters, L22 Exam Bridge): independent of the engine.

Run:  python3 -I tools/oracles/ch6_oracles.py   (writes tools/oracles/ch6_expected.json)

Frequency model = DESIGN 3.6 (centre-of-inertia swing equation, steam reheat / gas / hydro non-minimum-phase governors with a permanent droop,
offset dead-zone, FFR batteries, load damping, latched UFLS with relay delay). RK4 at 10 ms, written here from the equations, not from src/sim/dynamics.
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- the model --------------------------------------------------------------------------------------------------------------------
def steam(S, H, R, P0, Pmax, Pmin): return dict(k='steam', S=S, H=H, R=R, P0=P0, Pmax=Pmax, Pmin=Pmin)
def hydro(S, H, R, P0, Pmax, Pmin): return dict(k='hydro', S=S, H=H, R=R, P0=P0, Pmax=Pmax, Pmin=Pmin)
def gas(S, H, R, P0, Pmax, Pmin): return dict(k='gas', S=S, H=H, R=R, P0=P0, Pmax=Pmax, Pmin=Pmin)

def window(f0, units, load, dP, bess=(), ufls=(), dload=1.5, db_hz=0.01, T=60.0, dt=0.01, delay=0.2, der=None, genuf=(47.5, 0.5)):
    """units: dicts; bess: dicts(rated, droop, tb, hv, forming); der: dict(mw, hz_per_s). Returns nadir, rocof0, shed, f_end, hsys, max 500 ms RoCoF."""
    n = len(units); m = len(bess)
    S = np.array([u['S'] for u in units]); H = np.array([u['H'] for u in units])
    SR = np.array([u['S'] / u['R'] if u['R'] > 0 else 0.0 for u in units])
    lo = np.array([u['Pmin'] - u['P0'] for u in units]); hi = np.array([u['Pmax'] - u['P0'] for u in units])
    kind = [u['k'] for u in units]
    tg = np.array([0.2 if k == 'steam' else 0.5 for k in kind])
    sys_S = S.sum() + sum(b['rated'] for b in bess if b.get('forming'))
    HS = (S * H).sum() + sum(b['rated'] * b.get('hv', 0) for b in bess if b.get('forming'))
    hsys = HS / sys_S
    rocof0 = -dP * f0 / (2 * HS)
    db = db_hz / f0
    x = np.zeros(1 + 2 * n + 2 * m)           # dw, v_i, z_i, Pb_j, E_j
    on = np.ones(n, bool)
    shed = 0.0; load_now = load; dPe = dP
    picked = [False] * len(ufls); timers = []
    der_left = der['mw'] if der else 0.0
    nst = int(T / dt); hist = [f0]
    fmin = f0; settled_at = None
    uf_start = None

    def dz(d):
        a = abs(d) - db
        return 0.0 if a <= 0 else math.copysign(a, d)

    def f(x):
        dw = x[0]; dwe = dz(dw); out = np.zeros_like(x); pm = 0.0
        for i in range(n):
            if not on[i]: continue
            v = x[1 + i]; z = x[1 + n + i]
            out[1 + i] = (-SR[i] * dwe - v) / tg[i]
            if kind[i] == 'steam':
                out[1 + n + i] = (v - z) / 7.0; p = 0.3 * v + 0.7 * z
            elif kind[i] == 'hydro':
                out[1 + n + i] = (3 * v - z) / (0.5 * 1.5); p = -2 * v + z
            else:
                p = v
            pm += min(max(p, lo[i]), hi[i])
        for j, b in enumerate(bess):
            pb = x[1 + 2 * n + j]
            tb = b.get('tb', 0.05 if b.get('forming') else 0.2)
            out[1 + 2 * n + j] = (-(b['rated'] / b.get('droop', 0.01)) * dwe - pb) / tb
            pm += min(max(pb, -b['rated']), b['rated'])
        out[0] = (pm - dPe - dload * load_now * dw) / (2 * HS)
        return out

    first_stage = max(range(len(ufls)), key=lambda j: ufls[j][0]) if ufls else None
    max_rocof = 0.0; der_pick = None
    for s in range(nst):
        k1 = f(x); k2 = f(x + dt / 2 * k1); k3 = f(x + dt / 2 * k2); k4 = f(x + dt * k3)
        x = x + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t = (s + 1) * dt; fz = f0 * (1 + x[0]); hist.append(fz); fmin = min(fmin, fz)
        kk = min(len(hist) - 1, int(round(0.5 / dt)))
        max_rocof = max(max_rocof, abs((hist[-1] - hist[-1 - kk]) / (kk * dt)))
        for j, (hz, pct) in enumerate(ufls):
            if not picked[j] and fz < hz:
                picked[j] = True; timers.append((t + delay, j))
        for q in list(timers):
            if t >= q[0] - 1e-9:
                mw = ufls[q[1]][1] / 100 * load; shed += mw; dPe -= mw; load_now -= mw; timers.remove(q)
        if der and der_left > 0:
            kw = int(round(0.5 / dt))
            if len(hist) > kw and abs((hist[-1] - hist[-1 - kw]) / (kw * dt)) > der['hz_per_s']:
                dPe += der_left; der_left = 0.0; der['tripped'] = True
        if fz < genuf[0]:
            uf_start = t if uf_start is None else uf_start
            if t >= uf_start + genuf[1]:
                for i in range(n):
                    if on[i] and kind[i] != 'none': on[i] = False; dPe += units[i]['P0']
                break
        else: uf_start = None
        if t > 20 and abs(k1[0]) < 1e-5 and not timers:
            break
    return dict(nadir=fmin, rocof0=rocof0, shed=shed, f_end=hist[-1], hsys=hsys, S=sys_S, max_rocof500=max_rocof, der_tripped=bool(der and der.get('tripped')))

UFLS = {
    'global': [(49.0, 5), (48.8, 8), (48.6, 8), (48.4, 8), (48.2, 8), (48.0, 8)],
    'in': [(49.4, 5), (49.2, 6), (49.0, 7), (48.8, 7)],
}
DB = {'global': 0.01, 'in': 0.03}

def coal(P0): return steam(500 / 0.85, 3.5, 0.05, P0, 500, 200)
def hyd(P0): return hydro(250 / 0.85, 3.0, 0.04, P0, 250, 75)

out = {}

# ---- L19 --------------------------------------------------------------------------------------------------------------------------
LOAD = 6900.0
def l19_units(ncoal):
    """ED of the scenario: hydro first (cost 0) at 250, the coal units share the rest equally (identical quadratic cost curves); U1 trips."""
    p_coal = (LOAD - 4 * 250) / ncoal
    return p_coal, [coal(p_coal)] * (ncoal - 1) + [hyd(250)] * 4

o19 = {}
for pack in ('global', 'in'):
    d = {}
    for name, ncoal, bess in (('naive', 12, []), ('spin', 13, []), ('spin_ffr100', 13, [dict(rated=50, droop=0.01), dict(rated=50, droop=0.01)])):
        p_coal, surv = l19_units(ncoal)
        r = window(50.0, surv, LOAD, p_coal, bess=bess, ufls=UFLS[pack], db_hz=DB[pack])
        headroom = sum(u['Pmax'] - u['P0'] for u in surv)
        r.update(trip_mw=p_coal, headroom_mw=headroom, reserve_cover=headroom / p_coal, p_coal=p_coal)
        d[name] = r
    o19[pack] = d
out['L19'] = o19
# the analytic initial RoCoF and the headroom rule on the naive build (hand numbers of DESIGN L19)
pc, surv = l19_units(12)
HS = sum(u['S'] * u['H'] for u in surv)
out['L19']['analytic'] = dict(p_coal_naive=pc, HS_naive=HS, hsys_naive=HS / sum(u['S'] for u in surv), rocof0_naive=-pc * 50 / (2 * HS))

# ---- L20 Sun Goes Down: arithmetic of the scenario -------------------------------------------------------------------------------------
# Demand of the towns by hour (piecewise linear), the farm pumps (600 MW; 5 % outside their supply hours), the coal fleet the day-ahead plan keeps on (six units: 1.2 GW
# minimum in `global`, 1.65 GW in `in`), the clear-sky PV at 12:00 (2 975.912 MW of 3 000 MW: tools/oracles weather/solar model, equinox, 23 N, tracking, 25 C)
HOURS = [0, 5, 7, 10, 14, 17, 19, 22, 24]; MW = [3000, 2600, 3000, 3500, 3800, 4200, 4800, 4300, 3000]
def towns(h):
    for i in range(1, len(HOURS)):
        if h <= HOURS[i]: return MW[i - 1] + (MW[i] - MW[i - 1]) * (h - HOURS[i - 1]) / (HOURS[i] - HOURS[i - 1])
    return MW[-1]
def pumps(h, when):
    on = (h < 2 or 17 <= h < 21) if when == 'night' else (10 <= h < 14)
    return 600 * (1.0 if on else 0.05)
PV12 = 2975.912
o20 = {'towns_12h': towns(12), 'pumps_12h_night': pumps(12, 'night'), 'demand_12h': towns(12) + pumps(12, 'night'),
       'demand_19h_night': towns(19) + pumps(19, 'night'), 'demand_19h_noon': towns(19) + pumps(19, 'noon'), 'coal_capacity_evening': 9 * 500.0}
for pack, pmin in (('global', 0.40), ('in', 0.55)):
    mins = 6 * 500 * pmin
    o20[pack] = {'coal_min_mw': mins, 'curtail_12h_mw': max(0.0, mins - (o20['demand_12h'] - PV12)), 'shortfall_19h_coal_only_mw': o20['demand_19h_night'] - 9 * 500.0,
                 'shortfall_19h_noon_pumps_mw': o20['demand_19h_noon'] - 9 * 500.0, 'margin_4_peakers_noon_pumps_mw': 9 * 500.0 + 4 * 105 - o20['demand_19h_noon'], 'margin_2_peakers_noon_pumps_mw': 9 * 500.0 + 2 * 105 - o20['demand_19h_noon']}
out['L20'] = o20

# ---- L21 Inertia Matters --------------------------------------------------------------------------------------------------------------
PV_TOTAL = 3000 * PV12 / 3000 + 1200 * PV12 / 3000       # utility 3 000 MW + rooftop 1 200 MW at the same clear-sky factor
ROOF = 1200 * PV12 / 3000
def l21(pack, coal_n, gfm_n, ride=False):
    pmin = 500 * (0.40 if pack == 'global' else 0.55)
    load = 5200.0
    sync = load - PV_TOTAL                                     # what the machines must carry: the 500 MW gas unit is pinned, the coal units at minimum, the hydro units the rest (not below 30 %)
    hyd_p = max(75.0, (sync - 500.0 - coal_n * pmin) / 4)
    surplus = 500.0 + coal_n * pmin + 4 * hyd_p - sync          # the rest is curtailed PV, taken pro rata from utility and rooftop PV
    keep = 1 - surplus / PV_TOTAL
    units = [steam(500 / 0.85, 3.5, 0.05, pmin, 500, pmin)] * coal_n + [hydro(250 / 0.85, 3.0, 0.04, hyd_p, 250, 75)] * 4
    bess = [dict(rated=50.0 * gfm_n, droop=0.01, forming=True, hv=4.0)] if gfm_n else []
    der = None if ride else dict(mw=ROOF * keep, hz_per_s=1.0)
    r = window(50.0, units, load, 500.0, bess=bess, ufls=UFLS[pack], db_hz=DB[pack], der=der)
    r['der_mw'] = ROOF * keep; r['hs_mws'] = sum(u['S'] * u['H'] for u in units) + 4.0 * 50 * gfm_n
    return r
o21 = {}
for pack in ('global', 'in'):
    o21[pack] = {'naive': l21(pack, 0, 0), 'lesson': l21(pack, 2, 8), 'reference': l21(pack, 2, 10), 'ride_only': l21(pack, 0, 0, ride=True)}
out['L21'] = o21

# ---- L22 exam bridge --------------------------------------------------------------------------------------------------------------
ps = {}
ps['PS23_rocof_hz_s'] = 0.2 * 60 / (2 * 5)                            # RoCoF = dP f0 / (2 H S) = dP_pu f0 / (2H), 500 MVA H = 5 s, 0.2 pu, 60 Hz
ps['PS25_df_hz'] = -0.01 / (1 / 0.05 + 0.8) * 50.0                       # df = -dP / (1/R + D), pu, f0 = 50
S1, R1, S2, R2, dp = 500.0, 0.04, 300.0, 0.05, 100.0
beta = S1 / R1 + S2 / R2
ps['PS26_df_hz'] = -dp / beta * 50.0
ps['PS26_share_g1_mw'] = dp * (S1 / R1) / beta
ps['PS26_share_g2_mw'] = dp * (S2 / R2) / beta
# the level's task: shares 60:40  =>  S1/R1 : S2/R2 = 3 : 2 ; with R1 = 4 % : R2 = 3.6 %
ps['task_R2_for_60_40_at_R1_4pct'] = S2 / (S1 / R1 * 2 / 3)
# the engine's two-unit exam machine (425 MW / 500 MVA CCGT, 255 MW / 300 MVA): same shares for a 100 MW step
out['L22'] = ps

if __name__ == '__main__':
    path = os.path.join(HERE, 'ch6_expected.json')
    json.dump(out, open(path, 'w'), indent=1, sort_keys=True)
    print('wrote', path)
    for pack in ('global', 'in'):
        for k, v in o19[pack].items(): print(pack, k, {a: round(float(b), 4) for a, b in v.items() if not isinstance(b, bool)})
    print(out['L19']['analytic'], ps)
    print(json.dumps(out['L20'], indent=1))
    for pack in ('global', 'in'):
        for k, v in o21[pack].items(): print('L21', pack, k, {a: round(float(b), 4) for a, b in v.items() if not isinstance(b, bool)}, 'der', v['der_tripped'])
