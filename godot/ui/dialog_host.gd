class_name GridDialogHost
extends Control
## Script for hosts built with `app.dialog()`: lets Esc / pad B / Android Back close the dialog through the shell's modal discipline.
func close() -> void: queue_free()
