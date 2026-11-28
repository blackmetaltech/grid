#!/bin/zsh
# shots.sh <out-dir> [LEVEL ...]: one Forward+ screenshot per job on the RTX 4090 through core/qa/gpu-shot.sh (one game window at a time,
# each capped at 60 s). Default: the title, every job from chapter 4 on, and a new Career. SIZE=1920x1080 by default; extra VAR=VAL pairs in SHOT_ENV.
O=${1:-docs/look2/shots}; shift
mkdir -p $O
L=(TITLE L10 L11 L12 L13 L14 L15 L16 L17 L18 L19 L20 L21 L22 L23 L24 L25 L26 L27 L31 L32 L33 L34 L35 L36 CAREER)
(( $# > 0 )) && L=($@)
for lv in $L; do
  if [[ $lv == TITLE ]]; then env=(); elif [[ $lv == CAREER ]]; then env=(CB_CAREER=new:7); else env=(CB_LEVEL=$lv); fi
  GPU_TIMEOUT=60 SHOT_AT=${SHOT_AT:-9} ${0:A:h:h}/core/qa/gpu-shot.sh ${SIZE:-1920x1080} $O/$lv.png CB_NOWORKORDER=1 $env ${=SHOT_ENV} | tail -1
done
