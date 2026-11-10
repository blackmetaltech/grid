extends Control
## GRID's "home" screen: nothing. The world is full-bleed and GridChrome is the whole interface, so the shell's home drawer (the old Operator Clock) is gone;
## the shell still needs a home id to return to when a drawer closes (Build / Inspect / Timeline on grid levels, Android Back), and this blank one keeps the drawer holder
## hidden and the world uncovered whenever it is shown.
var app

func refresh() -> void:
	if app == null: return
	app.drawer_hidden = true; app.holder.visible = false; app._set_cover(0.0)
	if app.drawer_tab != null: app.drawer_tab.visible = false
