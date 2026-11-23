#!/usr/bin/env python3
"""Per-file numbers for docs/audio/ANALYSIS.md: RMS and sample peak dBFS, K-weighted-free approximate loudness (RMS), DC offset,
band balance (sub-60, 60-250, 250-2k, 2k-8k, >8k as % of energy), spectral centroid, wrap click (jump at the loop point against the
median step), and loop repeat period by autocorrelation. usage: python3 -I tools/audio/measure.py <wav_dir> [name_filter]"""
import sys, os, wave
import numpy as np

def read(p):
    with wave.open(p) as w:
        n, sr = w.getnframes(), w.getframerate()
        return np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768.0, sr

def db(v): return 20 * np.log10(max(v, 1e-9))

def measure(x, sr):
    f = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; fr = np.fft.rfftfreq(len(x), 1 / sr); tot = f.sum() + 1e-18
    edges = [0, 60, 250, 2000, 8000, 1e9]
    bands = [100 * f[(fr >= a) & (fr < b)].sum() / tot for a, b in zip(edges[:-1], edges[1:])]
    step = np.median(np.abs(np.diff(x))) + 1e-9
    wrap = abs(x[0] - x[-1]) / step      # the jump when the file loops, in typical sample steps
    ac = None
    if len(x) > 4 * sr:
        n = 1 << (len(x) * 2 - 1).bit_length(); X = np.fft.rfft(x - x.mean(), n); r = np.fft.irfft(X * np.conj(X))[: len(x) // 2]; r /= r[0] + 1e-18
        lo = int(0.5 * sr); k = lo + int(np.argmax(r[lo:])); ac = (k / sr, float(r[k]))
    return dict(rms=db(np.sqrt(np.mean(x ** 2))), peak=db(np.abs(x).max()), dc=float(x.mean()), cent=float((f * fr).sum() / tot), bands=bands, wrap=wrap, ac=ac)

if __name__ == "__main__":
    d = sys.argv[1]; flt = sys.argv[2] if len(sys.argv) > 2 else ""
    print("file | len s | rms dBFS | peak dBFS | dc | centroid Hz | <60 | 60-250 | 250-2k | 2k-8k | >8k % | wrap x step | loop period s (r)")
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".wav") or flt not in fn: continue
        x, sr = read(os.path.join(d, fn)); m = measure(x, sr)
        ac = "-" if m["ac"] is None else "%.2f (%.2f)" % m["ac"]
        print("%s | %.2f | %.1f | %.1f | %+.4f | %.0f | %s | %.1f | %s" % (fn[:-4], len(x) / sr, m["rms"], m["peak"], m["dc"], m["cent"], " | ".join("%.0f" % b for b in m["bands"]), m["wrap"], ac))
