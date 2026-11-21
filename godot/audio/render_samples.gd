extends SceneTree
## Render every GRID sound to WAV for listening and assert basic sanity.
## godot --headless --path godot -s audio/render_samples.gd [-- out_dir]
## Default output: the user data dir (pass an output dir after `--` to choose; tools/audio/analyse_audio.py reads it).
var OUT := OS.get_user_data_dir() + "/audio/"
const GA = preload("res://audio/grid_audio.gd")
var fails := 0

func _init() -> void:
	var out := OUT
	var args := OS.get_cmdline_user_args()
	if args.size() > 0: out = args[0] if args[0].ends_with("/") else args[0] + "/"
	DirAccess.make_dir_recursive_absolute(out)
	var kinds: Array = []
	for k in GA.ONE_SHOTS:
		if k == "plink": for i in 10: kinds.append("plink%d" % i)
		else: kinds.append(k)
	for k in kinds:
		var a := GA.render_oneshot(k); var b := GA.render_oneshot(k)
		var st := _report("sfx_" + k, a, GA.RATE, out)
		_check(a == b, "%s deterministic" % k)
		_check(st.peak > 0.3 and st.rms > 0.005, "%s non-silent" % k)
		_check(float(a.size()) / GA.RATE < 0.8, "%s shorter than 0.8 s (%.3f)" % [k, float(a.size()) / GA.RATE])
		_check(absf(st.peak - GA.PEAK_N6) < 0.01, "%s peak at -6 dBFS" % k)
	var h50 := GA.render_hum(50.0, 0.6, 10.0)
	var h49 := GA.render_hum(49.0, 0.6, 10.0)
	_check(h50 == GA.render_hum(50.0, 0.6, 10.0), "hum deterministic")
	_report("hum_50Hz", h50, GA.HUM_RATE, out); _report("hum_49Hz", h49, GA.HUM_RATE, out)
	_report("hum_dip_50_49_50", GA.render_hum_dip(10.0), GA.HUM_RATE, out)
	_report("hum_lowload", GA.render_hum(50.0, 0.0, 4.0), GA.HUM_RATE, out)
	_report("hum_fullload", GA.render_hum(50.0, 1.0, 4.0), GA.HUM_RATE, out)
	_report("room_tone_dc", GA.render_hum(50.0, 0.3, 6.0, "dc"), GA.HUM_RATE, out)
	var fund := _dominant(h49, GA.HUM_RATE, 60.0, 140.0)
	var fund50 := _dominant(h50, GA.HUM_RATE, 60.0, 140.0)
	print("hum 49 Hz fundamental = %.2f Hz (want 98 +- 1); 50 Hz = %.2f Hz" % [fund, fund50])
	_check(absf(fund - 98.0) <= 1.0, "49 Hz hum fundamental 98 +- 1")
	_check(absf(fund50 - 100.0) <= 1.0, "50 Hz hum fundamental 100 +- 1")
	# 1.7 music catalogue: every track rendered in full, with all stems (stress 1, cute) and as the calm mix (pad and bass only)
	var GM = load("res://audio/grid_music.gd")
	for ti in GM.count():
		var st: Dictionary = GM.render_track(ti); var secs: float = GM.seconds(ti)
		_check(secs >= 120.0, "%s is at least 2 minutes (%.1f s)" % [st.id, secs])
		_report("music_%d_%s_full" % [ti + 1, st.id], GA.mix_music(st, (st.pad as PackedFloat32Array).size() / float(GA.MRATE), 1.0, true), GA.MRATE, out)
		_report("music_%d_%s_calm" % [ti + 1, st.id], GA.mix_music(st, (st.pad as PackedFloat32Array).size() / float(GA.MRATE), 0.0, false), GA.MRATE, out)
	var a1: Dictionary = GM.render_track(2); var a2: Dictionary = GM.render_track(2)
	_check(a1.pad == a2.pad and a1.lead == a2.lead and a1.perc == a2.perc, "music deterministic")
	print("RESULT: %s (%d failures)" % ["PASS" if fails == 0 else "FAIL", fails])
	quit(1 if fails > 0 else 0)

func _check(ok: bool, msg: String) -> void:
	if not ok: fails += 1; printerr("FAIL: " + msg)

func _report(name: String, buf: PackedFloat32Array, rate: int, dir: String) -> Dictionary:
	var pk := 0.0; var sq := 0.0; var bad := false
	for v in buf:
		if is_nan(v) or is_inf(v): bad = true; continue
		pk = maxf(pk, absf(v)); sq += v * v
	var rms := sqrt(sq / maxf(1.0, buf.size()))
	_check(not bad, name + " has NaN/inf"); _check(pk <= 0.95, name + " clips (peak %.3f)" % pk)
	_write_wav(dir + name + ".wav", buf, rate)
	print("%-24s %6.2fs peak %.3f (%.1f dBFS) rms %.4f (%.1f dBFS)" % [name, float(buf.size()) / rate, pk, 20.0 * log(maxf(pk, 1e-9)) / log(10.0), rms, 20.0 * log(maxf(rms, 1e-9)) / log(10.0)])
	return {"peak": pk, "rms": rms}

func _write_wav(path: String, buf: PackedFloat32Array, rate: int) -> void:
	var d := PackedByteArray(); d.resize(buf.size() * 2)
	for i in buf.size(): d.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32000.0))
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null: _check(false, "cannot write " + path); return
	f.store_buffer("RIFF".to_ascii_buffer()); f.store_32(36 + d.size()); f.store_buffer("WAVEfmt ".to_ascii_buffer())
	f.store_32(16); f.store_16(1); f.store_16(1); f.store_32(rate); f.store_32(rate * 2); f.store_16(2); f.store_16(16)
	f.store_buffer("data".to_ascii_buffer()); f.store_32(d.size()); f.store_buffer(d); f.close()

## Strongest frequency in [lo, hi] Hz over the last 6 s (Goertzel scan, 0.05 Hz steps).
func _dominant(buf: PackedFloat32Array, rate: int, lo: float, hi: float) -> float:
	var start := maxi(0, buf.size() - 6 * rate); var best_f := lo; var best := -1.0
	var f := lo
	while f <= hi:
		var w := TAU * f / rate; var co := 2.0 * cos(w); var s1 := 0.0; var s2 := 0.0
		for i in range(start, buf.size()):
			var s := buf[i] + co * s1 - s2; s2 = s1; s1 = s
		var p := s1 * s1 + s2 * s2 - co * s1 * s2
		if p > best: best = p; best_f = f
		f += 0.05
	return best_f
