#!/usr/bin/env python3
"""Serve Marcy and a mutable synthetic-data scenario for native screenshots."""

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class ScreenshotServer(ThreadingHTTPServer):
    scenario = {
        "data": {
            "periods": [],
            "tensions": [],
            "settings": {"default_cycle_length": 28, "manual_cycle_length": None},
            "onboarded": False,
            "email_prompted": True,
            "email": None,
            "paused": False,
            "partner_name": None,
            "period_ends": {},
        },
        "path": "/app.html?screenshot=1",
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        server = args[2]
        super().__init__(*args, directory=str(server.docs_root), **kwargs)

    def _send_json(self, value, status=200):
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_screenshot_host(self):
        body = self.server.screenshot_host_html
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        request = urlsplit(self.path)
        if request.path == "/__scenario":
            self._send_json(self.server.scenario)
            return
        if request.path == "/index.html":
            self._send_screenshot_host()
            return
        elif request.path == "/app.html":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/__scenario":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            scenario = json.loads(self.rfile.read(length))
            if not isinstance(scenario.get("data"), dict):
                raise ValueError("data must be an object")
            if not isinstance(scenario.get("path"), str) or not scenario["path"].startswith("/"):
                raise ValueError("path must begin with /")
            self.server.scenario = scenario
            self._send_json({"ok": True})
        except (json.JSONDecodeError, ValueError) as error:
            self._send_json({"ok": False, "error": str(error)}, status=400)

    def log_message(self, format, *args):
        return


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=5099)
    args = parser.parse_args()

    server = ScreenshotServer(("127.0.0.1", args.port), Handler)
    server.docs_root = args.root.resolve()
    server.screenshot_host_html = Path(__file__).with_name("screenshot-host.html").read_bytes()
    print(f"Serving {server.docs_root} on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
