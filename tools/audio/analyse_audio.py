#!/usr/bin/env python3
"""Measure GRID's rendered audio so "someone listened" becomes numbers (1.7). Nobody can hear through this script: it does not replace a
human listening pass, it says what a listener would check first.

usage: python3 -I tools/audio/analyse_audio.py <wav_dir> <out_dir>
  (wav_dir comes from: godot --headless --path godot -s audio/render_samples.gd -- <wav_dir>)

For every WAV: duration, integrated loudness (EBU R128, LUFS, via ffmpeg ebur128), true peak (dBTP), clipped samples (|x| >= 0.999), and a
spectrogram PNG. For the music tracks: tempo, a section map from bar-by-bar chroma (bars that sound alike get the same letter), how much of the
track repeats, and a cross-track check that no two tracks share a structure or a chord progression. For the one-shots: a spectral
fingerprint, and every pair that is too alike. Writes <out_dir>/ANALYSIS.md, <out_dir>/spec/*.png and compressed .ogg copies.
"""
import json, os, re, subprocess, sys, wave
import numpy as np

SHORT_TRACK_S = 120.0
TRACK_BPM = {"night_shift": 70.0, "load_follow": 84.0, "low_frequency": 58.0, "morning_ramp": 100.0}


def read_wav(p):
    with wave.open(p) as w:
        n, sr = w.getnframes(), w.getframerate()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768.0
    return x, sr


def ebur128(p):
    r = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", p, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    li = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", txt)
    tp = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", txt)
    lra = re.findall(r"LRA:\s+([\d.]+) LU", txt)
    f = lambda v: float("-inf") if v == "-inf" else float(v)
    return (f(li[-1]) if li else float("nan")), (f(tp[-1]) if tp else float("nan")), (float(lra[-1]) if lra else float("nan"))


def spectrogram(p, png, short):
    size = "1200x300" if not short else "600x240"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", p, "-lavfi", f"showspectrumpic=s={size}:legend=1:scale=log:fscale=log:stop=8000", png], check=True)


def ogg(p, out):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", p, "-c:a", "libvorbis", "-q:a", "2", out], check=True)


def chroma_frames(x, sr, frame_s):
    """12-bin chroma per frame (log-spaced FFT bins folded to pitch classes, 55 Hz-2 kHz)."""
    n = int(frame_s * sr)
    out = []
    for k in range(len(x) // n):
        seg = x[k * n:(k + 1) * n] * np.hanning(n)
        mag = np.abs(np.fft.rfft(seg))
        fr = np.fft.rfftfreq(n, 1.0 / sr)
        sel = (fr > 55) & (fr < 2000)
        pc = np.mod(np.round(12 * np.log2(fr[sel] / 440.0)) + 9, 12).astype(int)
        c = np.bincount(pc, weights=mag[sel] ** 2, minlength=12)
        out.append(c / (np.linalg.norm(c) + 1e-12))
    return np.array(out)


def section_map(ch, thr=0.93):
    """Greedy labelling: a bar matching an earlier bar's chroma (cosine >= thr) reuses its letter."""
    labels, protos = [], []
    for v in ch:
        sims = [float(v @ p) for p in protos]
        if sims and max(sims) >= thr:
            labels.append(chr(65 + int(np.argmax(sims)) % 26))
        else:
            protos.append(v)
            labels.append(chr(65 + (len(protos) - 1) % 26))
    return "".join(labels), len(protos)


def norm_pattern(s):
    """Relabel a letter string by first appearance, so ABAB and CDCD compare equal."""
    m, out = {}, []
    for ch in s:
        m.setdefault(ch, chr(97 + len(m)))
        out.append(m[ch])
    return "".join(out)


def lev(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return d[-1]


def fingerprint(x, sr):
    """24 log-band energies plus duration and attack, for one-shot similarity."""
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x)), n=1 << 15))
    fr = np.fft.rfftfreq(1 << 15, 1.0 / sr)
    edges = np.geomspace(40, min(sr / 2, 12000), 25)
    bands = np.array([mag[(fr >= edges[i]) & (fr < edges[i + 1])].sum() for i in range(24)])
    bands = np.log10(bands / (bands.sum() + 1e-12) + 1e-6)
    env = np.abs(x)
    attack = np.argmax(env > 0.5 * env.max()) / sr
    return np.concatenate([bands, [len(x) / sr * 4, attack * 40]])


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(out, "spec"), exist_ok=True)
    os.makedirs(os.path.join(out, "ogg"), exist_ok=True)
    files = sorted(f for f in os.listdir(src) if f.endswith(".wav"))
    rows, tracks, shots = [], {}, {}
    for f in files:
        p = os.path.join(src, f); name = f[:-4]
        x, sr = read_wav(p)
        dur = len(x) / sr
        lufs, tp, lra = ebur128(p)
        clipped = int(np.sum(np.abs(x) >= 0.999))
        short = dur < 5
        spectrogram(p, os.path.join(out, "spec", name + ".png"), short)
        ogg(p, os.path.join(out, "ogg", name + ".ogg"))
        rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
        rows.append((name, dur, lufs, tp, lra, clipped, rms))
        m = re.match(r"music_(\d+)_(.+)_(full|calm)$", name)
        if m and m.group(3) == "full":
            tracks[m.group(2)] = (x, sr, dur)
        if name.startswith("sfx_"):
            shots[name[4:]] = fingerprint(x, sr)

    md = ["# GRID audio analysis", "", "Generated by `tools/audio/analyse_audio.py` from the WAVs that `godot/audio/render_samples.gd` renders. These are",
          "measurements, not a listening pass: **a human listening pass is still owed**.", "",
          "## Every file", "", "Integrated loudness (EBU R128) gates in 400 ms blocks, so files shorter than 0.4 s have none; their RMS is given instead.", "",
          "| File | Length s | Loudness LUFS | RMS dBFS | True peak dBTP | Loudness range LU | Clipped samples |", "|---|---|---|---|---|---|---|"]
    for n, d, l, t, r, c, rms in rows:
        lt = "too short" if d < 0.4 else f"{l:.1f}"
        md.append(f"| {n} | {d:.2f} | {lt} | {rms:.1f} | {t:.1f} | {r:.1f} | {c} |")

    md += ["", "## Music", "", "Bars are labelled by their chroma: a bar that sounds like an earlier bar (cosine >= 0.93) reuses its letter.", "",
           "| Track | Length | BPM | Bars | Distinct bar sounds | Repeated bars | Section map (one letter per bar) |", "|---|---|---|---|---|---|---|"]
    maps, progs = {}, {}
    for tid, (x, sr, dur) in tracks.items():
        bpm = TRACK_BPM.get(tid, 70.0); bar_s = 4 * 60.0 / bpm
        ch = chroma_frames(x, sr, bar_s)
        smap, nd = section_map(ch)
        maps[tid] = smap; progs[tid] = ch
        rep = 1.0 - nd / max(1, len(smap))
        md.append(f"| {tid} | {dur:.0f} s | {bpm:.0f} | {len(smap)} | {nd} | {rep * 100:.0f} % | `{smap}` |")
    md += ["", "### Tracks under 2 minutes", ""]
    shorts = [t for t, (_, _, d) in tracks.items() if d < SHORT_TRACK_S]
    md.append("None." if not shorts else ", ".join(shorts))
    md += ["", "### Do any two tracks share a structure?", "",
           "Structure: the section maps relabelled by first appearance, compared by edit distance per bar. Harmony: the mean best-match cosine",
           "of one track's bar chroma against the other's (transposition-invariant: best over the 12 rotations).", "",
           "| Pair | Structure distance (0 = same form) | Harmony similarity (1 = same chords) | Verdict |", "|---|---|---|---|"]
    ids = list(tracks)
    flagged = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            pa, pb = norm_pattern(maps[a]), norm_pattern(maps[b])
            sd = lev(pa, pb) / max(len(pa), len(pb))
            best = 0.0
            for rot in range(12):
                cb = np.roll(progs[b], rot, axis=1)
                sim = (progs[a] @ cb.T).max(axis=1).mean()
                best = max(best, float(sim))
            same = sd < 0.15 or best > 0.97
            if same: flagged.append(f"{a} / {b}")
            md.append(f"| {a} / {b} | {sd:.2f} | {best:.2f} | {'SHARED: fix' if same else 'distinct'} |")
    md += ["", "Flagged pairs: " + (", ".join(flagged) if flagged else "none.")]

    md += ["", "## One-shots: are any two too alike?", "", "Fingerprint: 24 log-band energies, length and attack. Pairs closer than 2.0 are listed.", ""]
    names = sorted(shots)
    close = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            if a.startswith("plink") and b.startswith("plink"):
                continue   # the ten home plinks are one instrument by design (a rising arpeggio)
            d = float(np.linalg.norm(shots[a] - shots[b]))
            if d < 2.0: close.append((d, a, b))
    md.append("None." if not close else "\n".join(f"- {a} / {b}: {d:.2f}" for d, a, b in sorted(close)))
    loud = [r for r in rows if r[0].startswith("music_") and r[0].endswith("_full")]
    if loud:
        ls = [r[2] for r in loud]
        md += ["", f"Music loudness spread (full mixes): {min(ls):.1f} to {max(ls):.1f} LUFS ({max(ls) - min(ls):.1f} LU)."]
    md += ["", "Spectrograms are in `spec/`, compressed copies in `ogg/`."]
    open(os.path.join(out, "ANALYSIS.md"), "w").write("\n".join(md) + "\n")
    json.dump({"rows": rows, "maps": maps, "flagged": flagged, "close": close}, open(os.path.join(out, "analysis.json"), "w"), indent=1, default=float)
    print("\n".join(md))


if __name__ == "__main__":
    main()
