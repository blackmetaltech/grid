class_name Career
extends RefCounted
## Career "The Utility": the entry points (title line, job board row, CB_CAREER hook), the saved career code (user://grid_career.cfg: the code replays the whole career, so it is the save) and the
## screen's lifecycle. The engine owns the career; this file only starts, loads and quits it through the bridge.

static var path := "user://grid_career.cfg"

static func T(key: String) -> String: return TranslationServer.translate(key)

# ---- the saved code ---------------------------------------------------------------------------------------------------------------
## {code, year, quarter, score} or {} when nothing is saved.
static func saved() -> Dictionary:
	var c := ConfigFile.new()
	if c.load(path) != OK: return {}
	var code := str(c.get_value("c", "code", ""))
	if code == "": return {}
	return {"code": code, "year": int(c.get_value("c", "year", 1)), "quarter": int(c.get_value("c", "quarter", 1)), "score": int(c.get_value("c", "score", 0))}

## Write the running career's code (called after every action). Smoke and test runs set CbSettings.persist false and write nothing unless `path` was redirected.
static func save(app: CbApp) -> void:
	if not CbSettings.persist and path == "user://grid_career.cfg": return
	var q = app.b.q("career")
	if not (q is Dictionary) or not q.get("active", false): return
	var c := ConfigFile.new()
	c.set_value("c", "code", str(q.code)); c.set_value("c", "year", int(q.year)); c.set_value("c", "quarter", int(q.quarter)); c.set_value("c", "score", int(q.score))
	c.save(path)

static func forget() -> void:
	if FileAccess.file_exists(path): DirAccess.remove_absolute(path)

# ---- lifecycle ---------------------------------------------------------------------------------------------------------------------
static func screen(app: CbApp) -> CareerScreen:
	var n := app.root.get_node_or_null("career")
	return n as CareerScreen if n is CareerScreen and not (n as Node).is_queued_for_deletion() else null

static func _open_screen(app: CbApp) -> CareerScreen:
	var old := screen(app)
	if old != null: app.root.remove_child(old); old.queue_free()
	var sc := CareerScreen.new(); sc.app = app; app.root.add_child(sc); sc.build()
	return sc

## A new career in a fresh district (seed: optional). Replaces the saved one.
static func start(app: CbApp, seed_ = null) -> CareerScreen:
	var r: Dictionary = app.b.act("careerStart", [seed_] if seed_ != null else [])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "bad"); return null
	save(app)
	return _open_screen(app)

## Carry on from a career code (the saved one by default); the ending sheet shows again for a finished career.
static func cont(app: CbApp, code := "") -> CareerScreen:
	if code == "": code = str(saved().get("code", ""))
	var r: Dictionary = app.b.act("careerLoad", [code])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", T("CAR_ERR_LOAD"))), "bad"); return null
	var sc := _open_screen(app)
	if sc != null and sc.d.get("ending") != null: CareerSheets.ending(sc)
	return sc

## The entry docket: New career / Continue. Opened from the title line and the job board.
static func open(app: CbApp) -> void:
	GridUi.load_strings()
	var compact := PaperKit.compact(app)
	var sv := saved()
	var d := PaperKit.sheet(app, "career_entry", minf(700.0, app.vw() - 24.0), 0.0, 0.72, 16.0 if compact else 30.0)
	var host: Control = d.host; var vb: VBoxContainer = d.vb
	vb.add_theme_constant_override("separation", 8 if compact else 12)
	vb.add_child(PaperKit.lbl(T("CAR_TITLE").to_upper(), 36 if compact else 54, "title", PaperKit.INK))
	vb.add_child(PaperKit.lbl(T("CAR_ENTRY_SUB"), 15 if compact else 19, "sans", Color(PaperKit.INK, 0.8), true))
	vb.add_child(PaperKit.rule())
	var go: Button = null
	if not sv.is_empty():
		go = PaperKit.btn(T("CAR_CONTINUE_AT") % [int(sv.year), int(sv.quarter), int(sv.score)], true, func(): host.queue_free(); cont(app), 19 if compact else 22); go.name = "Continue"; vb.add_child(go)
	var nw := PaperKit.btn(T("CAR_NEW_REPLACES") if not sv.is_empty() else T("CAR_NEW"), sv.is_empty(), func(): host.queue_free(); start(app), 19 if compact else 22); nw.name = "New"; vb.add_child(nw)
	var cl := PaperKit.btn(T("CAR_CLOSE"), false, func(): host.queue_free(), 18); cl.name = "Close"; vb.add_child(cl)
	(host as PaperHost).closer = func(): host.queue_free()
	(host as PaperHost).primary = go if go != null else nw
	PaperKit.slide_in(d, 50.0)
	app.focus_dialog()
	CareerKit.focus_later(go if go != null else nw)

## The job board's Career row (above the chapters).
static func jobs_row(app: CbApp, host: Control, compact: bool) -> Button:
	var sv := saved()
	var b := PaperKit.btn("", false, func(): host.queue_free(); open(app), 18)
	b.name = "CareerRow"; b.custom_minimum_size = Vector2(0, 68 if compact else 92); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.clip_text = true
	var hb := HBoxContainer.new(); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE; hb.add_theme_constant_override("separation", 14); hb.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hb.offset_left = 16; hb.offset_right = -14; hb.offset_top = 6; hb.offset_bottom = -6; b.add_child(hb)
	var mid := VBoxContainer.new(); mid.mouse_filter = Control.MOUSE_FILTER_IGNORE; mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL; mid.alignment = BoxContainer.ALIGNMENT_CENTER; mid.add_theme_constant_override("separation", 0); hb.add_child(mid)
	mid.add_child(PaperKit.lbl(T("CAR_TITLE"), 26, "title", PaperKit.INK))
	var br := PaperKit.lbl(T("CAR_JOBS_SAVED") % [int(sv.year), int(sv.quarter)] if not sv.is_empty() else T("CAR_JOBS_BRIEF"), 15, "sans", Color(PaperKit.INK, 0.72), true)
	br.max_lines_visible = 1 if compact else 2; br.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; mid.add_child(br)
	return b

## QA / desk hook, CB_CAREER=<what>: "1" opens the entry docket, "new[:seed]" starts a career, "continue" carries on from the saved code, "code:<C1/...>" loads a code.
static func qa(app: CbApp, what: String) -> void:
	if what == "new" or what.begins_with("new:"): start(app, int(what.substr(4)) if what.length() > 4 else null)
	elif what == "continue": cont(app)
	elif what.begins_with("code:"): cont(app, what.substr(5))
	else: open(app)
