extends RefCounted
## 1.9 text audit: every screen at 1920x1080 (desktop) and 1280x800 (handheld), no visible text under 16 px on screen.
## Run inside the real app: CB_TEXTAUDIT=1 godot --headless --path godot (scripts/test-godot.mjs runs it). Screens: the title, Jobs, every level's
## work order and opening view, the pause menu, settings, a shift report (L01 lost), the Career board. Two kinds of text are measured:
## Controls (Label, Button, LineEdit, RichTextLabel: their font size x canvas scale x window stretch) and hand-drawn strings, which all go
## through GridText.ds / dm and record their smallest on-screen size while GridText.audit is on.
## CB_TEXTAUDIT_ONLY=L20,career limits the screens; CB_TEXTAUDIT_MIN changes the floor (default 16).

const RESES := [[Vector2i(1920, 1080), "desktop"], [Vector2i(1280, 800), "handheld"]]
static var fails := 0
static var checks := 0
static var floor_px := 16.0
static var only: PackedStringArray = []

static func _frames(app: CbApp, n := 3) -> void:
	for i in n: await app.get_tree().process_frame

static func _want(tag: String) -> bool:
	return only.is_empty() or only.has(tag)

static func _px_of(c: Control) -> float:
	var sz := 16
	if c is Label and (c as Label).label_settings != null: sz = (c as Label).label_settings.font_size
	elif c is RichTextLabel: sz = c.get_theme_font_size("normal_font_size")
	else: sz = c.get_theme_font_size("font_size")
	return float(sz) * c.get_global_transform_with_canvas().get_scale().y * c.get_viewport().get_final_transform().get_scale().y

static func _text_of(c: Control) -> String:
	if c is Label: return (c as Label).text
	if c is Button: return (c as Button).text
	if c is LineEdit: return (c as LineEdit).text if (c as LineEdit).text != "" else (c as LineEdit).placeholder_text
	if c is RichTextLabel: return (c as RichTextLabel).get_parsed_text()
	return ""

static func _walk(n: Node, out: Array) -> void:
	for ch in n.get_children():
		if ch is CanvasItem and not (ch as CanvasItem).visible: continue
		out.append(ch); _walk(ch, out)

static func audit(app: CbApp, tag: String) -> void:
	GridText.seen.clear(); GridText.clipped.clear(); GridText.audit = true
	var all: Array = []; _walk(app.get_tree().root, all)
	for n in all: if n is CanvasItem: (n as CanvasItem).queue_redraw()
	await _frames(app, 3)
	GridText.audit = false
	var vp := Rect2(Vector2.ZERO, app.get_viewport().get_visible_rect().size)
	var bad: Array = []
	for n in all:
		if not (n is Control) or not is_instance_valid(n) or not (n as Control).is_visible_in_tree(): continue
		var c := n as Control
		var t := _text_of(c).strip_edges()
		if t == "" or c.modulate.a < 0.05: continue
		var r := c.get_global_rect()
		if r.size.x < 2.0 or r.size.y < 2.0 or not r.intersects(vp): continue
		var px := _px_of(c)
		checks += 1
		if px < floor_px - 0.01: bad.append("%s %.1f px '%s' (%s)" % [c.get_class(), px, t.left(36).replace("\n", " "), str(c.get_path()).get_file()])
	for k in GridText.seen:
		checks += 1
		var e: Array = GridText.seen[k]
		if float(e[0]) < floor_px - 0.01: bad.append("drawn %.1f px '%s' (%s)" % [float(e[0]), str(e[1]).replace("\n", " "), k])
	for k in GridText.clipped:
		checks += 1; bad.append("clipped %s (%s)" % [GridText.clipped[k], k])
	for b in bad:
		fails += 1; print("  FAIL text %s: %s" % [tag, b])

## The pad hint strip (pad mode on) stays inside the window and never overlaps another visible piece of text.
static func pad_strip(app: CbApp, tag: String) -> void:
	if app.pad == null or app.get("chrome") == null: return
	app.pad.set_active(true); await _frames(app, 4)
	var hr: Rect2 = app.chrome.hint_rect()
	var vp := Rect2(Vector2.ZERO, app.get_viewport().get_visible_rect().size)
	checks += 1
	if hr.size == Vector2.ZERO or not vp.encloses(hr): fails += 1; print("  FAIL layout %s: the pad strip %s is not inside the window %s" % [tag, str(hr), str(vp.size)])
	var all: Array = []; _walk(app.get_tree().root, all)
	for n in all:
		if not (n is Control) or n == app.pad.hint or not (n as Control).is_visible_in_tree(): continue
		var c := n as Control
		if _text_of(c).strip_edges() == "" or c.modulate.a < 0.05: continue
		var r := c.get_global_rect()
		if r.size.x > vp.size.x * 0.5 and r.size.y > vp.size.y * 0.5: continue
		checks += 1
		if r.grow(-1.0).intersects(hr): fails += 1; print("  FAIL layout %s: the pad strip %s overlaps '%s' (%s at %s)" % [tag, str(hr), _text_of(c).left(30), c.name, str(r)])
	# hand-drawn text panels: the chapter panels and trays draw their own words, so their whole rect must stay clear
	for nm in ["ch2", "ch4", "ch7", "ch8", "tray", "rtray", "gtray", "breaker", "instruments"]:
		var p = app.chrome.get(nm)
		if p is Control and (p as Control).is_visible_in_tree():
			checks += 1
			var pr := (p as Control).get_global_rect()
			if pr.grow(-1.0).intersects(hr) and not (pr.size.x > vp.size.x * 0.8 and pr.size.y > vp.size.y * 0.8): fails += 1; print("  FAIL layout %s: the pad strip overlaps %s (%s vs %s)" % [tag, nm, str(hr), str(pr)])
	app.pad.set_active(false); await _frames(app, 2)

static func _size(app: CbApp, res: Vector2i, kind: String) -> void:
	CbLayout.forced = kind
	app.get_window().size = res
	await _frames(app, 6)

## The 3D bench screen of a chapter-2 bench job: Bench3D is built in this headless tree (as bench3d_truth does), the job restarts so WorldView
## routes it there and the stage takes its glass path, the text is audited, and the scene is taken away again so later jobs see the classic path.
static func bench3d_view(app: CbApp, id: String, at: String) -> void:
	var wv = app.get("grid_world")
	if wv == null: return
	var made := false
	if wv.bench3d == null:
		var bn := Bench3D.new(); bn.name = "Bench3DAudit"; bn.visible = false; app.add_child(bn); wv.bench3d = bn; made = true
	app.start_level(id, true); await _frames(app, 5)
	if WorkOrder.is_open(): WorkOrder.close_now(); await _frames(app, 4)
	var ch2 = app.get("chrome").get("ch2") if app.get("chrome") != null else null
	if ch2 != null: ch2.refresh()
	await _frames(app, 4)
	checks += 1
	if not (wv.look3d == wv.bench3d and wv.bench3d.visible): fails += 1; print("TEXT FAIL %s: the 3D bench is not showing for the audit" % id)
	await audit(app, "%s 3D bench%s" % [id, at])
	if made:
		var bn2 = wv.bench3d; wv.bench3d = null; wv.look3d = wv.get("prov3d")
		(bn2 as Node).queue_free()
		app.start_level(id, true); await _frames(app, 4)
		if WorkOrder.is_open(): WorkOrder.close_now(); await _frames(app, 2)

static func run(app: CbApp) -> void:
	floor_px = float(OS.get_environment("CB_TEXTAUDIT_MIN")) if OS.get_environment("CB_TEXTAUDIT_MIN") != "" else 16.0
	if OS.get_environment("CB_TEXTAUDIT_ONLY") != "": only = OS.get_environment("CB_TEXTAUDIT_ONLY").split(",")
	app.quiet = true
	var ids: Array = []
	for lv in app.b.levels(): ids.append(str(lv.id))
	for rk in RESES:
		var res: Vector2i = rk[0]; var kind: String = rk[1]
		var at := "@%dx%d" % [res.x, res.y]
		await _size(app, res, kind)
		if _want("title"): app.to_title(); await _frames(app, 4); await audit(app, "title" + at)
		if _want("jobs"):
			Jobs.open(app); await _frames(app, 4); await audit(app, "jobs" + at)
			app.back(); await _frames(app, 2)
		for id in ids:
			if not _want(id) and not _want("levels"): continue
			app.start_level(id, true); await _frames(app, 5)
			if WorkOrder.is_open(): await audit(app, "%s work order%s" % [id, at]); WorkOrder.close_now(); await _frames(app, 4)
			await audit(app, "%s opening view%s" % [id, at])
			await pad_strip(app, "%s pad strip%s" % [id, at])
			if Bench3D.LEVELS.has(id):   # 1.19: the same job in its 3D bench (glass instruments and place chips), which a headless run never builds by itself
				await bench3d_view(app, id, at)
		if _want("menu"):
			app.start_level("L07", true); await _frames(app, 4)
			if WorkOrder.is_open(): WorkOrder.close_now(); await _frames(app, 2)
			app.menus.menu(); await _frames(app, 4); await audit(app, "pause menu" + at)
			app.back(); await _frames(app, 2)
			app.open_settings(); await _frames(app, 4); await audit(app, "settings" + at)
			app.back(); await _frames(app, 2)
		if _want("report"):
			app.start_level("L01", true); await _frames(app, 4)
			if WorkOrder.is_open(): WorkOrder.close_now(); await _frames(app, 2)
			for i in 40:
				if str(app.b.g.get("status", "playing")) != "playing": break
				app.b.act("tick", [1])
			await _frames(app, 8)
			await audit(app, "shift report (L01 lost)" + at)
		if _want("career"):
			app.to_title(); await _frames(app, 3)
			CareerScreen.guide_all = false
			for ch in ["standard", "city", "moor"]:   # 1.10: every district's ground and labels
				Career.start(app, 11, ch); await _frames(app, 6); await audit(app, "career quarter 1 (%s)%s" % [ch, at])
				var sc := Career.screen(app)
				if sc != null: sc.queue_free(); await _frames(app, 2)
	print("TEXT-FLOW checks=%d" % checks)
	print("TEXT-FLOW OK" if fails == 0 else "TEXT-FLOW FAILED %d" % fails)
