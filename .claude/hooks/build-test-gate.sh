#!/bin/bash
# .claude/hooks/build-test-gate.sh
# Stop-Hook: verhindert, dass ein Claude-Code-Turn endet, während Build oder Tests rot sind.

INPUT=$(cat)

if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

if CI=false npm run build > /tmp/myrace-build.log 2>&1 && npm test -- --watchAll=false > /tmp/myrace-test.log 2>&1; then
  exit 0
fi

jq -n '{
  decision: "block",
  reason: "Build oder Tests sind rot. Details in /tmp/myrace-build.log bzw. /tmp/myrace-test.log. Fehler beheben, bevor der Turn als abgeschlossen gilt."
}'
