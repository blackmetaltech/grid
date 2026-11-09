"""Compare expected.json values with the numbers printed in DESIGN 9.1.

PASS              |value - printed| within the row tolerance (rel or abs; per-name 'tols' override)
ROUNDING-LIMITED  outside tol, but |value - printed| <= half a unit of the last printed digit (printed to its precision)
MISMATCH          anything else: investigate (doc or script is wrong)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "expected.json")))
rows, counts, per_row = [], {"PASS": 0, "ROUNDING-LIMITED": 0, "MISMATCH": 0}, {}
for oid, o in sorted(d["oracles"].items()):
    worst = "PASS"
    for name, pr in o["printed"].items():
        v = o["values"][name]
        t = o.get("tols", {}).get(name, {"tol": o["tol"], "tolKind": o["tolKind"]})
        err = abs(v - pr) if t["tolKind"] == "abs" or pr == 0 else abs(v - pr) / abs(pr)
        ok = err <= t["tol"] * (1 + 1e-9)
        if ok: st = "PASS"
        elif abs(v - pr) <= o["printedHalfUlp"][name] * (1 + 1e-9): st = "ROUNDING-LIMITED"
        else: st = "MISMATCH"
        rows.append((oid, name, pr, v, err, t["tol"], t["tolKind"], st))
        counts[st] += 1
        worst = max(worst, st, key=["PASS", "ROUNDING-LIMITED", "MISMATCH"].index)
    per_row[oid] = worst
verbose = "-q" not in sys.argv
if verbose:
    print(f"{'id':6} {'name':22} {'printed':>12} {'value':>20} {'err':>10} {'tol':>8}  status")
    for r in rows:
        if r[7] != "PASS" or "-a" in sys.argv:
            print(f"{r[0]:6} {r[1]:22} {r[2]:12.6g} {r[3]:20.12g} {r[4]:10.2e} {r[5]:8.0e} {r[6]:3}  {r[7]}")
rl = [k for k, v in per_row.items() if v == "ROUNDING-LIMITED"]
mm = [k for k, v in per_row.items() if v == "MISMATCH"]
print(f"\nquantities: {counts}")
print(f"rows: {len(per_row)}  PASS {sum(v=='PASS' for v in per_row.values())}  ROUNDING-LIMITED {len(rl)}  MISMATCH {len(mm)}")
print("rounding-limited rows:", ", ".join(rl))
print("mismatch rows:", ", ".join(mm) or "none")
sys.exit(1 if mm else 0)
