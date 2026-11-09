extends CbScreen
## The clock drawer: day, time of day (15-minute blocks), block number and speed, all from the engine's `clock` query.

func build(b: VBoxContainer) -> void:
	var c: Dictionary = app.b.q("clock")
	CbKit.header(b, tr("CLOCK_TITLE"), tr("CLOCK_HINT"))
	if c == null or c.is_empty(): return
	var p := CbKit.panel("", true, b); var v: VBoxContainer = p[1]
	_row(v, tr("CLOCK_DAY"), str(int(c.day) + 1))
	_row(v, tr("CLOCK_TIME"), "%02d:%02d" % [int(c.hour), int(c.minute)])
	_row(v, tr("CLOCK_BLOCK"), tr("CLOCK_BLOCK_FMT") % [int(c.block) + 1, int(c.blocksPerDay)])
	_row(v, tr("CLOCK_SPEED"), tr("CLOCK_SPEED_FMT") % str(c.speed))

func _row(parent: VBoxContainer, name: String, value: String) -> void:
	var r := HBoxContainer.new(); parent.add_child(r)
	r.add_child(CbKit.label(name, 14, CbKit.DIM))
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; r.add_child(sp)
	r.add_child(CbKit.label(value, 22, CbKit.ACC))
