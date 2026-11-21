class_name GridMusic
extends RefCounted
## GRID's music catalogue (1.7 "Sound and speed"). The 1.6 game had one 8-bar loop, 27 s long. This replaces it with four night-shift tracks,
## each 2-3 minutes long and each with its own key, mode, tempo, form, pad, bass, lead and percussion. A track is a list of sections (each a
## chord progression in scale degrees); its form strings sections together, and a section heard again is varied rather than copied (the lead
## motif is re-seeded and its last bar answers differently, the voicing opens up and the percussion fills at section ends).
## Everything is synthesised and deterministic. render_track(i) returns the three stems the game mixes live: "pad" (pad and bass, always
## on), "perc" (in with stress) and "lead" (the cute-mode melody). docs/audio/ holds the rendered sampler and its analysis.

const GA = preload("res://audio/grid_audio.gd")
const MRATE := 16000

## Scales as semitones from the root.
const DORIAN := [0, 2, 3, 5, 7, 9, 10]
const LYDIAN := [0, 2, 4, 6, 7, 9, 11]
const AEOLIAN := [0, 2, 3, 5, 7, 8, 10]
const MIXOLYDIAN := [0, 2, 4, 5, 7, 9, 10]

const TRACKS := [
	{"id": "night_shift", "title": "Night Shift", "root": 50, "scale": DORIAN, "bpm": 70.0, "pad": "warm", "bass": "whole", "lead": "musicbox", "perc": "brush", "seed": 70,
	 "sections": {"A": [0, 3, 6, 4, 0, 3, 1, 4], "B": [5, 3, 0, 4, 5, 3, 1, 1], "C": [2, 5, 3, 4, 2, 5, 3, 3]},
	 "form": [["A", 0.2, false, false], ["A", 0.5, true, true], ["B", 0.7, true, true], ["A", 0.6, true, true], ["C", 0.35, true, false], ["B", 0.8, true, true], ["A", 0.3, false, false]]},
	{"id": "load_follow", "title": "Load Follow", "root": 53, "scale": LYDIAN, "bpm": 84.0, "pad": "glass", "bass": "pulse8", "lead": "pluck", "perc": "pulse", "seed": 84,
	 "sections": {"A": [0, 1, 0, 1, 5, 4, 1, 1], "B": [3, 4, 5, 4, 3, 1, 4, 4], "C": [5, 5, 3, 3, 0, 0, 1, 1]},
	 "form": [["A", 0.4, false, true], ["B", 0.6, true, true], ["A", 0.7, true, true], ["B", 0.8, true, true], ["C", 0.3, true, false], ["C", 0.5, true, true], ["A", 0.9, true, true], ["B", 0.4, false, true]]},
	{"id": "low_frequency", "title": "Low Frequency", "root": 45, "scale": AEOLIAN, "bpm": 58.0, "pad": "drone", "bass": "ostinato", "lead": "flute", "perc": "sparse", "seed": 58,
	 "sections": {"A": [0, 0, 5, 5, 2, 2, 6, 6], "B": [3, 3, 0, 0, 4, 4, 0, 0]},
	 "form": [["A", 0.2, false, false], ["A", 0.5, true, true], ["B", 0.6, true, true], ["A", 0.7, true, true], ["B", 0.3, false, true]]},
	{"id": "morning_ramp", "title": "Morning Ramp", "root": 55, "scale": MIXOLYDIAN, "bpm": 100.0, "pad": "reed", "bass": "walk", "lead": "bell", "perc": "tick", "seed": 100,
	 "sections": {"A": [0, 6, 3, 0, 0, 6, 3, 4], "B": [3, 3, 0, 0, 6, 6, 4, 4], "C": [1, 4, 0, 5, 1, 4, 6, 6]},
	 "form": [["A", 0.4, false, true], ["A", 0.6, true, true], ["B", 0.7, true, true], ["A", 0.8, true, true], ["C", 0.5, true, false], ["B", 0.9, true, true], ["A", 0.7, true, true], ["A", 0.3, false, true]]},
]

static func count() -> int: return TRACKS.size()

## Length of track i in seconds (bars x 4 beats).
static func seconds(i: int) -> float:
	var t: Dictionary = TRACKS[posmod(i, TRACKS.size())]; var bars := 0
	for f in t.form: bars += (t.sections[f[0]] as Array).size()
	return bars * 4.0 * 60.0 / float(t.bpm)

static func _f(t: Dictionary, deg: int, oct: int) -> float:
	return GA._nf(int(t.root), t.scale, deg, oct)

## The three stems of track i: same length, no wrap (a track plays once, then the next one starts).
static func render_track(i: int) -> Dictionary:
	var t: Dictionary = TRACKS[posmod(i, TRACKS.size())]
	var r := GA._rng(int(t.seed))
	var beat := 60.0 / float(t.bpm); var bar := beat * 4.0
	var total := seconds(i) + 2.5   # room for the last notes' tails
	var pad := GA._buf(total, MRATE); var perc := GA._buf(total, MRATE); var lead := GA._buf(total, MRATE)
	var seen := {}; var bar_i := 0
	for f in t.form:
		var name: String = f[0]; var energy: float = f[1]; var with_lead: bool = f[2]; var with_perc: bool = f[3]
		var prog: Array = t.sections[name]; var rep := int(seen.get(name, 0)); seen[name] = rep + 1
		var mr := GA._rng(int(t.seed) * 31 + name.unicode_at(0) * 7 + rep * 101)   # the motif for this pass through the section
		var motif := _motif(mr, rep)
		if str(t.pad) == "drone": _drone(pad, t, prog, bar_i * bar, bar, energy)
		for k in prog.size():
			var deg: int = prog[k]; var t0 := (bar_i + k) * bar; var last := k == prog.size() - 1
			if str(t.pad) != "drone": _chord(pad, t, deg, t0, bar, energy, rep, r)
			_bass(pad, t, deg, int(prog[(k + 1) % prog.size()]), t0, beat, energy)
			if with_perc: _perc(perc, t, t0, beat, energy, last, r)
			if with_lead: _lead(lead, t, deg, t0, beat, motif, k, last, rep, mr)
		bar_i += prog.size()
	GA.normalize(pad, 0.5); GA.normalize(perc, 0.6); GA.normalize(lead, 0.45)
	_fade(pad, 0.4, 2.0); _fade(perc, 0.4, 2.0); _fade(lead, 0.4, 2.0)
	return {"pad": pad, "perc": perc, "lead": lead, "title": t.title, "id": t.id}

## A rhythmic motif: which eighth-note steps of a bar carry a note, and the melodic steps between them.
static func _motif(r: RandomNumberGenerator, rep: int) -> Dictionary:
	var steps: Array = []
	for s in 8:
		if s == 0 or (s == 4 and r.randf() < 0.8) or r.randf() < 0.35 + 0.05 * rep: steps.append(s)
	var moves: Array = []
	for s in 8: moves.append([-1, 1, 2, -2, 0, 1, -1][r.randi() % 7])
	return {"steps": steps, "moves": moves, "start": [0, 2, 4][r.randi() % 3]}

# ---------------------------------------------------------------- pads
static func _chord(dst: PackedFloat32Array, t: Dictionary, deg: int, t0: float, bar: float, energy: float, rep: int, r: RandomNumberGenerator) -> void:
	var tones := [0, 2, 4] + ([6] if energy > 0.55 else []) + ([7] if rep > 0 and energy > 0.65 else [])   # opens up on louder passes and repeats
	var dur := bar * 1.15
	for k in tones:
		var f := _f(t, deg + int(k), 0); var nb := int(dur * MRATE); var note := PackedFloat32Array(); note.resize(nb)
		var p1 := r.randf(); var p2 := r.randf(); var p3 := r.randf(); var g := 0.10 + 0.04 * energy
		var atk := 0.9 if str(t.pad) == "warm" else (1.6 if str(t.pad) == "glass" else 0.25)
		for i in nb:
			var tt := float(i) / MRATE
			var env := minf(1.0, tt / atk) * minf(1.0, (dur - tt) / 0.9)
			p1 += f / MRATE; p2 += f * 1.004 / MRATE; p3 += f * 2.0 / MRATE
			var s := 0.0
			match str(t.pad):
				"warm": s = sin(TAU * p1) + sin(TAU * p2) + 0.2 * sin(TAU * p3)
				"glass": s = (sin(TAU * p1) + 0.3 * sin(TAU * 3.0 * p1)) * (1.0 + 0.25 * sin(TAU * 4.5 * tt))
				"reed":   # odd harmonics, a little nasal; short attack so the chords pump with the tempo
					var a := TAU * p1; s = sin(a) + 0.33 * sin(3.0 * a) + 0.2 * sin(5.0 * a) + 0.5 * sin(TAU * p2)
					env *= 0.75 + 0.25 * cos(TAU * tt * 2.0 / (bar / 2.0))
			note[i] = s * env * g
		GA._add(dst, note, t0, 1.0, MRATE)

static func _drone(dst: PackedFloat32Array, t: Dictionary, prog: Array, t0: float, bar: float, energy: float) -> void:
	# root and fifth held through the section, breathing slowly; the chord's third added a bar at a time over it
	var dur := prog.size() * bar + 1.5; var nb := int(dur * MRATE); var note := PackedFloat32Array(); note.resize(nb)
	var fr := _f(t, int(prog[0]), -1); var p1 := 0.0; var p2 := 0.0; var p3 := 0.0
	for i in nb:
		var tt := float(i) / MRATE; var env := minf(1.0, tt / 3.0) * minf(1.0, (dur - tt) / 1.5)
		var breathe := 0.7 + 0.3 * sin(TAU * tt / (bar * 2.0))
		p1 += fr / MRATE; p2 += fr * 1.498 / MRATE; p3 += fr * 2.003 / MRATE
		note[i] = (sin(TAU * p1) + 0.6 * sin(TAU * p2) + 0.35 * sin(TAU * p3)) * env * breathe * (0.16 + 0.05 * energy)
	GA._add(dst, note, t0, 1.0, MRATE)
	for k in prog.size():
		var f3 := _f(t, int(prog[k]) + 2, 0); var d := bar * 1.1; var n3 := int(d * MRATE); var nt := PackedFloat32Array(); nt.resize(n3); var q := 0.0
		for i in n3:
			var tt := float(i) / MRATE; q += f3 / MRATE
			nt[i] = (sin(TAU * q) + 0.15 * sin(TAU * 3.0 * q)) * minf(1.0, tt / 1.2) * minf(1.0, (d - tt) / 1.0) * 0.07
		GA._add(dst, nt, t0 + k * bar, 1.0, MRATE)

# ---------------------------------------------------------------- bass
static func _bass_note(dst: PackedFloat32Array, f: float, at: float, dur: float, amp: float) -> void:
	var bn := GA._buf(dur, MRATE); var pb := 0.0
	for i in bn.size():
		var tt := float(i) / MRATE; pb += f / MRATE
		bn[i] = (sin(TAU * pb) + 0.25 * sin(TAU * 2.0 * pb)) * amp * minf(1.0, tt / 0.03) * minf(1.0, (dur - tt) / minf(0.4, dur * 0.4))
	GA._add(dst, bn, at, 1.0, MRATE)

static func _bass(dst: PackedFloat32Array, t: Dictionary, deg: int, next_deg: int, t0: float, beat: float, energy: float) -> void:
	var a := 0.24 + 0.08 * energy
	match str(t.bass):
		"whole": _bass_note(dst, _f(t, deg, -1), t0, beat * 3.8, a)
		"pulse8":   # eighth-note pulse on the root, octave on the off-beat of 4
			for e in 8: _bass_note(dst, _f(t, deg, -1) * (2.0 if e == 7 else 1.0), t0 + e * beat * 0.5, beat * 0.42, a * (0.9 if e % 2 == 0 else 0.6))
		"ostinato":   # root, fifth, octave, fifth: the same figure under every chord
			for e in 4: _bass_note(dst, _f(t, deg + [0, 4, 7, 4][e], -1), t0 + e * beat, beat * 0.9, a * (1.0 if e == 0 else 0.7))
		"walk":   # quarter notes walking to the next chord's root
			var steps := [deg, deg + 2, deg + 4, next_deg + (1 if next_deg < deg else -1)]
			for e in 4: _bass_note(dst, _f(t, int(steps[e]), -1), t0 + e * beat, beat * 0.85, a * 0.85)

# ---------------------------------------------------------------- percussion
static func _perc(dst: PackedFloat32Array, t: Dictionary, t0: float, beat: float, energy: float, last: bool, r: RandomNumberGenerator) -> void:
	var g := 0.6 + 0.4 * energy
	match str(t.perc):
		"brush":   # soft kick on 1 and 3, rim on 4-and, brushed eighths
			for k in [0, 2]: GA._add(dst, GA._thump(85.0, 48.0, 22.0, 11.0, 0.9, 0.3, MRATE), t0 + k * beat, g, MRATE)
			GA._add(dst, GA._bp(GA._nb(r, 0.03, 160.0, 0.5, MRATE), 1100.0, 1100.0, 3.0, MRATE), t0 + 3.5 * beat, g, MRATE)
			for e in 8: GA._add(dst, GA._hp(GA._nb(r, 0.09, 45.0, 0.3 if e % 2 == 1 else 0.16, MRATE), 3000.0, MRATE), t0 + e * beat * 0.5, g, MRATE)
		"pulse":   # four-on-the-floor felt kick, shaker sixteenths
			for k in 4: GA._add(dst, GA._thump(70.0, 44.0, 26.0, 14.0, 0.75, 0.25, MRATE), t0 + k * beat, g, MRATE)
			for e in 16: GA._add(dst, GA._hp(GA._nb(r, 0.05, 70.0, 0.22 if e % 4 == 2 else 0.1, MRATE), 5000.0, MRATE), t0 + e * beat * 0.25, g, MRATE)
		"sparse":   # one low tom per bar, a soft swell into the next bar
			GA._add(dst, GA._thump(110.0, 70.0, 10.0, 6.0, 0.7, 0.6, MRATE), t0, g, MRATE)
			GA._add(dst, GA._lp(GA._nb(r, 1.2, 1.5, 0.12, MRATE), 900.0, MRATE), t0 + 2.8 * beat, g, MRATE)
		"tick":   # syncopated rim ticks, no kick except on 1
			GA._add(dst, GA._thump(90.0, 55.0, 25.0, 16.0, 0.6, 0.2, MRATE), t0, g, MRATE)
			for e in [1, 3, 6, 7]: GA._add(dst, GA._bp(GA._nb(r, 0.025, 200.0, 0.45, MRATE), 1900.0, 1900.0, 4.0, MRATE), t0 + e * beat * 0.5, g, MRATE)
			for e in 8: GA._add(dst, GA._hp(GA._nb(r, 0.04, 90.0, 0.12, MRATE), 6000.0, MRATE), t0 + e * beat * 0.5 + 0.02, g, MRATE)
	if last:   # a fill into the next section
		for e in 4: GA._add(dst, GA._thump(160.0 - e * 22.0, 90.0 - e * 10.0, 14.0, 10.0, 0.5, 0.25, MRATE), t0 + (3.0 + e * 0.25) * beat, g * 0.8, MRATE)

# ---------------------------------------------------------------- lead
static func _lead(dst: PackedFloat32Array, t: Dictionary, deg: int, t0: float, beat: float, motif: Dictionary, k: int, last: bool, rep: int, r: RandomNumberGenerator) -> void:
	var cur := deg + int(motif.start) + 7
	for s in 8:
		if not (s in motif.steps): continue
		if s == 0: cur = deg + int(motif.start) + 7
		else: cur += int(motif.moves[s])
		if last and s >= 4: cur = deg + 7 + (2 if rep % 2 == 1 else 0)   # the last bar answers (home on the first pass, a third up on the next)
		cur = clampi(cur, deg + 4, deg + 12)
		var f := _f(t, cur, 1 if str(t.lead) != "flute" else 0)
		var at := t0 + s * beat * 0.5; var len_s := beat * (2.0 if str(t.lead) == "flute" else 1.0)
		GA._add(dst, _voice(str(t.lead), f, len_s, r), at, 0.5, MRATE)

static func _voice(kind: String, f: float, len_s: float, r: RandomNumberGenerator) -> PackedFloat32Array:
	match kind:
		"musicbox":
			var mb := GA._buf(1.4, MRATE)
			GA._add(mb, GA._modal(f, 3.2, 1.0, 1.4, MRATE), 0.0, 1.0, MRATE); GA._add(mb, GA._modal(f * 4.0, 11.0, 0.18, 0.5, MRATE), 0.0, 1.0, MRATE)
			GA._add(mb, GA._modal(f * 2.76, 14.0, 0.12, 0.4, MRATE), 0.0, 1.0, MRATE)
			return mb
		"pluck":   # harmonics that die faster the higher they are
			var b := GA._buf(0.9, MRATE)
			for h in range(1, 7): GA._add(b, GA._modal(f * h, 4.0 + 3.0 * h, 1.0 / h, 0.9, MRATE), 0.0, 1.0, MRATE)
			return b
		"bell":
			var b := GA._buf(1.8, MRATE)
			for p in [[1.0, 2.0, 1.0], [2.0, 3.5, 0.5], [2.76, 5.0, 0.35], [5.4, 9.0, 0.15]]: GA._add(b, GA._modal(f * p[0], p[1], p[2], 1.8, MRATE), 0.0, 1.0, MRATE)
			return b
		_:   # flute: a breathy sine with delayed vibrato
			var b := GA._buf(len_s, MRATE); var ph := 0.0
			for i in b.size():
				var tt := float(i) / MRATE; var vib := 1.0 + 0.006 * sin(TAU * 5.2 * tt) * minf(1.0, tt / 0.4)
				ph += f * vib / MRATE
				b[i] = (sin(TAU * ph) + 0.08 * r.randf_range(-1.0, 1.0)) * minf(1.0, tt / 0.08) * minf(1.0, (len_s - tt) / 0.25) * 0.8
			return b

static func _fade(b: PackedFloat32Array, fin: float, fout: float) -> void:
	var n := b.size()
	for i in n: b[i] *= minf(1.0, minf(float(i) / (MRATE * fin), float(n - i) / (MRATE * fout)))
