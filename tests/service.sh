#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Jeff Moore
# A speech service (`node speech.mjs serve`) on this machine, as on the AI
# server, and a trial brain that asks it for its devices' speech; then
# tests/speech.sh through them. Kokoro, as the brain is set to.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/.."
work="$(mktemp -d)"
key="trial-$(head -c 12 /dev/urandom | base64 | tr -dc A-Za-z0-9)"
echo '{"engine": "kokoro", "kokoroVoice": "af_bella"}' > "$work/config.json"
(cd "$root" && SPEECH_KEY="$key" SPEECH_PORT=18791 SPEECH_HOST=127.0.0.1 HEYMORGAN_CONFIG="$work/config.json" exec node speech.mjs serve) > "$work/service.log" 2>&1 &
service=$!
trap 'kill $service 2>/dev/null; sleep 0.5; echo "--- speech service log"; cat "$work/service.log"; rm -rf "$work"' EXIT
sleep 3
echo "--- refused without the key: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18791/status)"
SERVER_SPEECH=kokoro BRAIN_CONFIG="{\"speechUrl\": \"http://127.0.0.1:18791\", \"speechKey\": \"$key\", \"kokoroVoice\": \"af_heart\"}" \
  "$here/speech.sh" "${1:-Say hello to me in one short sentence.}"
echo "--- the service now: $(curl -s -H "Authorization: Bearer $key" http://127.0.0.1:18791/status)"
