#!/usr/bin/env python3
"""Route-module oracles S-01..S-08 (design/grid/DEPTH.md §9), computed independently of the engine (no shared code).

Run: python3 tools/oracles/route_oracles.py  -> writes tools/oracles/route_expected.json (unrounded floats).
Methods: parabolic sag D = wL^2/(8H); exact catenary by cosh; the parabolic state-change cubic solved by bisection
(the engine must use its own solver); IEC 60815 creepage classes; conductor temperature T = Ta + (Tmax - Ta)(I/Ir)^2.
"""
import json, math, os

G = 9.80665
# BS 215-2 (Lumino reprint): UTS N, mass kg/km, area mm2; E and alpha by stranding (WBSEDCL ACSR spec §6).
COND = {
    'acsr-weasel': dict(uts=11.5e3, m=128, A=36.88, E=79e9, a=19.1e-6),
    'acsr-rabbit': dict(uts=18.4e3, m=214, A=61.70, E=79e9, a=19.1e-6),
    'acsr-dog':    dict(uts=32.7e3, m=394, A=118.5, E=75e9, a=19.8e-6),
}

def w_of(c): return COND[c]['m'] * 1e-3 * G

def sag_parabola(w, L, H): return w * L * L / (8 * H)

def sag_catenary(w, L, H): return (H / w) * (math.cosh(w * L / (2 * H)) - 1)

def state_change(c, L, H1, t1, t2):
    p = COND[c]; w = w_of(c); EA = p['E'] * p['A'] * 1e-6
    K = H1 - (w * w * L * L * EA) / (24 * H1 * H1) - p['a'] * (t2 - t1) * EA
    rhs = w * w * L * L * EA / 24
    f = lambda H: H * H * (H - K) - rhs
    lo, hi = 1e-6, max(H1, abs(K)) * 4 + 1e4
    for _ in range(300):
        mid = (lo + hi) / 2
        if f(mid) > 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2

def creepage_needed_mm(um_kv, mm_per_kv): return um_kv * mm_per_kv

out = {}
# S-01 Dog 100 m at 20 % UTS, parabola
w = w_of('acsr-dog'); H = 0.2 * COND['acsr-dog']['uts']
out['S-01'] = {'w_N_per_m': w, 'H_N': H, 'L_m': 100, 'sag_m': sag_parabola(w, 100, H)}
# S-02 catenary vs parabola
cat = sag_catenary(w, 100, H)
out['S-02'] = {'catenary_m': cat, 'rel_diff': abs(cat - out['S-01']['sag_m']) / cat}
# S-03 state change Dog 100 m, 15 -> 75 C
H2 = state_change('acsr-dog', 100, H, 15, 75)
out['S-03'] = {'H2_N': H2, 'sag_hot_m': sag_parabola(w, 100, H2)}
# S-04 Rabbit 70 m and 100 m on 11 kV concrete pole (attach 9.0 m, pin insulator: no string drop) at 75 C vs 6.0 m on flat ground
s4 = {}
for L in (70, 100, 130):
    wr = w_of('acsr-rabbit'); H1 = 0.2 * COND['acsr-rabbit']['uts']
    H2r = state_change('acsr-rabbit', L, H1, 15, 75)
    d = sag_parabola(wr, L, H2r)
    s4[str(L)] = {'H1_N': H1, 'H2_N': H2r, 'sag_hot_m': d, 'clearance_m': 9.0 - d, 'margin_m': 9.0 - d - 6.0}
out['S-04'] = s4
# S-04b wood pole (attach 7.5 m) Rabbit spans at 75 C: the longest span on flat ground that keeps 6.0 m
best = None
for L in range(30, 200):
    wr = w_of('acsr-rabbit'); H1 = 0.2 * COND['acsr-rabbit']['uts']
    d = sag_parabola(wr, L, state_change('acsr-rabbit', L, H1, 15, 75))
    if 7.5 - d >= 6.0: best = L
out['S-04b'] = {'wood_rabbit_max_flat_span_m': best}
# S-05 creepage: 11 kV system, Um 12 kV
out['S-05'] = {
    'classIII_25_mm': creepage_needed_mm(12, 25), 'pin320_passes_III': 320 >= creepage_needed_mm(12, 25),
    'classIV_31_mm': creepage_needed_mm(12, 31), 'discs295_for_IV': math.ceil(creepage_needed_mm(12, 31) / 295),
    'fogdiscs430_for_IV': math.ceil(creepage_needed_mm(12, 31) / 430),
}
# S-06 angle class
def angle_class(deg):
    d = abs(deg)
    return 'suspension' if d <= 2 else 'small' if d <= 15 else 'medium' if d <= 30 else 'large'
out['S-06'] = {'25deg': angle_class(25), '2deg': angle_class(2), '2.5deg': angle_class(2.5), '45deg': angle_class(45)}
# S-08 conductor temperature
out['S-08'] = {'T_c': 45 + (75 - 45) * 0.8 ** 2}

# S-09 11 kV (Um 12 kV) in pollution class IV (31 mm/kV): need 372 mm; the insulators of the L29 kit (creepage mm): pin 320, one anti-fog disc 430, two standard discs 2 x 295
need_iv = creepage_needed_mm(12, 31)
INS = {'pin': 320, 'fog1': 430, 'disc2': 2 * 295}
out['S-09'] = {'need_classIV_mm': need_iv, 'creepage_mm': INS, 'passes_classIV': {k: v >= need_iv for k, v in INS.items()},
               'need_classIII_mm': creepage_needed_mm(12, 25), 'passes_classIII': {k: v >= creepage_needed_mm(12, 25) for k, v in INS.items()},
               'need_classII_mm': creepage_needed_mm(12, 20), 'need_classI_mm': creepage_needed_mm(12, 16)}
# S-10 the string drop eats clearance: Rabbit 70 m flat span, concrete pole attach 9.0 m, required 6.0 m; drop 0 (pin), 0.15 (fog1), 0.30 (disc2)
DROP = {'pin': 0.0, 'fog1': 0.15, 'disc2': 0.30}
wr = w_of('acsr-rabbit'); H1r = 0.2 * COND['acsr-rabbit']['uts']
s10 = {}
for L in (70, 100):
    d = sag_parabola(wr, L, state_change('acsr-rabbit', L, H1r, 15, 75))
    s10[str(L)] = {'sag_hot_m': d, **{k: {'clearance_m': 9.0 - dr - d, 'margin_m': 9.0 - dr - d - 6.0} for k, dr in DROP.items()}}
    s10[str(L)]['loss_disc2_vs_pin_m'] = s10[str(L)]['pin']['clearance_m'] - s10[str(L)]['disc2']['clearance_m']
def max_span(attach):
    best = None
    for L in range(30, 200):
        d = sag_parabola(wr, L, state_change('acsr-rabbit', L, H1r, 15, 75))
        if attach - d >= 6.0: best = L
    return best
s10['wood_max_flat_span_m'] = {k: max_span(7.5 - dr) for k, dr in DROP.items()}
out['S-10'] = s10

p = os.path.join(os.path.dirname(__file__), 'route_expected.json')
json.dump(out, open(p, 'w'), indent=1)
print(json.dumps(out, indent=1))
