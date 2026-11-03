#!/bin/bash
# Schedule an Agent Forge orchestration to run every day via a macOS LaunchAgent.
#   scripts/schedule-daily.sh world-news 07:00          enable (default: world-news at 07:00)
#   scripts/schedule-daily.sh security-hunt 02:30
#   scripts/schedule-daily.sh world-news off            disable
# Output: forge/reports/..., logs in forge/.cache/schedule-<name>.log
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${1:-world-news}"
WHEN="${2:-07:00}"
LABEL="com.deepseekharness.forge.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "$WHEN" = "off" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"; echo "disabled $LABEL"; exit 0
fi
HOUR=$((10#${WHEN%%:*})); MIN=$((10#${WHEN##*:}))
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/forge/.cache"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$ROOT/forge-cli</string><string>run</string><string>$NAME</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MIN</integer></dict>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StandardOutPath</key><string>$ROOT/forge/.cache/schedule-$NAME.log</string>
  <key>StandardErrorPath</key><string>$ROOT/forge/.cache/schedule-$NAME.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "scheduled $NAME daily at $WHEN ($PLIST)"
