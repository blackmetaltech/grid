#!/bin/bash
# tour-save.sh <data-dir>: a separate Godot user folder for `make run SAVE=tour`. Every job is marked passed (no lamps), so the
# whole campaign is open in Learner mode. The owner's own save (~/.local/share/godot/app_userdata/GRID) is never touched.
set -e
D=${1:?data dir}/godot/app_userdata/GRID
mkdir -p "$D"
if [ ! -f "$D/settings.cfg" ]; then
  printf '[a]\n\ntheme="dark"\nlast_mode="learner"\ntutorial="off"\nautosave=true\n' > "$D/settings.cfg"
fi
if [ ! -f "$D/grid.cfg" ]; then
  ids="P0"; for n in $(seq -w 1 36); do ids="$ids L$n"; done
  { printf '[a]\n\ncute=true\npassed={\n'; first=1
    for i in $ids; do [ $first = 1 ] || printf ',\n'; printf '"%s": true' "$i"; first=0; done
    printf '\n}\n'; } > "$D/grid.cfg"
fi
echo "tour save: $D"
