#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec core/android/build-native.sh "$PWD"
