#!/usr/bin/env python3
"""Emit the curated App Store screenshot scenarios as tab-separated JSON."""

import argparse
import json
from datetime import date, timedelta


parser = argparse.ArgumentParser()
parser.add_argument("--ipad", action="store_true")
args = parser.parse_args()

TODAY = date.today()
TODAY_SCROLL = 224 if args.ipad else 244
PMS_SCROLL = 318 if args.ipad else 374
MANAGE_SCROLL = 270
IPAD_PARAM = "&ipad=1" if args.ipad else ""


def iso(value):
    return value.isoformat()


def make_data(cycle_day, include_tensions=False):
    last_start = TODAY - timedelta(days=cycle_day - 1)
    starts = [last_start - timedelta(days=28 * offset) for offset in range(6, -1, -1)]
    periods = [iso(start) for start in starts]
    period_ends = {iso(start): iso(start + timedelta(days=4)) for start in starts[:-1]}

    if cycle_day > 5:
        period_ends[iso(last_start)] = iso(last_start + timedelta(days=4))

    tensions = []
    if include_tensions:
        for start in starts[1:]:
            tensions.extend([iso(start - timedelta(days=5)), iso(start - timedelta(days=4))])

    return {
        "periods": periods,
        "tensions": tensions,
        "settings": {"default_cycle_length": 28, "manual_cycle_length": None},
        "onboarded": True,
        "email_prompted": True,
        "email": None,
        "paused": False,
        "partner_name": "Sarah",
        "period_ends": period_ends,
    }


def today_path(insight, connect, scroll):
    return (
        "/app.html?screenshot=1&autoopen=today"
        f"&insight={insight}&connect={connect}&scroll={scroll}{IPAD_PARAM}"
    )


SCENARIOS = [
    ("01-dashboard-overview", make_data(8), f"/app.html?screenshot=1&scroll=0{IPAD_PARAM}"),
    ("02-menstrual-follow-her-lead", make_data(1), today_path(7, 6, TODAY_SCROLL)),
    ("03-menstrual-what-do-you-need", make_data(1), today_path(3, 0, TODAY_SCROLL)),
    ("04-follicular-plan-together", make_data(8), today_path(0, 0, TODAY_SCROLL)),
    ("05-follicular-try-something-new", make_data(8), today_path(1, 5, TODAY_SCROLL)),
    ("06-follicular-show-initiative", make_data(8), today_path(2, 7, TODAY_SCROLL)),
    ("07-menstrual-mental-load", make_data(1), today_path(7, 7, TODAY_SCROLL)),
    ("08-luteal-small-things", make_data(19), today_path(5, 3, TODAY_SCROLL)),
    ("09-luteal-quiet-reassurance", make_data(19), today_path(6, 6, TODAY_SCROLL)),
    ("10-pms-warm-things", make_data(24), today_path(7, 3, PMS_SCROLL)),
    ("11-pms-tissue-not-solution", make_data(24), today_path(7, 5, PMS_SCROLL)),
    (
        "12-tension-pattern",
        make_data(8, include_tensions=True),
        f"/app.html?screenshot=1&autoview=manage&scroll={MANAGE_SCROLL}{IPAD_PARAM}",
    ),
    ("13-dashboard-pms-ring", make_data(24), f"/app.html?screenshot=1&scroll=0{IPAD_PARAM}"),
    ("14-data-entry", make_data(8), f"/app.html?screenshot=1&autoview=manage&scroll=0{IPAD_PARAM}"),
    ("15-menstrual-low-key-time", make_data(1), today_path(1, 1, TODAY_SCROLL)),
]


for name, data, path in SCENARIOS:
    payload = json.dumps({"data": data, "path": path}, separators=(",", ":"))
    print(f"{name}\t{payload}")
