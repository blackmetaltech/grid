#!/bin/zsh
# gpu-play.sh start <shotdir> [WxH] [VAR=VAL ...] | stop
# A hand play at real speed on the NVIDIA GPU (PRIME offload on the real X session), driven only by the shared virtual pad
# (core/qa/padstart.sh, then core/qa/pad.py A|B|UP|... ). No keyboard or mouse input is ever sent to the owner's display.
# The window opens off to the right of the desktop; the game saves a frame every CB_SHOT_EVERY seconds (default 5) into <shotdir>.
# Holds /tmp/cb-gpu-display.lock (one GPU window across all games) until stop. Frame cap 60 fps.
G=${0:A:h:h}/godot; PIDF=/tmp/grid-gpu-play.pid
case $1 in
start)
  D=${2:?shot dir}; R=${3:-1920x1080}; shift 3 2>/dev/null || shift $#
  exec 9>/tmp/cb-gpu-display.lock; flock -w 300 9 || { echo "gpu-play: GPU window lock busy"; exit 3; }
  cd $G || exit 1
  env VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json __NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only DISPLAY=:0.0 \
    XDG_DATA_HOME=${XDG_PLAY:-/tmp/grid-gpu-play-data} CB_PAD=1 CB_NOAUTOSAVE=1 CB_SHOT_DIR=$D "$@" \
    godot --path . --rendering-method forward_plus --resolution $R --position 3000,100 --max-fps 60 > $D.log 2>&1 &
  echo $! > $PIDF; echo "gpu-play: pid $(cat $PIDF), frames in $D, log $D.log"
  wait $(cat $PIDF); rm -f $PIDF ;;
stop) [ -f $PIDF ] && kill $(cat $PIDF) && echo stopped ;;
*) echo "usage: gpu-play.sh start <shotdir> [WxH] [VAR=VAL ...] | stop" ;;
esac
