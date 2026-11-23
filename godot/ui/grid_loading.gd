class_name GridLoading
## Start a level behind a "Loading" card. The finale's first build takes many seconds on one thread; with no card, a player saw nothing happen
## and pressed A again, and the queued presses then landed in the new level (GRID 1.16 hand play: "dropped A"). The card is drawn before the
## build starts, is modal while it runs, and stays up 0.4 s after, so the presses queued during the build are swallowed.

static func start(app: CbApp, id: String, force := true) -> void:
	var ov := Control.new(); ov.name = "loading"; ov.set_meta("cb_modal", true); ov.mouse_filter = Control.MOUSE_FILTER_STOP
	ov.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new(); dim.color = Color(0.02, 0.03, 0.05, 0.72); dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); dim.mouse_filter = Control.MOUSE_FILTER_IGNORE; ov.add_child(dim)
	var lb := GridTheme.label(TranslationServer.translate("UI_LOADING"), 28, GridTheme.G_TEXT, "semi")
	lb.set_anchors_and_offsets_preset(Control.PRESET_CENTER); lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; lb.grow_horizontal = Control.GROW_DIRECTION_BOTH; ov.add_child(lb)
	app.root.add_child(ov)
	if app.get_viewport().gui_get_focus_owner() != null: app.get_viewport().gui_release_focus()
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
	if OS.has_environment("CB_PADLOG"): print("LOADING start t=%d" % Time.get_ticks_msec())
	app.set_meta("cb_input_block_until", Time.get_ticks_msec() + 600000)
	app.start_level(id, force)
	if OS.has_environment("CB_PADLOG"): print("LOADING returned t=%d" % Time.get_ticks_msec())
	# The 3D world builds on the frames after start_level (the model arrives, then the province). Keep the card up and drop pad presses until two
	# frames in a row are quick again, then 0.4 s more: presses queued during the build would land in the work order unseen.
	var quick := 0; var t0 := Time.get_ticks_msec(); var last := t0
	while quick < 2 and Time.get_ticks_msec() - t0 < 90000 and DisplayServer.get_name() != "headless":
		app.set_meta("cb_input_block_until", Time.get_ticks_msec() + 600000)   # until the loop ends: one build frame can take seconds
		if is_instance_valid(ov): ov.move_to_front()
		await app.get_tree().process_frame
		var now := Time.get_ticks_msec(); quick = quick + 1 if now - last < 150 else 0; last = now
	app.set_meta("cb_input_block_until", Time.get_ticks_msec() + 400)
	if OS.has_environment("CB_PADLOG"): print("LOADING quick t=%d" % Time.get_ticks_msec())
	if is_instance_valid(ov) and DisplayServer.get_name() != "headless":
		ov.move_to_front()
		await app.get_tree().create_timer(0.4).timeout
	if is_instance_valid(ov): ov.queue_free()
	if CbKit.pad_mode and app.get("pad") != null: app.pad.call_deferred("ensure_focus", true)
