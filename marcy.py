#!/usr/bin/env python3
"""Marcy - Cycle Tracker. Private, local, simple."""

import json
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data.json"
PLIST_NAME = "com.marcy.notify"
PLIST_PATH = Path.home() / "Library" / "LaunchAgents" / f"{PLIST_NAME}.plist"


def load_data():
    with open(DATA_FILE) as f:
        return json.load(f)


def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def get_cycle_length(data):
    periods = sorted(data["periods"])
    if len(periods) < 2:
        return data["settings"]["default_cycle_length"]
    # Average of all recorded cycle lengths
    diffs = []
    for i in range(1, len(periods)):
        d = (parse_date(periods[i]) - parse_date(periods[i - 1])).days
        if 18 <= d <= 45:  # Filter out obvious data entry errors
            diffs.append(d)
    if not diffs:
        return data["settings"]["default_cycle_length"]
    return round(sum(diffs) / len(diffs))


def get_predictions(data):
    periods = sorted(data["periods"])
    if not periods:
        return None
    last_start = parse_date(periods[-1])
    cycle_len = get_cycle_length(data)

    next_period = last_start + timedelta(days=cycle_len)
    # Ovulation typically 14 days before next period
    ovulation_day = next_period - timedelta(days=14)
    fertile_start = ovulation_day - timedelta(days=4)
    fertile_end = ovulation_day + timedelta(days=1)
    pms_start = next_period - timedelta(days=7)

    return {
        "last_period": last_start,
        "cycle_length": cycle_len,
        "next_period": next_period,
        "ovulation_day": ovulation_day,
        "fertile_start": fertile_start,
        "fertile_end": fertile_end,
        "pms_start": pms_start,
    }


def get_fight_analysis(data):
    """Analyze fights relative to cycle days (days before next period)."""
    fights = sorted(data.get("tensions", []))
    periods = sorted(data["periods"])
    if not fights or not periods:
        return None

    days_before_period = []
    for f in fights:
        fight_date = parse_date(f)
        # Find which cycle this fight belongs to (the next period after the fight)
        for p in periods:
            p_date = parse_date(p)
            if p_date > fight_date:
                diff = (p_date - fight_date).days
                if diff <= 14:  # Only count if within PMS-ish range
                    days_before_period.append(diff)
                break
        else:
            # Fight is after last logged period — use predicted next period
            preds = get_predictions(data)
            if preds:
                diff = (preds["next_period"] - fight_date).days
                if 0 < diff <= 14:
                    days_before_period.append(diff)

    if not days_before_period:
        return None

    from collections import Counter
    freq = Counter(days_before_period)
    hottest_day = freq.most_common(1)[0][0]
    avg = round(sum(days_before_period) / len(days_before_period), 1)

    return {
        "total_fights": len(fights),
        "mapped_fights": len(days_before_period),
        "days_before_period": sorted(days_before_period),
        "avg_days_before": avg,
        "hottest_day_before": hottest_day,
        "frequency": dict(freq),
    }


def cmd_log(args):
    if not args:
        print("Usage: marcy.py log YYYY-MM-DD")
        print("Example: marcy.py log 2026-03-15")
        return
    try:
        d = parse_date(args[0])
    except ValueError:
        print(f"Invalid date format: {args[0]}. Use YYYY-MM-DD.")
        return
    data = load_data()
    date_str = d.isoformat()
    if date_str in data["periods"]:
        print(f"{date_str} is already logged.")
        return
    data["periods"].append(date_str)
    data["periods"].sort()
    save_data(data)
    print(f"Logged period start: {date_str}")
    if len(data["periods"]) >= 2:
        print(f"Average cycle length: {get_cycle_length(data)} days")
    else:
        print("Log one more period to start calculating your actual cycle length.")


def cmd_status(_args):
    data = load_data()
    preds = get_predictions(data)
    if not preds:
        print("No data yet. Log a period first: marcy.py log YYYY-MM-DD")
        return

    today = date.today()
    cycle_day = (today - preds["last_period"]).days + 1

    print(f"--- Marcy Status ({today}) ---")
    print(f"Last period:     {preds['last_period']}")
    print(f"Cycle length:    {preds['cycle_length']} days ({'default' if len(data['periods']) < 2 else 'calculated'})")
    print(f"Current day:     Day {cycle_day} of cycle")
    print()
    print(f"Fertile window:  {preds['fertile_start']} to {preds['fertile_end']}")
    print(f"Ovulation day:   {preds['ovulation_day']}")
    print(f"PMS starts:      {preds['pms_start']}")
    print(f"Next period:     {preds['next_period']}")
    print()

    # Current phase
    if preds["fertile_start"] <= today <= preds["fertile_end"]:
        print(">>> FERTILE WINDOW - HIGH CONCEPTION RISK <<<")
    elif preds["pms_start"] <= today < preds["next_period"]:
        print(">>> PMS WINDOW - Be patient and supportive <<<")
    elif today >= preds["next_period"]:
        days_late = (today - preds["next_period"]).days
        if days_late == 0:
            print(">>> Period expected today <<<")
        else:
            print(f">>> Period is {days_late} day(s) late <<<")
    else:
        # Show what's coming next
        days_to_fertile = (preds["fertile_start"] - today).days
        days_to_pms = (preds["pms_start"] - today).days
        days_to_period = (preds["next_period"] - today).days
        if days_to_fertile > 0:
            print(f"Next up: Fertile window in {days_to_fertile} days")
        elif days_to_pms > 0:
            print(f"Next up: PMS window in {days_to_pms} days")
        print(f"Next period in {days_to_period} days")


def cmd_history(_args):
    data = load_data()
    periods = sorted(data["periods"])
    if not periods:
        print("No periods logged yet.")
        return
    print("--- Cycle History ---")
    for i, p in enumerate(periods):
        if i > 0:
            gap = (parse_date(p) - parse_date(periods[i - 1])).days
            print(f"  {p}  (cycle: {gap} days)")
        else:
            print(f"  {p}  (first logged)")
    print(f"\nTotal cycles: {len(periods) - 1 if len(periods) > 1 else 0}")
    print(f"Average length: {get_cycle_length(data)} days")


def macos_notify(title, message):
    script = f'display notification "{message}" with title "{title}"'
    subprocess.run(["osascript", "-e", script], check=False)


def cmd_notify(_args):
    data = load_data()
    preds = get_predictions(data)
    if not preds:
        return

    today = date.today()
    settings = data["settings"]
    fertile_warn = preds["fertile_start"] - timedelta(days=settings["notify_fertile_days_before"])
    pms_warn = preds["pms_start"] - timedelta(days=settings["notify_pms_days_before"])

    if today == fertile_warn:
        macos_notify("Marcy - Heads Up", f"Fertile window starts in {settings['notify_fertile_days_before']} days ({preds['fertile_start']}). Be careful!")
    if preds["fertile_start"] <= today <= preds["fertile_end"]:
        macos_notify("Marcy - Fertile Window", "Currently in fertile window. High conception risk.")
    if today == pms_warn:
        macos_notify("Marcy - PMS Incoming", f"PMS may start around {preds['pms_start']}. Stock up on snacks.")
    if preds["pms_start"] <= today < preds["next_period"]:
        macos_notify("Marcy - PMS Window", "PMS window is active. Extra patience goes a long way.")
    if today == preds["next_period"]:
        macos_notify("Marcy - Period Expected", "Period expected today.")
    if today == preds["ovulation_day"]:
        macos_notify("Marcy - Ovulation Day", "Estimated ovulation today. Peak fertility.")


def cmd_install(_args):
    script_path = Path(__file__).resolve()
    python_path = sys.executable
    plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python_path}</string>
        <string>{script_path}</string>
        <string>notify</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/marcy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/marcy.err</string>
</dict>
</plist>"""
    PLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLIST_PATH.write_text(plist_content)
    subprocess.run(["launchctl", "load", str(PLIST_PATH)], check=False)
    print(f"Installed daily notification at 9:00 AM.")
    print(f"Plist: {PLIST_PATH}")
    print("To test now: python3 marcy.py notify")


def cmd_uninstall(_args):
    if PLIST_PATH.exists():
        subprocess.run(["launchctl", "unload", str(PLIST_PATH)], check=False)
        PLIST_PATH.unlink()
        print("Uninstalled daily notifications.")
    else:
        print("Not installed.")


COMMANDS = {
    "log": cmd_log,
    "status": cmd_status,
    "history": cmd_history,
    "notify": cmd_notify,
    "install": cmd_install,
    "uninstall": cmd_uninstall,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print("Marcy - Cycle Tracker")
        print()
        print("Commands:")
        print("  log YYYY-MM-DD   Log a period start date")
        print("  status           Show current predictions")
        print("  history          Show cycle history")
        print("  notify           Check and send notifications now")
        print("  install          Set up daily macOS notifications (9am)")
        print("  uninstall        Remove daily notifications")
        return
    COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
