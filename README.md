# Marcy - Cycle Tracker

A simple, private cycle tracker that runs locally on your Mac. No accounts, no cloud — just your data on your machine.

## What it does

- Tracks cycle start dates and calculates average cycle length (starts with 28-day assumption)
- Predicts **ovulation window** (fertile days) — so you know when to be extra careful
- Predicts **PMS window** — so you can be prepared and supportive
- Tracks **tension events** and correlates them to cycle days to predict peak tension dates
- Sends **macOS notifications** as warnings when key dates approach
- **Web UI** (Flask) with dark monospace aesthetic — also works as a PWA on iPhone
- All data stays in a local JSON file

## Launch

**Double-click `Marcy.app` on the Desktop.** It starts the server and opens the browser.

First time: macOS will block it. Right-click > Open, or go to System Settings > Privacy & Security > Open Anyway.

If the app doesn't work, run manually:
```bash
cd /Users/als/Desktop/Marcy
python3 app.py
# Then open http://localhost:5050
```

## Key dates (current cycle)

| Phase | Timing (relative to next period) | What it means |
|---|---|---|
| **Fertile window** | ~Days 10–16 of cycle (ovulation ~Day 14) | Highest chance of conception |
| **PMS window** | ~7 days before next period | Mood/energy shifts may occur |
| **Peak tension** | Predicted from logged tension events | Historically worst day for arguments |

## Current data

- **First period logged:** 2026-03-23
- **First tension logged:** 2026-03-21 (2 days before period)
- **Cycle length:** 28 days (default — will auto-calculate after 2nd period is logged)
- **Next key dates:** Fertile Apr 2–7, Ovulation Apr 6, PMS Apr 13, Period ~Apr 20, Peak tension ~Apr 18

## CLI (still works alongside the web app)

```bash
python3 marcy.py log 2026-04-20     # Log a period start date
python3 marcy.py status              # Show current predictions
python3 marcy.py history             # Show cycle history
python3 marcy.py notify              # Trigger notification check
python3 marcy.py install             # Set up daily 9am macOS notifications
python3 marcy.py uninstall           # Remove daily notifications
```

## Web app

```bash
python3 app.py                       # Start server on http://localhost:5050
```

Features:
- Cycle day ring with progress
- Phase banners (fertile = red, PMS = orange, tension = yellow)
- Timeline of upcoming events with countdowns
- Log periods and tension events
- Tension heatmap showing pattern of days-before-period
- Delete entries from history
- PWA — add to iPhone home screen from Safari for app-like experience

## iPhone access (same WiFi)

Find your Mac's IP:
```bash
python3 -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0])"
```
Open `http://<ip>:5050` on phone. Tap Share > Add to Home Screen for PWA install.

## Notifications (launchd)

`python3 marcy.py install` sets up a daily check at 9am via launchd (`com.marcy.notify`). Notifications fire for:
- Fertile window approaching / active
- PMS window starting / active
- Ovulation day
- Period expected today
- (Tension alerts show in the web UI only, for now)

## Project structure

```
Marcy/
  app.py           # Flask web server + API
  marcy.py         # Core logic + CLI
  data.json        # All tracked data (periods, tensions, settings)
  templates/
    index.html     # Web UI (single page, inline CSS/JS)
  static/
    manifest.json  # PWA manifest
    sw.js          # Service worker for offline/PWA
    icon.svg       # App icon (SVG)
  README.md        # This file
Marcy.app/         # macOS .app launcher (on Desktop, next to Marcy/)
```

## Data format

```json
{
  "periods": ["2026-03-23"],
  "tensions": ["2026-03-21"],
  "settings": {
    "default_cycle_length": 28,
    "notify_fertile_days_before": 2,
    "notify_pms_days_before": 1
  }
}
```

## TODO / future ideas

- Deploy to a server for access from anywhere (not just same WiFi)
- Native iOS app (SwiftUI) with push notifications
- Track more symptoms (mood, energy, cravings)
- Cycle length trend visualization
- Export data
