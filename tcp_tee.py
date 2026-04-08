#!/usr/bin/env python3
"""Tiny TCP tee proxy for diagnosing HTTP client/server mismatches.

Listens on a local port, forwards every connection to an upstream host:port,
and writes every byte of both directions to a log file as annotated hex+ASCII.

Usage:
    python tcp_tee.py --listen 18081 --upstream 127.0.0.1:18080 --log /tmp/tee.log

Then point the offending client at http://127.0.0.1:18081/... instead of the
real server. The log file shows exactly what bytes were exchanged so you can
tell HTTP/1.1 from HTTP/2 preface from TLS from chunked transfer etc.
"""
import argparse
import socket
import sys
import threading
import time
from pathlib import Path


def _dump(direction: str, data: bytes, log_fh) -> None:
    ts = time.strftime("%H:%M:%S")
    # Show printable chars as-is with whitespace visible; render non-printables
    # inline as \xNN. Also dump a full hex block for the first 256 bytes so
    # the exact header can be copy-pasted elsewhere.
    preview_chars = []
    for b in data[:65536]:
        if 32 <= b < 127:
            preview_chars.append(chr(b))
        elif b == 0x0A:
            preview_chars.append("\\n\n   ")
        elif b == 0x0D:
            preview_chars.append("\\r")
        elif b == 0x09:
            preview_chars.append("\\t")
        else:
            preview_chars.append(f"\\x{b:02x}")
    preview = "".join(preview_chars)

    hex_block_lines = []
    for i in range(0, min(256, len(data)), 16):
        chunk = data[i:i + 16]
        hex_part = " ".join(f"{b:02x}" for b in chunk)
        ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        hex_block_lines.append(f"    {i:04x}  {hex_part:<47}  {ascii_part}")
    hex_block = "\n".join(hex_block_lines)

    log_fh.write(
        f"\n=== {ts} {direction} {len(data)} bytes ===\n"
        f"{preview}\n"
        f"{hex_block}\n"
    )
    log_fh.flush()


def _pipe(src: socket.socket, dst: socket.socket, direction: str, log_fh) -> None:
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            _dump(direction, data, log_fh)
            try:
                dst.sendall(data)
            except OSError:
                break
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def _handle(client: socket.socket, upstream_host: str, upstream_port: int, log_fh, conn_id: int) -> None:
    log_fh.write(f"\n### connection #{conn_id} opened ###\n")
    log_fh.flush()
    try:
        upstream = socket.create_connection((upstream_host, upstream_port))
    except OSError as e:
        log_fh.write(f"### connection #{conn_id} upstream connect failed: {e} ###\n")
        log_fh.flush()
        client.close()
        return

    c2u = threading.Thread(
        target=_pipe, args=(client, upstream, f"C→S #{conn_id}", log_fh), daemon=True
    )
    u2c = threading.Thread(
        target=_pipe, args=(upstream, client, f"S→C #{conn_id}", log_fh), daemon=True
    )
    c2u.start()
    u2c.start()
    c2u.join()
    u2c.join()
    client.close()
    upstream.close()
    log_fh.write(f"### connection #{conn_id} closed ###\n")
    log_fh.flush()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, required=True, help="local port to listen on")
    ap.add_argument("--upstream", type=str, required=True, help="host:port to forward to")
    ap.add_argument("--log", type=str, required=True, help="log file path")
    args = ap.parse_args()

    host, _, port = args.upstream.partition(":")
    upstream_host = host
    upstream_port = int(port)

    log_path = Path(args.log)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_fh = open(log_path, "w")
    print(f"tcp_tee: listening on 127.0.0.1:{args.listen} → {upstream_host}:{upstream_port}")
    print(f"tcp_tee: logging to {log_path}")

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", args.listen))
    srv.listen(16)

    conn_id = 0
    try:
        while True:
            client, addr = srv.accept()
            conn_id += 1
            print(f"tcp_tee: conn #{conn_id} from {addr}")
            threading.Thread(
                target=_handle,
                args=(client, upstream_host, upstream_port, log_fh, conn_id),
                daemon=True,
            ).start()
    except KeyboardInterrupt:
        print("\ntcp_tee: shutting down")
        return 0
    finally:
        srv.close()
        log_fh.close()


if __name__ == "__main__":
    sys.exit(main())
