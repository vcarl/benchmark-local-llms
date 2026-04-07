"""Commander subprocess runner.

Spawns ~/workspace/commander via `bun run`, reading its stdout as a JSONL event
stream. Designed to be driven by a watchdog (game_session.py) that enforces
cutoffs and decides when to terminate the process.
"""

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional


@dataclass
class CommanderEvent:
    event: str
    tick: int
    ts: str
    data: dict = field(default_factory=dict)


def iter_events(proc: subprocess.Popen) -> Iterator[CommanderEvent]:
    """Yield CommanderEvent objects parsed from `proc.stdout` line by line.

    Non-JSON lines (logging) are silently skipped. Stops when stdout closes.
    """
    if proc.stdout is None:
        return
    for raw in proc.stdout:
        line = raw.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict) or "event" not in obj:
            continue
        yield CommanderEvent(
            event=obj["event"],
            tick=int(obj.get("tick", 0)),
            ts=str(obj.get("ts", "")),
            data={k: v for k, v in obj.items() if k not in ("event", "tick", "ts")},
        )


def spawn_commander(
    commander_dir: Path,
    model: str,
    scenario_path: Path,
    server_url: str,
    session: str,
    llm_base_url_env: str,
    llm_base_url: str,
    extra_env: Optional[dict] = None,
) -> subprocess.Popen:
    """Spawn `bun run` for the commander entrypoint with --benchmark mode.

    `model`, `scenario_path`, `server_url`, `session` map directly to commander's
    CLI flags (see smbench/src/lib/process.ts:32-44).

    `llm_base_url_env` is the env var name commander's pi-ai layer reads for the
    local provider's base URL (determined in Task 6 — e.g. OLLAMA_BASE_URL).
    `llm_base_url` is the value (e.g. http://127.0.0.1:18080/v1).
    """
    env = {**os.environ}
    env[llm_base_url_env] = llm_base_url
    if extra_env:
        env.update(extra_env)
    if "PATH" not in env:
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

    args = [
        "bun", "run", "src/commander.ts",
        "--model", model,
        "--file", str(scenario_path),
        "--url", server_url,
        "--session", session,
        "--benchmark",
    ]
    return subprocess.Popen(
        args,
        cwd=str(commander_dir),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # line-buffered so iter_events sees lines as they arrive
    )
