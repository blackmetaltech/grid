class_name ChfEnd
extends RefCounted
## The game-end card after L28 (the story payoff): "The lights stayed on", Nia's exam, Tobi's last line, Ada's blessing, the finale's lamps, and no next chapter: stay on the desk or open the jobs.
static var node: Control = null

static func is_open() -> bool: return node != null and is_instance_valid(node) and not node.is_queued_for_deletion()

static func open(app: CbApp) -> void:
	GridUi.load_strings()
	if is_open(): return
	if app.end_ui != null and is_instance_valid(app.end_ui): app.end_ui.queue_free()
	app.end_ui = null; app.end_seen = true
	var compact := PaperKit.compact(app)
	var d := PaperKit.sheet(app, "chapter", minf(780.0, app.vw() - 24.0), 0.0, 0.55, 14.0 if compact else 30.0)
	node = d.host
	app.sfx("page")
	var host: PaperHost = d.host
	host.closer = func(): close(app)
	var vb: VBoxContainer = d.vb; vb.add_theme_constant_override("separation", 4 if compact else 10)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 4 if compact else 10); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; vb.add_child(col)
	col.add_child(PaperKit.lbl(TranslationServer.translate("CF_END_TITLE").to_upper(), 34 if compact else 56, "title", PaperKit.INK, true))
	col.add_child(PaperKit.lbl(TranslationServer.translate("CF_END_SUB"), 15 if compact else 18, "semi", Color(PaperKit.INK, 0.75), true))
	col.add_child(PaperKit.rule())
	var nia := ShiftReport._note(TranslationServer.translate("CF_END_NIA"), ShiftReport.PaperPen.NIA, TranslationServer.translate("CH_NIA_TAG"), compact); nia.name = "NiaNote"; col.add_child(nia)
	var two := HBoxContainer.new(); two.add_theme_constant_override("separation", 14); col.add_child(two)
	var ada := ShiftReport._note(TranslationServer.translate("CF_END_ADA"), PaperKit.SPEAKER["ADA"], TranslationServer.translate("CF_END_ADA_TAG"), compact); ada.name = "AdaNote"; two.add_child(ada)
	var tobi := ShiftReport._note(TranslationServer.translate("CF_END_TOBI"), PaperKit.SPEAKER["TOBI"], TranslationServer.translate("CF_END_TOBI_TAG"), compact); tobi.name = "TobiNote"; two.add_child(tobi)
	var lr := PaperKit.lbl(TranslationServer.translate("CF_END_LAMPS") % GridSettings.stars("L28"), 16 if compact else 20, "semi", PaperKit.INK, true); lr.name = "FinaleLamps"; col.add_child(lr)
	vb.add_child(PaperKit.rule())
	var row := HFlowContainer.new(); row.add_theme_constant_override("h_separation", 12); vb.add_child(row)
	var st := PaperKit.btn(TranslationServer.translate("CF_END_STAY"), true, func(): close(app), 20); st.name = "Stay"; row.add_child(st)
	var jb := PaperKit.btn(TranslationServer.translate("CF_END_JOBS"), false, func(): close(app); Jobs.open(app), 20); jb.name = "FinaleJobs"; row.add_child(jb)
	host.primary = st
	PaperKit.slide_in(d, 60.0)
	app.focus_dialog()
	st.call_deferred("grab_focus")

static func close(app: CbApp) -> void:
	if is_open(): node.queue_free()
	node = null; app.end_seen = true
