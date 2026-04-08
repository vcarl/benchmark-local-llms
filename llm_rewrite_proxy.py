#!/usr/bin/env python3
"""HTTP rewriting proxy between commander and llama-server.

Intercepts POST /v1/chat/completions, mutates the JSON body to strip fields
known or suspected to confuse llama.cpp, then forwards to upstream.

Rewrites applied:
  - drop `store` (Assistants API field, not chat-completions)
  - rename `max_completion_tokens` → `max_tokens`
  - drop `stream_options` (unknown in older llama.cpp)
  - recursively drop `patternProperties` from tool schemas (llama.cpp GBNF
    compiler doesn't handle it)
  - force `stream: false` to make debugging easier

Other methods/paths are passed through unchanged.

Usage:
    python llm_rewrite_proxy.py --listen 18082 --upstream 127.0.0.1:18080
"""
import argparse
import http.client
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = 18080


def _strip_pattern_properties(obj):
    if isinstance(obj, dict):
        obj.pop("patternProperties", None)
        for v in obj.values():
            _strip_pattern_properties(v)
    elif isinstance(obj, list):
        for v in obj:
            _strip_pattern_properties(v)


def rewrite_body(body: bytes) -> tuple[bytes, list[str]]:
    """Return (new_body, list_of_changes)."""
    changes: list[str] = []
    try:
        obj = json.loads(body)
    except Exception as e:
        return body, [f"json_parse_failed: {e}"]

    if "store" in obj:
        obj.pop("store")
        changes.append("dropped store")

    if "max_completion_tokens" in obj:
        obj["max_tokens"] = obj.pop("max_completion_tokens")
        changes.append("renamed max_completion_tokens → max_tokens")

    if "stream_options" in obj:
        obj.pop("stream_options")
        changes.append("dropped stream_options")

    # Leave `stream` alone — commander's OpenAI SDK decides its response
    # parser based on the request's stream flag. Forcing stream=false makes
    # it read SSE-shaped output and see "empty response".

    before = json.dumps(obj)
    _strip_pattern_properties(obj)
    after = json.dumps(obj)
    if before != after:
        changes.append("stripped patternProperties from tool schemas")

    return json.dumps(obj).encode("utf-8"), changes


class ProxyHandler(BaseHTTPRequestHandler):
    # Silence the default one-line-per-request stderr logger; we print our own.
    def log_message(self, format, *args):
        pass

    def _forward(self, method: str, body: bytes, rewrites: list[str]):
        conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=300)
        headers = {k: v for k, v in self.headers.items()}
        headers["Content-Length"] = str(len(body))
        # Don't let keep-alive corrupt debugging state.
        headers["Connection"] = "close"
        try:
            conn.request(method, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
        except Exception as e:
            self.send_error(502, f"upstream error: {e}")
            return
        finally:
            conn.close()

        print(f"[proxy] {method} {self.path} → {resp.status} "
              f"({len(body)}B in, {len(data)}B out) | rewrites: {rewrites or 'none'}",
              flush=True)
        if resp.status >= 400:
            print(f"[proxy] upstream error body: {data[:500]!r}", flush=True)

        self.send_response(resp.status, resp.reason)
        for k, v in resp.getheaders():
            if k.lower() in ("transfer-encoding", "connection", "content-length"):
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        rewrites: list[str] = []
        if self.path.startswith("/v1/chat/completions"):
            body, rewrites = rewrite_body(body)
        self._forward("POST", body, rewrites)

    def do_GET(self):
        self._forward("GET", b"", [])


def main() -> int:
    global UPSTREAM_HOST, UPSTREAM_PORT
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, required=True)
    ap.add_argument("--upstream", type=str, default="127.0.0.1:18080")
    args = ap.parse_args()

    host, _, port = args.upstream.partition(":")
    UPSTREAM_HOST = host
    UPSTREAM_PORT = int(port)

    server = ThreadingHTTPServer(("127.0.0.1", args.listen), ProxyHandler)
    print(f"llm_rewrite_proxy: listening on 127.0.0.1:{args.listen} → {UPSTREAM_HOST}:{UPSTREAM_PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
        return 0


if __name__ == "__main__":
    sys.exit(main())
