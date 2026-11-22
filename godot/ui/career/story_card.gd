class_name StoryCard
extends RefCounted
## 1.9 a letter or a call from one of the district's people: who, a title, what they say, two answers with what each costs or does,
## and what happens if you say nothing. Paper card, ink text, 16 px and up. Display only: the answer goes to the engine (careerStory).

static func T(key: String) -> String: return TranslationServer.translate(key)

static func make(b: Dictionary, answer: Callable, compact: bool) -> PanelContainer:
	var pc := PanelContainer.new(); pc.name = "Story_" + str(b.id); pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var st := CareerKit.sb(Color("#F6EEDA"), Color("#6B4A2A"), 2, 3, 16.0, 12.0); st.shadow_color = Color(0, 0, 0, 0.35); st.shadow_size = 4; st.shadow_offset = Vector2(1, 3)
	pc.add_theme_stylebox_override("panel", st)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 6); pc.add_child(v)
	var ink := GridTheme.PAPER_INK
	var who := GridTheme.label(str(b.whoName), 16, Color(ink, 0.7), "mono"); v.add_child(who)
	var ttl := GridTheme.label(str(b.title), 22 if not compact else 20, Color("#8A3A1E"), "title"); ttl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(ttl)
	var body := GridTheme.label(str(b.body), 18 if not compact else 17, ink, "sans")
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; body.name = "StoryBody"; v.add_child(body)
	for opt in ["a", "b"]:
		var row := VBoxContainer.new(); row.add_theme_constant_override("separation", 0); v.add_child(row)
		var bt := PaperKit.btn(str(b[opt]), opt == "a", answer.bind(opt), 17 if not compact else 16); bt.name = "Story_%s_%s" % [str(b.id), opt]
		bt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bt.alignment = HORIZONTAL_ALIGNMENT_LEFT; row.add_child(bt)
		var fx := str(b[opt + "Fx"])
		if fx != "":
			var fl := GridTheme.label(fx, 16, Color(ink, 0.72), "mono"); fl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; row.add_child(fl)
	var lp := GridTheme.label(T("CAR_STORY_LAPSE"), 16, Color(ink, 0.55), "sans"); lp.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(lp)
	return pc
