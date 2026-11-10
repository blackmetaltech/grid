#!/bin/zsh
# M0 phone gate: install the debug APK, start, screenshot, collect a log. Run under the phone lock.
cd ${0:A:h}/.. && source qa.env
P=core/qa/phone.sh
zsh $P wake
zsh $P install build/android/GRID-debug.apk
zsh $P clear
zsh $P start
sleep 15
zsh $P shot m0-title
zsh $P tap 1212 540; sleep 6
zsh $P shot m0-after-tap
zsh $P log 200 | grep -iE "engine|bridge|error|SCRIPT|cobanana" | tail -30
zsh $P stop
