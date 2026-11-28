# GRID: everyday commands. `make` alone lists them.
#
#   make run                 play on the RTX 4090 (Forward+), in a window
#   make run LOW=1           the low tier, on the integrated GPU
#   make run CLASSIC=1       the classic 2D look
#   make run SAVE=tour       a separate save with every job open (Engineer mode); your own save is not touched
#   make run LEVEL=L10       straight into one job
#   make run WIN=1600x900    a window size (default: the game's own 1920x1080 window; below 1280x800 the panels crowd)

SHELL := /bin/bash
GODOT ?= godot
WIN ?=
SIDECAR := godot/sidecar/bridge.mjs
ENGINE_SRC := $(shell find src core/ts -name '*.ts' -not -name '*.test.ts' 2>/dev/null) vite.bridge.config.ts

# Forward+ on the NVIDIA card through PRIME offload, as core/qa/gpu-shot.sh does (the session's own VK_ICD_FILENAMES names a missing file).
NVIDIA_ENV := VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json __NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only
AMD_ENV := VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/radeon_icd.json

RUN_ENV := DISPLAY=$${DISPLAY:-:0.0}
ifeq ($(LOW),1)
  RUN_ENV += $(AMD_ENV) CB_QUALITY=low
else
  RUN_ENV += $(NVIDIA_ENV)
endif
ifeq ($(CLASSIC),1)
  RUN_ENV += CB_LOOK=1
endif
ifeq ($(SAVE),tour)
  RUN_ENV += XDG_DATA_HOME=$(CURDIR)/build/tour-data
endif
ifneq ($(LEVEL),)
  RUN_ENV += CB_LEVEL=$(LEVEL)
endif

.DEFAULT_GOAL := help
.PHONY: help run test flows build shots clean sidecar import tour-save

help:
	@echo "GRID"
	@echo ""
	@echo "  make run          Play the game in a window on the RTX 4090."
	@echo "                    LOW=1 low tier on the integrated GPU, CLASSIC=1 classic look,"
	@echo "                    SAVE=tour every job open in a separate save, LEVEL=L10 one job, WIN=1600x900 window size."
	@echo "  make test         Type check and unit tests."
	@echo "  make flows        The Godot flow tests (headless)."
	@echo "  make build        Build the engine sidecar and import the Godot project."
	@echo "  make shots        GPU screenshots of the 3D chapters into docs/look2/shots/."
	@echo "  make clean        Remove build output and the tour save."
	@echo "  make help         This list."

$(SIDECAR): $(ENGINE_SRC)
	pnpm -s bridge

sidecar: $(SIDECAR)

import:
	timeout 600 $(GODOT) --headless --path godot --import >/dev/null 2>&1 || true

build: sidecar import

tour-save:
	@if [ "$(SAVE)" = "tour" ]; then bash scripts/tour-save.sh build/tour-data; fi

run: sidecar tour-save
	cd godot && env $(RUN_ENV) $(GODOT) --path . --rendering-method forward_plus $(if $(WIN),--resolution $(WIN),)

test:
	pnpm -s typecheck
	pnpm -s vitest run --maxWorkers=4 --minWorkers=1

flows: sidecar
	timeout 1800 node scripts/test-godot.mjs

shots: sidecar
	bash scripts/shots.sh docs/look2/shots

clean:
	rm -rf build/tour-data dist
	rm -f $(SIDECAR)
