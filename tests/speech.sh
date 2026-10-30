#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Jeff Moore
# A device with no speech of its own, its brain doing it: a question, made
# with Piper and fed to the trial device as its microphone, is sent to the
# brain, transcribed there, answered, and spoken back as sound the device
# "plays" into a file. Nothing listens to the room, and nothing looks.
#
#   tests/speech.sh ["the question"]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
question="${1:-What is two plus two?}"
share="$HOME/.local/share/heymorgan"

# The question as the microphone gives it: 16 kHz mono 16-bit, with a second of quiet either side.
echo "$question" | "$share/piper/piper" --model "$share/voices/en_US-lessac-medium.onnx" --output-raw 2>/dev/null \
  | ffmpeg -loglevel error -f s16le -ar 22050 -ac 1 -i - -f s16le -ar 16000 -ac 1 "$work/said.raw"
head -c 32000 /dev/zero > "$work/quiet.raw"
cat "$work/quiet.raw" "$work/said.raw" "$work/quiet.raw" "$work/quiet.raw" > "$work/mic.raw"
: > "$work/played.raw"

settings=$(printf '{"speech": "brain", "stt": null, "tts": null, "knownVoicesOnly": false, "record": "cat %s; sleep 100", "play": "cat >> %s"}' "$work/mic.raw" "$work/played.raw")

check() {
  sock="$HEYMORGAN_SOCKET"
  ask() { timeout 30 "$root/bin/heymorgan" $1; }
  # The device starts again once, to take up the brain's settings; asked meanwhile, it is not there.
  sleep 6
  for _ in $(seq 20); do ask status >/dev/null 2>&1 && break; sleep 1; done
  echo "--- status";  ask status | python3 -c 'import json,sys; s=json.load(sys.stdin); print({k: s.get(k) for k in ("role","speech","stt","tts","engine","voice")})'
  (timeout 120 "$root/bin/heymorgan" watch > "$work/events" 2>/dev/null &)
  echo "--- listening"; ask toggle
  for _ in $(seq 90); do
    sleep 1
    size=$(stat -c %s "$work/played.raw")
    [ "$size" -gt 0 ] && state=$(ask status | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])') && [ "$state" = idle ] && break
  done
  echo "--- heard and answered"
  grep -a '"type":"user"\|"type":"assistant"' "$work/events" | tail -2 | cut -c1-240 || true
  echo "--- played: $(stat -c %s "$work/played.raw") bytes ($(python3 -c "print(round($(stat -c %s "$work/played.raw")/2/22050,1))") s at Piper's rate)"
  [ -s "$TRIAL_DATA/../cant-reach.json" ] && echo "--- the \"can't reach home\" sound is kept" || echo "--- FAIL: no \"can't reach home\" sound kept"

  # The brain gone: the device, with no voice of its own, says so in the brain's voice, kept for this.
  for pid in $(pgrep -f "^node daemon.mjs$"); do
    tr '\0' '\n' < "/proc/$pid/environ" | grep -qx "HEYMORGAN_DATA=$TRIAL_DATA" && kill "$pid"
  done
  sleep 2
  before=$(stat -c %s "$work/played.raw")
  echo "--- the brain stopped; asking again"; ask toggle
  sleep 12
  after=$(stat -c %s "$work/played.raw")
  [ "$after" -gt "$before" ] && echo "ok: it said it could not reach home ($(( (after - before) / 2 )) samples)" || echo "FAIL: nothing was said"
}
export -f check; export work root
CLIENT_ENV="HEYMORGAN_DEBUG=1" SIGHT='[]' SERVER_SPEECH="${SERVER_SPEECH:-piper}" CLIENT_SETTINGS="$settings" "$here/remote.sh" bash -c check
