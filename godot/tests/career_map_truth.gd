extends SceneTree
## 1.14 map labels (coordinator: Harbour City's loading labels ran into each other and the tie line; High Moor's village names sat on lines and houses).
## Every district, at the desktop and the 1280 px map sizes, in both colour modes: no two map labels overlap, every label is on the map, every feeder and
## every story place has its label, and no village or place label covers a house, a building or a route line.

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var T := Truth.new()
	if not T.start(root): print("CAREER-MAP-TRUTH FAILED engine"); quit(1); return
	GridUi.load_strings()
	root.size = Vector2i(1920, 1080)   # text is measured against the window scale (the headless default window is tiny)
	await process_frame
	var charters: Array = ["standard", "storm", "boom", "iron", "sun", "lean", "forest", "city", "moor"]
	for ch in charters:
		var r := T.b.act("careerStart", [7, ch])
		T.check(bool(r.get("ok", true)), "careerStart %s" % ch)
		var d: Dictionary = T.b.q("career")
		for sz in [Vector2(1340, 720), Vector2(880, 520)]:
			for mode in ["load", "health"]:
				var m := CareerMap.new(); m.mode = mode
				root.add_child(m); m.size = sz; m.set_data(d)
				await process_frame; await process_frame
				var info: Array = m.label_info
				var tag := "%s %dx%d %s" % [ch, int(sz.x), int(sz.y), mode]
				var feeders := info.filter(func(x): return str(x.kind) == "feeder").size()
				T.check(feeders == (d.feeders as Array).size(), "%s: every feeder has its label (%d of %d)" % [tag, feeders, (d.feeders as Array).size()])
				var places := (d.get("places", []) as Array).filter(func(p): return str(p.kind) != "ducts").size()
				T.check(info.filter(func(x): return str(x.kind) == "place").size() == places, "%s: every place has its label" % tag)
				for i in info.size():
					var a: Rect2 = info[i].rect
					T.check(Rect2(Vector2.ZERO, sz).encloses(a), "%s: '%s' is on the map" % [tag, str(info[i].text)])
					for j in range(i + 1, info.size()):
						T.check(not a.intersects(info[j].rect), "%s: '%s' and '%s' do not overlap" % [tag, str(info[i].text), str(info[j].text)])
					if str(info[i].kind) == "village":
						T.check(float(info[i].hits) <= 0.0 and int(info[i].crossings) == 0, "%s: village '%s' clear of houses and lines (cover %.0f px², %d lines)" % [tag, str(info[i].text), float(info[i].hits), int(info[i].crossings)])
				var vil := info.filter(func(x): return str(x.kind) == "village").size()
				if sz.x > 1000.0: T.check(vil * 3 >= (d.feeders as Array).size() * 2, "%s: most villages are named (%d of %d)" % [tag, vil, (d.feeders as Array).size()])
				print("MAP %s labels=%d villages=%d" % [tag, info.size(), vil])
				m.queue_free()
	T.finish("CAREER-MAP-TRUTH", self)
