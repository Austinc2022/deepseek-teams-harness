#!/bin/bash
# Schedule an Agent Forge orchestration via a macOS LaunchAgent (daily, or weekly on one weekday).
#   scripts/schedule-daily.sh world-news 07:00          enable daily (default: world-news at 07:00)
#   scripts/schedule-daily.sh security-hunt 02:30
#   scripts/schedule-daily.sh idea-scout 06:00          venture studio: daily idea scouting
#   scripts/schedule-daily.sh weekly-retro 07:30 sun    weekly on a weekday (sun mon tue wed thu fri sat)
#   scripts/schedule-daily.sh world-news off            disable
# Output: forge/reports/..., logs in forge/.cache/schedule-<name>.log
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${1:-world-news}"
WHEN="${2:-07:00}"
DAY="${3:-}"
LABEL="com.deepseekharness.forge.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "$WHEN" = "off" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"; echo "disabled $LABEL"; exit 0
fi
HOUR=$((10#${WHEN%%:*})); MIN=$((10#${WHEN##*:}))
WEEKDAY=""
if [ -n "$DAY" ]; then
  case "$(echo "$DAY" | tr '[:upper:]' '[:lower:]')" in
    sun*|0) WEEKDAY=0 ;; mon*|1) WEEKDAY=1 ;; tue*|2) WEEKDAY=2 ;; wed*|3) WEEKDAY=3 ;;
    thu*|4) WEEKDAY=4 ;; fri*|5) WEEKDAY=5 ;; sat*|6) WEEKDAY=6 ;;
    *) echo "unknown weekday: $DAY" >&2; exit 1 ;;
  esac
fi
WEEKDAY_XML=""; [ -n "$WEEKDAY" ] && WEEKDAY_XML="<key>Weekday</key><integer>$WEEKDAY</integer>"
# launchd starts jobs with a minimal PATH; include the usual user locations of node and claude.
JOB_PATH="$HOME/.local/bin:$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/forge/.cache"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$ROOT/forge-cli</string><string>run</string><string>$NAME</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MIN</integer>$WEEKDAY_XML</dict>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$JOB_PATH</string><key>HOME</key><string>$HOME</string></dict>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StandardOutPath</key><string>$ROOT/forge/.cache/schedule-$NAME.log</string>
  <key>StandardErrorPath</key><string>$ROOT/forge/.cache/schedule-$NAME.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
if [ -n "$DAY" ]; then FREQ="every $DAY"; else FREQ="daily"; fi
echo "scheduled $NAME $FREQ at $WHEN ($PLIST)"
