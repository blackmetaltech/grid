"""Finale (L28 Keep the Lights On) oracles, independent of the engine. Run: python3 -I tools/oracles/chf_oracles.py  (writes chf_expected.json)

F-1  demand energy of the three days (the denominator of the 0.1 % ENS rule): class profiles from DESIGN 4.8 (anchors written out below), temperature factor
     1 + 0.015 max(0, T - 30) for residential/commercial, the pinned cosine temperature of the three days, the holiday class scales; blocks 1..288 (the run's first block is 00:15).
F-2  line charging of the 400 kV ring, exact equivalent pi (Q = V^2 B at 1 pu), from the per-km constants of twin Moose: the over-voltage of Day 3.
F-3  Saltmarsh Island's night on the battery: energy to carry its load from the 23:30 lightning to the 06:00 repair, nameplate kWh at 0.8 window and sqrt(0.86) one way.
"""
import cmath, json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))

RES24 = [0.62, 0.55, 0.5, 0.47, 0.46, 0.5, 0.58, 0.62, 0.6, 0.56, 0.55, 0.56, 0.58, 0.6, 0.62, 0.62, 0.63, 0.7, 0.85, 0.97, 1.0, 0.97, 0.88, 0.75]
AH = [0, 3, 6, 9, 12, 15, 18, 19, 20, 21, 23]
COM_A = [0.3, 0.28, 0.35, 0.85, 1.0, 0.98, 0.7, 0.6, 0.5, 0.42, 0.33]
IND_A = [0.85, 0.85, 0.92, 1.0, 0.95, 1.0, 0.95, 0.92, 0.9, 0.88, 0.86]
def hourly(vals):
    out = []
    for h in range(24):
        i = max(k for k in range(len(AH)) if AH[k] <= h)
        h0, v0 = AH[i], vals[i]
        h1, v1 = (AH[i + 1], vals[i + 1]) if i + 1 < len(AH) else (24, vals[0])
        out.append(v0 + (v1 - v0) * (h - h0) / (h1 - h0))
    return out
def blocks(hr):
    return [hr[b // 4] + (hr[(b // 4 + 1) % 24] - hr[b // 4]) * ((b % 4) / 4) for b in range(96)]
RES, COM, IND = blocks(RES24), blocks(hourly(COM_A)), blocks(hourly(IND_A))
IRR = [1.0 if (0 <= b < 20 or 40 <= b < 56) else 0.05 for b in range(96)]   # supply windows 00-04 and 10-13 hours (DESIGN 4.8)

DAYS = [dict(tmin=30, tmax=44, scale={}), dict(tmin=21, tmax=26, scale={}),
        dict(tmin=22, tmax=31, scale=dict(commercial=0.7, industrial=0.8, residential=0.95, agricultural=0.9))]
LOADS = [('commercial', 380), ('residential', 345), ('flat', 300), ('industrial', 320), ('commercial', 90), ('residential', 28), ('residential', 125), ('residential', 80),
         ('agricultural', 100), ('residential', 115), ('industrial', 55), ('residential', 100), ('industrial', 90), ('commercial', 140), ('industrial', 230)]
def scale(day, b, cls):
    cur = DAYS[min(day, 2)]['scale'].get(cls, 1)
    if day <= 0 or b >= 8: return cur
    prev = DAYS[min(day - 1, 2)]['scale'].get(cls, 1)
    return prev + (cur - prev) * ((b + 1) / 8)   # the holiday eases in over the first two hours
def temp(d, blk): return d['tmin'] + (d['tmax'] - d['tmin']) * (0.5 - 0.5 * math.cos(2 * math.pi * (blk / 4 - 3) / 24))
def frac(cls, b, T):
    f = 1 + 0.015 * max(0, T - 30)
    return {'residential': RES[b] * f, 'commercial': COM[b] * f, 'industrial': IND[b], 'agricultural': IRR[b]}[cls]
def energy():
    e = 0.0; peak = 0.0
    for tick in range(1, 289):
        day, b = divmod(tick, 96); d = DAYS[min(day, 2)]; T = temp(d, b); mw = 0.0
        for cls, p in LOADS:
            mw += p if cls == 'flat' else p * frac(cls, b, T) * scale(day, b, cls)
        e += mw * 0.25; peak = max(peak, mw)
    return e, peak

def charging(r, x, b_us, km, kv, n):
    z = complex(r, x); y = complex(0, b_us * 1e-6); g = cmath.sqrt(z * y); zc = cmath.sqrt(z / y)
    yh = cmath.tanh(g * km / 2) / zc * n          # half shunt of the exact pi, S (n parallel circuits)
    return 2 * yh.imag * kv * kv                  # MVAr at 1 pu (both halves)

out = {}
e, pk = energy()
out['F-1'] = dict(energy_MWh=e, ens_limit_MWh=0.001 * e, peak_MW=pk)
ring = [(62, 2), (113, 2), (170, 2), (113, 2), (86, 2), (113, 1), (75, 1), (107, 1)]   # km, circuits, by line order (map distances x 4 km per tile)
out['F-2'] = dict(ring_Mvar=sum(charging(0.0347, 0.327, 3.43, km, 400, n) for km, n in ring))
# island: load shape = residential class, 28 MW peak, no heat factor at night; blocks 190..215 (lightning opens the feeder at Day 2 block 94 before that block's flow; the crews close it at Day 3 block 24)
cells = 0.0
for k in range(190, 216):
    b = k % 96; cells += 28 * RES[b] * 0.25 * scale(k // 96, k % 96, 'residential')
eta = math.sqrt(0.86)
out['F-3'] = dict(delivered_MWh=cells, nameplate_MWh=cells / eta / 0.8)
if __name__ == '__main__':
    json.dump(out, open(os.path.join(HERE, 'chf_expected.json'), 'w'), indent=1, sort_keys=True)
    print(json.dumps(out, indent=1))
