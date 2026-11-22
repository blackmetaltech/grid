class_name GridText
extends RefCounted
## 1.9: every hand-drawn string goes through here so the text audit (tests/text_flow.gd) sees its size on screen. `ds` / `dm` draw exactly as
## CanvasItem.draw_string / draw_multiline_string do; while `audit` is on they also record the smallest on-screen pixel size drawn by each
## script (font size x the item's canvas scale x the window's stretch), for items that are visible.
static var audit := false
static var seen := {}   # script file -> [smallest px, sample text]
static var clipped := {}   # script file -> sample text that runs past its control's right edge (audit only)

const MIN_PX := 16.0   # the owner's floor: no text under 16 px on screen, at 1920x1080 or 1280x800

static func scale_of(ci: CanvasItem) -> float:
	return maxf(0.01, ci.get_global_transform_with_canvas().get_scale().y * ci.get_viewport().get_final_transform().get_scale().y)

## The size to draw at: at least MIN_PX on screen whatever the canvas scale (map labels shrink with zoom).
static func floor_size(ci: CanvasItem, size: int) -> int:
	return maxi(size, ceili(MIN_PX / scale_of(ci) - 0.001))

static func _note(ci: CanvasItem, size: int, text: String) -> void:
	if not audit or text.strip_edges() == "" or not ci.is_visible_in_tree(): return
	var px := float(size) * scale_of(ci)
	if ci is Control and not (ci as Control).get_global_rect().intersects(Rect2(Vector2.ZERO, ci.get_viewport().get_visible_rect().size)): return
	var key := str(ci.get_script().resource_path.get_file()) if ci.get_script() != null else ci.get_class()
	if not seen.has(key) or px < float(seen[key][0]): seen[key] = [px, text.left(40)]

static func ds(ci: CanvasItem, font: Font, pos: Vector2, text: String, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0, size := 16, col := Color.WHITE) -> void:
	size = floor_size(ci, size); _note(ci, size, text)
	if width < 0.0 and ci is Control and (ci as Control).size.x > 8.0 and text.strip_edges() != "":
		# 1.9: a label that grew with the 16 px floor and would run past its control's right edge slides left to end at the edge
		var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		var cw := (ci as Control).size.x
		if pos.x + tw > cw - 2.0: pos.x = maxf(0.0, cw - 2.0 - tw)
		if audit and tw > cw + 3.0 and ci.is_visible_in_tree():
			var key := str(ci.get_script().resource_path.get_file()) if ci.get_script() != null else ci.get_class()
			clipped[key] = "'%s' is %.0f px wide in %.0f" % [text.left(40), tw, cw]
	ci.draw_string(font, pos, text, align, width, size, col)

static func dm(ci: CanvasItem, font: Font, pos: Vector2, text: String, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0, size := 16, max_lines := -1, col := Color.WHITE) -> void:
	size = floor_size(ci, size); _note(ci, size, text)
	ci.draw_multiline_string(font, pos, text, align, width, size, max_lines, col)

## Controls: floor a Label / Button / LineEdit / RichTextLabel's font to MIN_PX on screen. main.gd calls it (deferred) for every node that
## enters the tree, so the shell's own controls (13 px minimum) and every screen's hand-picked sizes are covered in one place.
static func floor_control(c: Control) -> void:
	if not is_instance_valid(c) or not c.is_inside_tree(): return
	var need := ceili(MIN_PX / clampf(scale_of(c), 0.75, 4.0) - 0.001)   # clamped: a control entering the tree at startup can report a tiny scale (the pad strip came out at 135 px)
	if c is Label and (c as Label).label_settings != null:
		var ls := (c as Label).label_settings
		if ls.font_size < need: ls = ls.duplicate(); ls.font_size = need; (c as Label).label_settings = ls
		return
	var key := "normal_font_size" if c is RichTextLabel else "font_size"
	if c.get_theme_font_size(key) < need: c.add_theme_font_size_override(key, need)
	if c is RichTextLabel:
		for k2 in ["bold_font_size", "italics_font_size", "mono_font_size", "bold_italics_font_size"]:
			if c.get_theme_font_size(k2) < need: c.add_theme_font_size_override(k2, need)
