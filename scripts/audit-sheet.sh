#!/bin/zsh
# audit-sheet.sh <shot-dir> <out-dir>: one contact sheet per chapter from audit-shots.sh output.
# Each row is one job: opening | mid-play | result (each 640x360, labelled). JPEG, quality 82.
I=${1:?shot dir}; O=${2:?out dir}; mkdir -p $O
typeset -A CH
CH=(ch1 "P0 L01 L02 L03" ch2 "L04 L05 L06 L29 L30" ch3 "L07 L08 L09" ch4 "L10 L11 L12 L13" ch5 "L14 L15 L16 L17 L18"
    ch6 "L19 L20 L21 L22" ch7 "L23 L24 L25 L26 L27" ch8 "L31 L32 L33 L34 L35 L36" finale "L28" screens "TITLE MENUS CAREER")
for c in ${(k)CH}; do
  rows=()
  for j in ${=CH[$c]}; do
    fs=($I/$j-*.png(N))
    (( ${#fs} == 0 )) && continue
    r=${TMPDIR:-/tmp}/sheet-$c-$j.png
    magick montage $fs -resize 640x360 -tile ${#fs}x1 -geometry +4+4 -background '#111' -fill '#ddd' -pointsize 22 -title "$j" $r
    rows+=$r
  done
  (( ${#rows} == 0 )) && continue
  magick $rows -background '#111' -append -quality 82 $O/$c.jpg
  rm -f $rows
  echo "$O/$c.jpg"
done
