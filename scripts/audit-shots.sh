#!/bin/zsh
# audit-shots.sh <out-dir> [TARGET ...]: three Forward+ shots per job on the RTX 4090 in ONE short window each:
#   <T>-1open.png (the opening view), <T>-2mid.png (some blocks into the run), <T>-3result.png (the report over the scene).
# TARGET: P0, L01..L36, TITLE, CAREER. Every window gets a fresh, empty data dir in $TMPDIR (never the owner's save, never the tour save).
# One game window at a time across all sessions (the shared GPU lock). SIZE=1920x1080, OPEN_AT=8, FF=8.
O=${1:?out dir}; O=${O:A}; shift   # absolute: the windows run from godot/
mkdir -p $O
G=${0:A:h:h}/godot
L=(TITLE MENUS P0 L01 L02 L03 L04 L05 L06 L07 L08 L09 L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20 L21 L22 L23 L24 L25 L26 L27 L28 L29 L30 L31 L32 L33 L34 L35 L36 CAREER)
(( $# > 0 )) && L=($@)
A=${OPEN_AT:-8}; F=${FF:-8}
for lv in $L; do
  D=$(mktemp -d ${TMPDIR:-/tmp}/grid-audit-XXXX)
  case $lv in
    TITLE)  env=(); seq="$A:@$lv-1open;$((A+1)):paper=jobs;$((A+4)):@$lv-2jobs;$((A+5)):quit" ;;
    MENUS)  env=(CB_LEVEL=L10 CB_NOWORKORDER=1); seq="$A:paper=menu;$((A+3)):@$lv-1menu;$((A+4)):paper=close|paper=settings;$((A+7)):@$lv-2settings;$((A+8)):paper=close|paper=codex;$((A+11)):@$lv-3codex;$((A+12)):paper=close|paper=chapter;$((A+16)):@$lv-4chapter;$((A+17)):quit" ;;
    CAREER) env=(CB_CAREER=new:7); seq="$((A+2)):@$lv-1open;$((A+3)):quit" ;;
    *)      env=(CB_LEVEL=$lv CB_NOWORKORDER=1); seq="$A:@$lv-1open;$((A+1)):ff=$F;$((A+5)):@$lv-2mid;$((A+6)):ff=60|paper=report;$((A+12)):@$lv-3result;$((A+13)):quit" ;;
  esac
  (
    exec 9>/tmp/cb-gpu-display.lock; flock -w 120 9 || { echo "$lv: GPU lock busy"; exit 3; }
    cd $G && env DISPLAY=:0.0 VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json __NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only \
      XDG_DATA_HOME=$D CB_NOAUTOSAVE=1 CB_SHOT_DIR=${O:A} CB_SEQ="$seq" $env \
      timeout ${GPU_TIMEOUT:-45} godot --path . --rendering-method forward_plus --resolution ${SIZE:-1920x1080} --position 0,0 --max-fps 60 > $D/log.txt 2>&1
    grep -q "Forward+ - Using Device.*NVIDIA" $D/log.txt || echo "$lv: NOT Forward+ on NVIDIA"
    echo "$lv: $(grep -c 'CB_SEQ shot' $D/log.txt) shots; $(grep -cE 'SCRIPT ERROR|^ERROR' $D/log.txt) errors"
    grep -m3 -E 'SCRIPT ERROR|^ERROR' $D/log.txt
  )
  rm -rf $D
done
