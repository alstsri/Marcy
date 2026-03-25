#!/usr/bin/env python3
"""Marcy - Web UI"""

from flask import Flask, jsonify, render_template, request
from marcy import load_data, save_data, parse_date, get_cycle_length, get_predictions, get_fight_analysis
from datetime import date, timedelta

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def api_status():
    data = load_data()
    preds = get_predictions(data)
    if not preds:
        return jsonify({"empty": True})

    today = date.today()
    cycle_day = (today - preds["last_period"]).days + 1

    # Determine current phase
    phase = "normal"
    phase_label = ""
    if preds["fertile_start"] <= today <= preds["fertile_end"]:
        phase = "fertile"
        phase_label = "FERTILE WINDOW"
    elif today == preds["ovulation_day"]:
        phase = "fertile"
        phase_label = "OVULATION DAY"
    elif preds["pms_start"] <= today < preds["next_period"]:
        phase = "pms"
        phase_label = "PMS WINDOW"
    elif today >= preds["next_period"]:
        days_late = (today - preds["next_period"]).days
        phase = "late"
        phase_label = f"PERIOD {'TODAY' if days_late == 0 else f'{days_late}D LATE'}"

    # Days until events
    days_to_fertile = (preds["fertile_start"] - today).days
    days_to_pms = (preds["pms_start"] - today).days
    days_to_period = (preds["next_period"] - today).days
    days_to_ovulation = (preds["ovulation_day"] - today).days

    # Fight analysis
    fight_data = get_fight_analysis(data)
    fight_alert = None
    if fight_data:
        hot_day = fight_data["hottest_day_before"]
        days_to_hot = (preds["next_period"] - timedelta(days=hot_day) - today).days
        fight_alert = {
            "hottest_day_before_period": hot_day,
            "days_until_hot_day": days_to_hot,
            "hot_date": (preds["next_period"] - timedelta(days=hot_day)).isoformat(),
        }

    return jsonify({
        "empty": False,
        "today": today.isoformat(),
        "cycle_day": cycle_day,
        "cycle_length": preds["cycle_length"],
        "cycle_type": "default" if len(data["periods"]) < 2 else "calculated",
        "last_period": preds["last_period"].isoformat(),
        "next_period": preds["next_period"].isoformat(),
        "fertile_start": preds["fertile_start"].isoformat(),
        "fertile_end": preds["fertile_end"].isoformat(),
        "ovulation_day": preds["ovulation_day"].isoformat(),
        "pms_start": preds["pms_start"].isoformat(),
        "phase": phase,
        "phase_label": phase_label,
        "days_to_fertile": days_to_fertile,
        "days_to_pms": days_to_pms,
        "days_to_period": days_to_period,
        "days_to_ovulation": days_to_ovulation,
        "total_periods": len(data["periods"]),
        "tension_analysis": fight_data,
        "tension_alert": fight_alert,
    })


@app.route("/api/log", methods=["POST"])
def api_log():
    body = request.get_json()
    date_str = body.get("date", "")
    try:
        d = parse_date(date_str)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date. Use YYYY-MM-DD."}), 400

    data = load_data()
    if date_str in data["periods"]:
        return jsonify({"error": f"{date_str} already logged."}), 409

    data["periods"].append(d.isoformat())
    data["periods"].sort()
    save_data(data)
    return jsonify({"ok": True, "date": d.isoformat(), "cycle_length": get_cycle_length(data)})


@app.route("/api/history")
def api_history():
    data = load_data()
    periods = sorted(data["periods"])
    entries = []
    for i, p in enumerate(periods):
        entry = {"date": p}
        if i > 0:
            gap = (parse_date(p) - parse_date(periods[i - 1])).days
            entry["cycle_length"] = gap
        entries.append(entry)
    return jsonify({
        "entries": entries,
        "average": get_cycle_length(data),
        "total_cycles": max(0, len(periods) - 1),
    })


@app.route("/api/tensions", methods=["GET"])
def api_fights():
    data = load_data()
    return jsonify({"tensions": sorted(data.get("tensions", []))})


@app.route("/api/tensions/log", methods=["POST"])
def api_log_fight():
    body = request.get_json()
    date_str = body.get("date", "")
    try:
        d = parse_date(date_str)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date."}), 400
    data = load_data()
    if "tensions" not in data:
        data["tensions"] = []
    if date_str in data["tensions"]:
        return jsonify({"error": f"{date_str} already logged."}), 409
    data["tensions"].append(d.isoformat())
    data["tensions"].sort()
    save_data(data)
    return jsonify({"ok": True, "date": d.isoformat()})


@app.route("/api/tensions/delete", methods=["POST"])
def api_delete_fight():
    body = request.get_json()
    date_str = body.get("date", "")
    data = load_data()
    fights = data.get("tensions", [])
    if date_str in fights:
        fights.remove(date_str)
        data["tensions"] = fights
        save_data(data)
        return jsonify({"ok": True})
    return jsonify({"error": "Date not found."}), 404


@app.route("/api/delete", methods=["POST"])
def api_delete():
    body = request.get_json()
    date_str = body.get("date", "")
    data = load_data()
    if date_str in data["periods"]:
        data["periods"].remove(date_str)
        save_data(data)
        return jsonify({"ok": True})
    return jsonify({"error": "Date not found."}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5050)
