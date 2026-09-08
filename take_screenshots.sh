#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCREENSHOT_DIR="$PROJECT_DIR/screenshots/app-store-candidates"
DOCS_DIR="$PROJECT_DIR/docs"
IOS_CONFIG="$PROJECT_DIR/ios/App/App/capacitor.config.json"
SCREENSHOT_CONFIG="$PROJECT_DIR/scripts/capacitor.screenshot.config.json"
SCENARIOS="$PROJECT_DIR/scripts/screenshot_scenarios.py"
DERIVED_DATA="/private/tmp/MarcyScreenshotDerivedData"
RAW_SCREENSHOT="/private/tmp/marcy-screenshot-raw.png"
SERVER_LOG="/private/tmp/marcy-screenshot-server.log"
PORT=5099
APP_ID="com.marcy.app"

find_simulator() {
  local simulator_name="$1"
  xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
devices = json.load(sys.stdin)["devices"]
for runtime_devices in devices.values():
    for device in runtime_devices:
        if device.get("name") == name and device.get("isAvailable", False):
            print(device["udid"])
            raise SystemExit(0)
raise SystemExit(f"No available simulator named {name}")
' "$simulator_name"
}

MAX_SIM="$(find_simulator "iPhone 16 Pro Max")"
PRO_SIM="$(find_simulator "iPhone 16 Pro")"
IPAD_SIM="$(find_simulator "iPad Pro 13-inch (M5)")"
CONFIG_BACKUP="$(mktemp /private/tmp/marcy-capacitor-config.XXXXXX)"
cp "$IOS_CONFIG" "$CONFIG_BACKUP"

SERVER_PID=""
cleanup() {
  cp "$CONFIG_BACKUP" "$IOS_CONFIG"
  rm -f "$CONFIG_BACKUP" "$RAW_SCREENSHOT"
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  xcrun simctl shutdown "$MAX_SIM" 2>/dev/null || true
  xcrun simctl shutdown "$PRO_SIM" 2>/dev/null || true
  xcrun simctl shutdown "$IPAD_SIM" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$SCREENSHOT_DIR/6.9" "$SCREENSHOT_DIR/6.3" "$SCREENSHOT_DIR/13-ipad"
cp "$SCREENSHOT_CONFIG" "$IOS_CONFIG"

python3 "$PROJECT_DIR/scripts/screenshot_server.py" --root "$DOCS_DIR" --port "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
sleep 1
curl --fail --silent "http://127.0.0.1:${PORT}/__scenario" >/dev/null

echo "Building native screenshot app..."
xcodebuild \
  -project "$PROJECT_DIR/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build >/private/tmp/marcy-screenshot-build.log

APP_PATH="$DERIVED_DATA/Build/Products/Release-iphonesimulator/App.app"
if [ ! -d "$APP_PATH" ]; then
  echo "Built app not found at $APP_PATH" >&2
  exit 1
fi

capture_device() {
  local simulator_id="$1"
  local size_dir="$2"
  local simulator_name="$3"
  local total
  local index=0
  local limit="${MARCY_SCREENSHOT_LIMIT:-0}"
  local capture_delay=2
  local scenario_arg=""

  if [ "$size_dir" = "13-ipad" ]; then
    capture_delay=5
    scenario_arg="--ipad"
  fi

  total="$(python3 "$SCENARIOS" $scenario_arg | wc -l | tr -d ' ')"
  if [ "$limit" -gt 0 ] && [ "$limit" -lt "$total" ]; then total="$limit"; fi
  echo "Capturing $total native screenshots on $simulator_name..."

  xcrun simctl boot "$simulator_id" 2>/dev/null || true
  xcrun simctl bootstatus "$simulator_id" -b
  xcrun simctl status_bar "$simulator_id" override \
    --time "9:41" --batteryLevel 100 --batteryState charged \
    --wifiBars 3 --cellularBars 4 2>/dev/null || true
  xcrun simctl uninstall "$simulator_id" "$APP_ID" 2>/dev/null || true
  xcrun simctl install "$simulator_id" "$APP_PATH"

  # Warm up the first WKWebView launch so status-bar styling and fonts settle.
  xcrun simctl launch "$simulator_id" "$APP_ID" >/dev/null </dev/null
  sleep "$capture_delay"
  xcrun simctl terminate "$simulator_id" "$APP_ID" 2>/dev/null </dev/null || true

  while IFS=$'\t' read -r shot_name scenario_json; do
    if [ "$limit" -gt 0 ] && [ "$index" -ge "$limit" ]; then break; fi
    index=$((index + 1))
    echo "  $index/$total $shot_name"
    curl --fail --silent \
      -X POST "http://127.0.0.1:${PORT}/__scenario" \
      -H "Content-Type: application/json" \
      --data-binary "$scenario_json" >/dev/null </dev/null
    xcrun simctl terminate "$simulator_id" "$APP_ID" 2>/dev/null </dev/null || true
    xcrun simctl launch "$simulator_id" "$APP_ID" >/dev/null </dev/null
    sleep "$capture_delay"
    xcrun simctl io "$simulator_id" screenshot --type=png "$RAW_SCREENSHOT" >/dev/null </dev/null
    ffmpeg -loglevel error -y -i "$RAW_SCREENSHOT" -vf format=rgb24 \
      "$SCREENSHOT_DIR/$size_dir/$shot_name.png" </dev/null
  done < <(python3 "$SCENARIOS" $scenario_arg)

  xcrun simctl shutdown "$simulator_id"
}

case "${MARCY_SCREENSHOT_DEVICE:-both}" in
  max) capture_device "$MAX_SIM" "6.9" "iPhone 16 Pro Max" ;;
  pro) capture_device "$PRO_SIM" "6.3" "iPhone 16 Pro" ;;
  ipad) capture_device "$IPAD_SIM" "13-ipad" "iPad Pro 13-inch (M5)" ;;
  both)
    capture_device "$MAX_SIM" "6.9" "iPhone 16 Pro Max"
    capture_device "$PRO_SIM" "6.3" "iPhone 16 Pro"
    ;;
  all)
    capture_device "$MAX_SIM" "6.9" "iPhone 16 Pro Max"
    capture_device "$PRO_SIM" "6.3" "iPhone 16 Pro"
    capture_device "$IPAD_SIM" "13-ipad" "iPad Pro 13-inch (M5)"
    ;;
  *) echo "MARCY_SCREENSHOT_DEVICE must be max, pro, ipad, both, or all" >&2; exit 1 ;;
esac

echo "Done: $SCREENSHOT_DIR"
