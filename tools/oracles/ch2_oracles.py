"""Chapter 2 oracles (L04 Spin the Alternator, L06 Exam Bridge: The Town Line), independent of the TypeScript engine.

Run:  python3 -I tools/oracles/ch2_oracles.py   (writes tools/oracles/ch2_expected.json)

L04 (DESIGN 3.5, AC-17 formula): f = p N_rpm / 120, e0 = N B A w, E_rms = e0 / sqrt 2. The winding's copper cost: three phase windings of N turns, each turn the
perimeter 4 sqrt(A) of a square coil, conductor section S = I_rated / J (300 kVA at 230 V per phase, J = 3 A/mm2 -> 145 mm2), priced per metre per mm2
at the pack's cable price. L06 (AC-15 / AC-16): 800 kW over a 15 ohm loop, ideal transformers, unity pf; transformer pair price = 2 kVA p sqrt(kV_line / 11).
The `population` blocks replay the bot-population rule of src/level/population.ts (budget, star A = median, star B = 15th percentile) on the same site lists.
"""
import itertools, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
PACKS = {  # price per metre per mm2 per core (cable catalogue); price per kVA of the pack's dt-400 distribution transformer
    "global": {"cu": 0.10, "kva": 20.0},
    "in": {"cu": 0.9, "kva": round((300000 + (400 - 100) * 900000 / 530) / 1000) * 1000 / 400},
}
F0, RPM, V_T, V_TOL, F_TOL = 50.0, 500.0, 230.0, 2.0, 0.5
RATED_A = 300e3 / (3 * V_T)
SECTION = round(RATED_A / 3.0)  # mm2


def machine(poles, n, b, a, cu):
    f = poles * RPM / 120.0
    w = 2 * math.pi * f
    nba = n * b * a
    e0 = nba * w
    erms = e0 / math.sqrt(2)
    band = max(abs(erms / V_T - 1) * 100 / V_TOL, abs(f / F0 - 1) * 100 / F_TOL)
    cost = 3 * n * 4 * math.sqrt(a) * SECTION * cu
    kg = 3 * n * 4 * math.sqrt(a) * SECTION * 1e-6 * 8960.0
    return dict(f=f, omega=w, nba=nba, e0=e0, erms=erms, band=band, cost=cost, copper_kg=kg)


def pct(xs, p):
    k = (len(xs) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def nice_up(x):
    mag = 1.0
    while x / mag >= 100: mag *= 10
    while x / mag < 10: mag /= 10
    return math.ceil(x / mag - 1e-9) * mag


def population(costs_pass, cheapest, lesson, ref):
    budget = nice_up(max(1.1 * max(lesson, ref), 1.3 * cheapest))
    ok = sorted(c for c in costs_pass if c <= budget + 1e-9)
    return dict(budget=budget, starB=pct(ok, 0.15), starA=max(pct(ok, 0.5), pct(ok, 0.15)), passing=len(ok), cheapest=cheapest)


POLES = [4, 8, 10, 12, 14, 20]
BS = [0.5, 0.6, 0.7, 0.8, 0.9]
AS = [0.03, 0.05, 0.08, 0.10, 0.12]
tgt = V_T * math.sqrt(2) / (2 * math.pi * F0)


def winding_options():
    out = []
    for b, a in itertools.product(BS, AS):
        n0 = tgt / (b * a)
        ns = sorted({max(10, round(n0)), max(10, round(n0 * 0.8)), max(10, round(n0 * 1.25))})
        for n in ns: out.append((n, b, a))
    return out


out = {"meta": {"generator": "tools/oracles/ch2_oracles.py", "note": "unrounded, computed from the inputs"}, "L04": {}, "L06": {}}
l04 = out["L04"]
l04["inputs"] = dict(rpm=RPM, v_target_rms=V_T, v_tol_pct=V_TOL, f_target=F0, f_tol_pct=F_TOL, rated_a=RATED_A, section_mm2=SECTION, nba_target=tgt)
l04["peak_target_V"] = V_T * math.sqrt(2)
l04["poles_for_50Hz"] = 120 * F0 / RPM
l04["naive_f_Hz"] = 4 * RPM / 120
DES = {"naive": (4, 30, 0.7, 0.05), "lesson": (12, 30, 0.7, 0.05)}
for pk, pr in PACKS.items():
    wopts = winding_options()
    allp = []
    for p, (n, b, a) in itertools.product(POLES, wopts):
        m = machine(p, n, b, a, pr["cu"])
        allp.append((m["cost"], m["band"] <= 1.0 + 1e-12, p, n, b, a))
    passing = sorted(c for c, ok, *_ in allp if ok)
    ref = min((x for x in allp if x[1] and machine(*x[2:], pr['cu'])['band'] <= 0.9), key=lambda x: x[0])   # the reference keeps a margin inside the band
    DES["reference"] = ref[2:]
    les = machine(*DES["lesson"], pr["cu"])
    refm = machine(*ref[2:], pr["cu"])
    l04[pk] = {"designs": {k: dict(zip(("poles", "turns", "field_T", "area_m2"), v)) | machine(*v, pr["cu"]) for k, v in DES.items()},
               "n_designs": len(allp), "n_pass_all": len(passing),
               "population": population(passing, passing[0], les["cost"], refm["cost"])}
# L06
l06 = out["L06"]
P, R, VG = 800e3, 15.0, 4000.0
RATIOS = [1, 2, 5, 6, 7, 8, 10, 15, 20]
KVAS = [630, 1000, 1250, 1600]
l06["inputs"] = dict(P_W=P, R_loop=R, V_gen=VG, loss_max_pct=2.0)
l06["need_kv_for_2pct"] = math.sqrt(P * R / 0.02) / 1000
l06["need_ratio_for_2pct"] = math.sqrt(P * R / 0.02) / VG


def town(ratio, kva, kvap):
    v = VG * ratio
    i = P / v
    loss = i * i * R
    cost = 0.0 if ratio == 1 else 2 * kva * kvap * math.sqrt(v / 1000 / 11)
    load = P / (kva * 1000.0)
    ok = loss / P * 100 <= 2.0 and (ratio == 1 or load <= 1 + 1e-9)
    return dict(v_line_V=v, i_A=i, loss_kW=loss / 1000, loss_pct=loss / P * 100, v_town_pu=(v - i * R) / v, loading=load, cost=cost, ok=ok)


l06["table"] = {str(r): town(r, 1000, 20.0) for r in RATIOS}
for pk, pr in PACKS.items():
    allp = [(town(r, k, pr["kva"]), r, k) for r in RATIOS for k in KVAS]
    passing = sorted(x[0]["cost"] for x in allp if x[0]["ok"])
    ref = min((x for x in allp if x[0]["ok"]), key=lambda x: x[0]["cost"])
    les = town(10, 1000, pr["kva"])
    l06[pk] = dict(lesson=les, reference=dict(ratio=ref[1], kva=ref[2]) | ref[0], n_designs=len(allp), n_pass=len(passing),
                   population=population(passing, passing[0], les["cost"], ref[0]["cost"]))
l06["predict_4kV_loss_kW"] = (P / VG) ** 2 * R / 1000
l06["predict_40kV_loss_kW"] = (P / 40000.0) ** 2 * R / 1000
with open(os.path.join(HERE, "ch2_expected.json"), "w") as f:
    json.dump(out, f, indent=1)
print(json.dumps({k: out["L04"][k] for k in ("global", "in")}, indent=1)[:3000])
print(json.dumps({k: out["L06"][k] for k in ("global", "in")}, indent=1)[:2500])
