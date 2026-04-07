# SpaceMolt Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend testbench/llms to run SpaceMolt game scenarios end-to-end — spawn the gameserver, seed it via fixture name, drive it with a local llama.cpp model via the existing `commander` agent loop, enforce world-level cutoffs, score, and persist results into the existing benchmark pipeline.

**Architecture:** Per scenario × model run, testbench spawns the Go SpaceMolt gameserver (`~/workspace/sm-plans`) and the TypeScript `commander` agent (`~/workspace/commander`) as subprocesses. Commander's pi-ai model provider is pointed at testbench's existing llama.cpp HTTP server on port 18080. Testbench reads commander's JSONL event stream, enforces wall-clock / token / tool-call cutoffs as world limits, then scores via Python ports of smbench's scenario scorers.

**Tech Stack:** Python 3.11+ (existing), pytest (new), PyYAML (existing), `requests` or stdlib `urllib` (stdlib only — match existing style), `subprocess` for process management, `bun` (assumed installed) for commander, Go gameserver binary (assumed built).

**Spec:** `docs/superpowers/specs/2026-04-07-spacemolt-scenarios-design.md`

---

## Conventions

- **Existing code style:** stdlib only for HTTP (match `runner.py:228-261` which uses `urllib.request`), dataclasses for value types (match `BenchmarkResult` at `common.py:402-423`), `print(..., flush=True)` for progress (match existing).
- **Test framework:** pytest. Fast unit tests do not touch network or subprocesses; integration test for end-to-end is marked `@pytest.mark.integration` and skipped unless `RUN_INTEGRATION=1`.
- **Commit cadence:** one commit per task. Commit messages: `feat: <task title>` or `test: <task title>`.
- **No existing tests in this repo** — Task 0 establishes the test harness.

---

## Task 0: Test harness setup

**Files:**
- Create: `tests/__init__.py` (empty)
- Create: `tests/conftest.py`
- Create: `pytest.ini`
- Modify: `.gitignore` (add `.pytest_cache/`)

- [ ] **Step 1: Verify pytest is importable**

Run: `python -c "import pytest; print(pytest.__version__)"`
Expected: a version string. If it fails, `pip install pytest pyyaml` first.

- [ ] **Step 2: Create `pytest.ini`**

```ini
[pytest]
testpaths = tests
markers =
    integration: end-to-end tests requiring gameserver and commander binaries (set RUN_INTEGRATION=1 to enable)
addopts = -ra --strict-markers
```

- [ ] **Step 3: Create `tests/__init__.py`**

Empty file.

- [ ] **Step 4: Create `tests/conftest.py`**

```python
"""Shared pytest fixtures for testbench/llms tests."""
import os
import sys
from pathlib import Path

# Make the project root importable so tests can `from common import ...`
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


def pytest_collection_modifyitems(config, items):
    """Skip @pytest.mark.integration tests unless RUN_INTEGRATION=1."""
    if os.environ.get("RUN_INTEGRATION") == "1":
        return
    skip = pytest.mark.skip(reason="integration test; set RUN_INTEGRATION=1 to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)
```

- [ ] **Step 5: Create a smoke test to verify the harness**

`tests/test_harness.py`:

```python
def test_harness_imports_common():
    import common
    assert hasattr(common, "BenchmarkResult")
```

- [ ] **Step 6: Run it**

Run: `pytest tests/test_harness.py -v`
Expected: 1 passed.

- [ ] **Step 7: Add `.pytest_cache/` to `.gitignore`**

Append the line if not already present.

- [ ] **Step 8: Commit**

```bash
git add tests/ pytest.ini .gitignore
git commit -m "test: add pytest harness"
```

---

## Task 1: Scenario dataclass and YAML loader

**Files:**
- Modify: `common.py` (add new section near the prompt loader, around line 380)
- Create: `prompts/scenarios/__example.yaml` (example only, will be replaced in Task 13)
- Create: `tests/test_scenarios.py`

The `Scenario` dataclass mirrors the YAML schema from the spec. The loader is parallel to `load_prompts()` at `common.py:355-379`.

- [ ] **Step 1: Write the failing test**

`tests/test_scenarios.py`:

```python
from pathlib import Path

import pytest
import yaml

from common import Scenario, load_scenarios


def test_load_scenarios_parses_yaml(tmp_path):
    scenario_file = tmp_path / "bootstrap.yaml"
    scenario_file.write_text(yaml.safe_dump({
        "name": "bootstrap_grind",
        "fixture": "s1-bootstrap-grind",
        "players": [{"id": "alice", "controlled_by": "llm"}],
        "scorer": "bootstrap_grind",
        "scorer_params": {"target_credits": 1000},
        "cutoffs": {"wall_clock_sec": 600, "total_tokens": 100000, "tool_calls": 200},
        "commander": {"max_turns": 250},
    }))

    scenarios = load_scenarios(tmp_path)
    assert len(scenarios) == 1
    s = scenarios[0]
    assert isinstance(s, Scenario)
    assert s.name == "bootstrap_grind"
    assert s.fixture == "s1-bootstrap-grind"
    assert s.players == [{"id": "alice", "controlled_by": "llm"}]
    assert s.scorer == "bootstrap_grind"
    assert s.scorer_params == {"target_credits": 1000}
    assert s.cutoffs.wall_clock_sec == 600
    assert s.cutoffs.total_tokens == 100000
    assert s.cutoffs.tool_calls == 200
    assert s.commander_max_turns == 250


def test_load_scenarios_requires_one_llm_player(tmp_path):
    scenario_file = tmp_path / "bad.yaml"
    scenario_file.write_text(yaml.safe_dump({
        "name": "bad",
        "fixture": "x",
        "players": [{"id": "a", "controlled_by": "scripted"}],
        "scorer": "generic",
        "cutoffs": {"wall_clock_sec": 60, "total_tokens": 1000, "tool_calls": 10},
    }))
    with pytest.raises(ValueError, match="exactly one"):
        load_scenarios(tmp_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_scenarios.py -v`
Expected: ImportError for `Scenario` / `load_scenarios`.

- [ ] **Step 3: Add `Scenario` dataclass and loader to `common.py`**

Insert at end of `common.py`, before the existing `# ── File utilities ──` section:

```python
# ── Scenario loader (game benchmarks) ──────────────────────────────────────

SCENARIOS_DIR = Path(__file__).parent / "prompts" / "scenarios"


@dataclass
class ScenarioCutoffs:
    wall_clock_sec: float
    total_tokens: int
    tool_calls: int


@dataclass
class Scenario:
    name: str
    fixture: str
    players: list[dict]
    scorer: str
    cutoffs: ScenarioCutoffs
    scorer_params: dict = field(default_factory=dict)
    commander_max_turns: int = 250

    @property
    def llm_player_id(self) -> str:
        return next(p["id"] for p in self.players if p.get("controlled_by") == "llm")


def load_scenarios(scenarios_dir: Path = SCENARIOS_DIR) -> list[Scenario]:
    """Load all scenario YAML files from a directory.

    Each YAML file contains one scenario (one document, not a list — different
    from prompts which are lists). Files starting with `_` are skipped.
    """
    import yaml
    scenarios: list[Scenario] = []
    if not scenarios_dir.exists():
        return scenarios
    for yaml_file in sorted(scenarios_dir.glob("*.yaml")):
        if yaml_file.name.startswith("_"):
            continue
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        if not data:
            continue

        llm_players = [p for p in data.get("players", []) if p.get("controlled_by") == "llm"]
        if len(llm_players) != 1:
            raise ValueError(
                f"Scenario {yaml_file.name}: must have exactly one player with "
                f"controlled_by: llm (found {len(llm_players)})"
            )

        cutoffs_raw = data.get("cutoffs", {})
        cutoffs = ScenarioCutoffs(
            wall_clock_sec=float(cutoffs_raw["wall_clock_sec"]),
            total_tokens=int(cutoffs_raw["total_tokens"]),
            tool_calls=int(cutoffs_raw["tool_calls"]),
        )

        scenarios.append(Scenario(
            name=data["name"],
            fixture=data["fixture"],
            players=data["players"],
            scorer=data["scorer"],
            scorer_params=data.get("scorer_params", {}),
            cutoffs=cutoffs,
            commander_max_turns=int(data.get("commander", {}).get("max_turns", 250)),
        ))
    return scenarios
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_scenarios.py -v`
Expected: 2 passed.

- [ ] **Step 5: Create `prompts/scenarios/` with a placeholder so the dir exists in git**

`prompts/scenarios/_placeholder.yaml`:

```yaml
# Placeholder. Real scenarios live in non-underscore files.
# See docs/superpowers/specs/2026-04-07-spacemolt-scenarios-design.md for schema.
```

The leading underscore makes the loader skip it.

- [ ] **Step 6: Commit**

```bash
git add common.py tests/test_scenarios.py prompts/scenarios/_placeholder.yaml
git commit -m "feat: add Scenario dataclass and YAML loader"
```

---

## Task 2: Extend BenchmarkResult and add scenario hash

**Files:**
- Modify: `common.py` (extend `BenchmarkResult` at lines 402-423; extend `_EXECUTION_FIELDS` at 491-497; add `compute_scenario_hash`)
- Modify: `tests/test_scenarios.py` (add hash test)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_scenarios.py`:

```python
from common import BenchmarkResult, compute_scenario_hash, ScenarioCutoffs, Scenario


def test_benchmark_result_has_scenario_fields():
    r = BenchmarkResult(model="m", runtime="llamacpp", prompt_name="p")
    assert r.scenario_name is None
    assert r.termination_reason is None
    assert r.tool_call_count is None
    assert r.final_state_summary is None


def test_compute_scenario_hash_stable():
    s = Scenario(
        name="x",
        fixture="fix",
        players=[{"id": "a", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={"target_credits": 1000},
        cutoffs=ScenarioCutoffs(wall_clock_sec=60, total_tokens=1000, tool_calls=10),
    )
    h1 = compute_scenario_hash(s)
    h2 = compute_scenario_hash(s)
    assert h1 == h2
    assert len(h1) == 12

    s2 = Scenario(
        name="x", fixture="fix",
        players=[{"id": "a", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={"target_credits": 2000},  # different
        cutoffs=ScenarioCutoffs(wall_clock_sec=60, total_tokens=1000, tool_calls=10),
    )
    assert compute_scenario_hash(s2) != h1
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_scenarios.py -v`
Expected: AttributeError on `scenario_name` / ImportError on `compute_scenario_hash`.

- [ ] **Step 3: Extend `BenchmarkResult`**

In `common.py`, modify the dataclass definition (currently at lines 402-423) by appending these fields after `prompt_hash`:

```python
    # ── Game scenario fields (None for prompt-based runs) ──
    scenario_name: Optional[str] = None
    termination_reason: Optional[str] = None  # completed | wall_clock | tokens | tool_calls | error
    tool_call_count: Optional[int] = None
    final_state_summary: Optional[dict] = None
    scenario_hash: Optional[str] = None
```

- [ ] **Step 4: Add `compute_scenario_hash`**

Below the existing `compute_prompt_hash` (around line 434):

```python
def compute_scenario_hash(scenario: "Scenario") -> str:
    """Hash of the scenario inputs that determine the run.

    Includes fixture, scorer config, cutoffs, and player config. Excludes the
    name (so renaming a scenario file does not invalidate cache).
    """
    parts = [
        scenario.fixture,
        scenario.scorer,
        json.dumps(scenario.scorer_params, sort_keys=True),
        json.dumps(scenario.players, sort_keys=True),
        f"{scenario.cutoffs.wall_clock_sec}|{scenario.cutoffs.total_tokens}|{scenario.cutoffs.tool_calls}",
        str(scenario.commander_max_turns),
    ]
    blob = "|".join(parts).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]
```

- [ ] **Step 5: Extend `_EXECUTION_FIELDS`**

In `common.py` around line 491, add the new persisted fields:

```python
_EXECUTION_FIELDS = {
    "model", "runtime", "prompt_name",
    "prompt_tokens", "generation_tokens", "prompt_tps", "generation_tps",
    "peak_memory_gb", "wall_time_sec",
    "output", "error",
    "prompt_hash",
    # game scenario fields
    "scenario_name", "termination_reason", "tool_call_count",
    "final_state_summary", "scenario_hash",
}
```

- [ ] **Step 6: Run tests, expect pass**

Run: `pytest tests/ -v`
Expected: all green.

- [ ] **Step 7: Verify existing benchmark.py still loads**

Run: `python -c "import benchmark"`
Expected: no error.

- [ ] **Step 8: Commit**

```bash
git add common.py tests/test_scenarios.py
git commit -m "feat: extend BenchmarkResult with scenario fields and hash"
```

---

## Task 3: Admin HTTP client (port of admin-client.ts)

**Files:**
- Create: `game_admin.py`
- Create: `tests/test_game_admin.py`

This is a Python port of `~/workspace/smbench/src/lib/admin-client.ts`. Stdlib `urllib` only, matching `runner.py`'s style.

- [ ] **Step 1: Write the failing test**

`tests/test_game_admin.py`:

```python
import json
from unittest.mock import patch, MagicMock

import pytest

from game_admin import AdminClient, AdminError


def _fake_response(status: int, body: bytes):
    resp = MagicMock()
    resp.status = status
    resp.read.return_value = body
    resp.__enter__ = lambda self: self
    resp.__exit__ = lambda self, *a: None
    return resp


def test_admin_client_reset_posts_with_fixture():
    client = AdminClient("http://localhost:8080", "tok")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value = _fake_response(200, b"{}")
        client.reset("s1-bootstrap-grind")
        req = urlopen.call_args[0][0]
        assert req.full_url == "http://localhost:8080/api/admin/benchmark/reset"
        assert req.get_method() == "POST"
        assert req.headers["Authorization"] == "Bearer tok"
        assert json.loads(req.data) == {"fixture": "s1-bootstrap-grind"}


def test_admin_client_get_player_stats():
    client = AdminClient("http://localhost:8080", "tok")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value = _fake_response(200, b'{"credits": 500, "stats": {"credits_earned": 500}}')
        stats = client.get_player_stats("alice")
        assert stats == {"credits": 500, "stats": {"credits_earned": 500}}
        req = urlopen.call_args[0][0]
        assert "player_id=alice" in req.full_url


def test_admin_client_raises_on_http_error():
    client = AdminClient("http://localhost:8080", "tok")
    with patch("urllib.request.urlopen") as urlopen:
        urlopen.return_value = _fake_response(500, b"boom")
        with pytest.raises(AdminError, match="500"):
            client.reset("x")
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_game_admin.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement `game_admin.py`**

```python
"""HTTP client for the SpaceMolt gameserver benchmark admin API.

Python port of smbench/src/lib/admin-client.ts. Stdlib-only to match runner.py.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class AdminError(RuntimeError):
    """Raised when an admin API request fails."""


class AdminClient:
    def __init__(self, server_url: str, admin_token: str, timeout: float = 10.0):
        self.base_url = server_url.rstrip("/")
        self.admin_token = admin_token
        self.timeout = timeout

    def _request(self, method: str, path: str, body: dict | None = None) -> Any:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.admin_token}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                if resp.status >= 300:
                    raise AdminError(f"{method} {path} failed: {resp.status}")
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise AdminError(f"{method} {path} failed: {e.code} {e.read()[:200]!r}") from e
        except urllib.error.URLError as e:
            raise AdminError(f"{method} {path} network error: {e}") from e

    def reset(self, fixture: str) -> None:
        """Reset the gameserver to a named fixture's starting state."""
        self._request("POST", "/api/admin/benchmark/reset", body={"fixture": fixture})

    def get_event_log(self) -> list:
        data = self._request("GET", "/api/admin/benchmark/event-log")
        return data if isinstance(data, list) else []

    def get_player_stats(self, player_id: str) -> dict:
        q = urllib.parse.urlencode({"player_id": player_id})
        data = self._request("GET", f"/api/admin/benchmark/player-stats?{q}")
        return data if isinstance(data, dict) else {}
```

> **Note for the engineer:** the `reset` endpoint in smbench's TS port does not currently send a fixture in the body — it relies on the gameserver having a single hardcoded fixture per scenario id known by the URL. This plan assumes the Go gameserver has been (or will be) extended to accept `{"fixture": "<name>"}`. If it has not, this is a one-line change in the gameserver: add a JSON body with a fixture key and dispatch on it. Do **not** silently fall back to ignoring the fixture — that would break Task 13's smoke test in a confusing way. If the gameserver does not support fixture selection, stop and raise the issue with the user before proceeding.

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_game_admin.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add game_admin.py tests/test_game_admin.py
git commit -m "feat: add gameserver admin HTTP client"
```

---

## Task 4: Gameserver lifecycle manager

**Files:**
- Create: `game_lifecycle.py`
- Create: `tests/test_game_lifecycle.py`

Python port of `~/workspace/smbench/src/lib/server-lifecycle.ts`, narrowed to just the gameserver (no LLM server — testbench owns that already via `runner.py`).

- [ ] **Step 1: Write the failing test**

`tests/test_game_lifecycle.py`:

```python
from unittest.mock import patch, MagicMock

import pytest

from game_lifecycle import wait_for_healthy, HealthCheckTimeout


def test_wait_for_healthy_returns_on_first_ok():
    resp = MagicMock(status=200)
    resp.__enter__ = lambda self: self
    resp.__exit__ = lambda self, *a: None
    with patch("urllib.request.urlopen", return_value=resp):
        wait_for_healthy("http://x/health", timeout_sec=1.0, interval_sec=0.01)


def test_wait_for_healthy_times_out():
    with patch("urllib.request.urlopen", side_effect=ConnectionError("nope")):
        with pytest.raises(HealthCheckTimeout):
            wait_for_healthy("http://x/health", timeout_sec=0.1, interval_sec=0.01)
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_game_lifecycle.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement `game_lifecycle.py`**

```python
"""SpaceMolt gameserver process lifecycle.

Python port of smbench/src/lib/server-lifecycle.ts (gameserver bits only).
"""

import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional


class HealthCheckTimeout(RuntimeError):
    pass


def wait_for_healthy(url: str, timeout_sec: float, interval_sec: float = 1.0) -> None:
    """Poll `url` until it returns 2xx, or raise HealthCheckTimeout."""
    deadline = time.perf_counter() + timeout_sec
    while time.perf_counter() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 300:
                    return
        except (urllib.error.URLError, ConnectionError, OSError):
            pass
        time.sleep(interval_sec)
    raise HealthCheckTimeout(f"Timed out waiting for {url}")


def start_gameserver(
    binary_path: Path,
    port: int,
    admin_token: str,
    tick_rate: int = 10,
    timeout_sec: float = 30.0,
) -> subprocess.Popen:
    """Spawn the gameserver binary, wait until /health returns 200, return the process.

    Raises HealthCheckTimeout (and kills the child) on failure.
    """
    env = {
        **os.environ,
        "PORT": str(port),
        "ADMIN_API_TOKEN": admin_token,
        "TICK_RATE": str(tick_rate),
    }
    print(f"    Starting gameserver on port {port}...", flush=True)
    proc = subprocess.Popen(
        [str(binary_path)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        wait_for_healthy(f"http://127.0.0.1:{port}/health", timeout_sec=timeout_sec)
    except HealthCheckTimeout:
        stop_gameserver(proc)
        raise
    print(f"    Gameserver ready.", flush=True)
    return proc


def stop_gameserver(proc: subprocess.Popen, grace_sec: float = 5.0) -> None:
    """SIGTERM, wait `grace_sec`, then SIGKILL if still alive."""
    if proc.poll() is not None:
        return
    print(f"    Stopping gameserver (pid {proc.pid})...", flush=True)
    proc.terminate()
    try:
        proc.wait(timeout=grace_sec)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_game_lifecycle.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add game_lifecycle.py tests/test_game_lifecycle.py
git commit -m "feat: add gameserver lifecycle manager"
```

---

## Task 5: Port allocation helper

**Files:**
- Modify: `game_lifecycle.py` (add `allocate_port`)
- Modify: `tests/test_game_lifecycle.py`

Bind to port 0, read what the OS gave us, close the socket, return the number. Standard recipe; handles parallel runs without collision and is good enough for sequential runs too.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_game_lifecycle.py`:

```python
from game_lifecycle import allocate_port


def test_allocate_port_returns_high_port():
    p = allocate_port()
    assert 1024 < p < 65536


def test_allocate_port_unique_under_repetition():
    seen = set()
    for _ in range(20):
        seen.add(allocate_port())
    # Not strictly guaranteed unique but extremely likely
    assert len(seen) > 1
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_game_lifecycle.py -v`
Expected: ImportError.

- [ ] **Step 3: Add `allocate_port`**

Append to `game_lifecycle.py`:

```python
import socket


def allocate_port() -> int:
    """Bind to port 0 to let the OS pick a free high port, then close and return it.

    Inherently racy (the port could be claimed before we use it), but adequate for
    benchmark runs that immediately spawn the gameserver after allocation.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_game_lifecycle.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add game_lifecycle.py tests/test_game_lifecycle.py
git commit -m "feat: add allocate_port helper"
```

---

## Task 6: Configuration for paths and commander wiring (INVESTIGATION + CODE)

**Files:**
- Modify: `common.py` (add path constants near line 22)
- Create: `tests/test_paths_config.py`

This task has an **investigation step** because the exact env-var / model-string combo for pointing commander's pi-ai layer at testbench's llama.cpp server needs to be confirmed against `~/workspace/commander/src/model.ts`. Do not skip the investigation.

- [ ] **Step 1: Investigate commander's local-model wiring**

Read `~/workspace/commander/src/model.ts` (specifically around the `resolveModel` function, ~lines 45-110 per the spec's analysis).

Identify:
1. **Which provider name** maps to a local OpenAI-compatible HTTP server. Candidates: `ollama/...`, `lmstudio/...`, `openai-compat/...`, or a generic prefix.
2. **Which env var** that provider reads for its base URL. Candidates: `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL`, `OPENAI_BASE_URL`.
3. **What model name format** commander expects on its `--model` flag for that provider.
4. **Whether** an API key is required (likely a dummy value works for local).

Write the answers as a 4-line comment in `common.py` next to the new constants in Step 3 below. Do not guess — if the file does not make this clear, stop and ask the user.

- [ ] **Step 2: Write the failing test**

`tests/test_paths_config.py`:

```python
from pathlib import Path

from common import (
    GAMESERVER_BINARY, COMMANDER_DIR, COMMANDER_LOCAL_PROVIDER,
    COMMANDER_LOCAL_BASE_URL_ENV,
)


def test_path_constants_are_paths():
    assert isinstance(GAMESERVER_BINARY, Path)
    assert isinstance(COMMANDER_DIR, Path)


def test_commander_local_provider_constants_present():
    # Filled in from Task 6 Step 1 investigation
    assert COMMANDER_LOCAL_PROVIDER  # non-empty
    assert COMMANDER_LOCAL_BASE_URL_ENV  # non-empty
```

- [ ] **Step 3: Run, expect failure**

Run: `pytest tests/test_paths_config.py -v`
Expected: ImportError.

- [ ] **Step 4: Add path and commander config to `common.py`**

Insert near the existing path constants (around line 22):

```python
# ── External tool paths (gameserver / commander) ───────────────────────────

# Override via env vars for CI / alternate checkouts.
GAMESERVER_BINARY = Path(os.environ.get(
    "TESTBENCH_GAMESERVER_BINARY",
    str(Path.home() / "workspace" / "sm-plans" / "bin" / "spacemolt-server"),
))
COMMANDER_DIR = Path(os.environ.get(
    "TESTBENCH_COMMANDER_DIR",
    str(Path.home() / "workspace" / "commander"),
))

# Commander pi-ai provider config — fill these in from the Task 6 investigation.
# Investigation result (from ~/workspace/commander/src/model.ts):
#   provider: <FILL IN — e.g. "ollama">
#   base url env var: <FILL IN — e.g. "OLLAMA_BASE_URL">
#   model string format: <FILL IN — e.g. "ollama/<model-name>">
#   api key required: <FILL IN — yes/no, name>
COMMANDER_LOCAL_PROVIDER = "<FILL IN>"
COMMANDER_LOCAL_BASE_URL_ENV = "<FILL IN>"
```

Add `import os` at the top of `common.py` if it is not already imported.

> **Important:** The two `<FILL IN>` strings must be replaced with real values from the investigation before Step 5 will pass. The test asserts they are non-empty; the *real* validation happens in the smoke test in Task 14, where commander either talks to llama.cpp or it doesn't.

- [ ] **Step 5: Run tests, expect pass**

Run: `pytest tests/test_paths_config.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add common.py tests/test_paths_config.py
git commit -m "feat: add gameserver and commander path config"
```

---

## Task 7: Commander subprocess runner with JSONL event stream

**Files:**
- Create: `commander_runner.py`
- Create: `tests/test_commander_runner.py`

Spawns commander as a subprocess and provides a generator over JSONL events from its stdout. Modeled on `~/workspace/smbench/src/lib/process.ts:32-98` but in Python with line-by-line iteration instead of a one-shot promise — that's what the watchdog in Task 8 needs.

- [ ] **Step 1: Write the failing test**

`tests/test_commander_runner.py`:

```python
import io
import json
from unittest.mock import patch, MagicMock

from commander_runner import iter_events, CommanderEvent


def _fake_proc(stdout_lines: list[str]):
    proc = MagicMock()
    proc.stdout = io.StringIO("".join(line + "\n" for line in stdout_lines))
    proc.poll.return_value = None
    return proc


def test_iter_events_parses_jsonl_only():
    proc = _fake_proc([
        '{"event": "turn_start", "tick": 1, "ts": "t"}',
        'plain log line, ignored',
        '{"event": "tool_call", "tick": 2, "ts": "t", "tool": "scan"}',
        '',
    ])
    events = list(iter_events(proc))
    assert len(events) == 2
    assert events[0].event == "turn_start"
    assert events[1].event == "tool_call"
    assert events[1].data["tool"] == "scan"


def test_iter_events_stops_on_eof():
    proc = _fake_proc([])
    assert list(iter_events(proc)) == []
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_commander_runner.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement `commander_runner.py`**

```python
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
        "bun", "run", "src/index.ts",
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
```

> **Note:** The exact commander entrypoint (`src/index.ts` above) was inferred from smbench's invocation pattern. Verify against the actual `~/workspace/commander/package.json` `"main"` field or its CLI script. If different, fix the `args` list.

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_commander_runner.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add commander_runner.py tests/test_commander_runner.py
git commit -m "feat: add commander subprocess runner with JSONL event iterator"
```

---

## Task 8: Cutoff watchdog

**Files:**
- Create: `cutoff_watchdog.py`
- Create: `tests/test_cutoff_watchdog.py`

A pure-state machine that consumes events one at a time and decides whether a cutoff has tripped. No threading, no I/O — easy to test thoroughly.

- [ ] **Step 1: Write the failing test**

`tests/test_cutoff_watchdog.py`:

```python
import pytest

from commander_runner import CommanderEvent
from common import ScenarioCutoffs
from cutoff_watchdog import CutoffWatchdog


def _ev(name: str, **data) -> CommanderEvent:
    return CommanderEvent(event=name, tick=0, ts="t", data=data)


def cutoffs(**overrides):
    base = dict(wall_clock_sec=600, total_tokens=1000, tool_calls=10)
    base.update(overrides)
    return ScenarioCutoffs(**base)


def test_no_cutoff_when_under_limits():
    w = CutoffWatchdog(cutoffs(), now=lambda: 0.0)
    w.observe(_ev("tool_call", tool="scan"))
    w.observe(_ev("turn_end", total_tokens_in=10, total_tokens_out=20))
    assert w.tripped() is None


def test_tool_calls_cutoff():
    w = CutoffWatchdog(cutoffs(tool_calls=2), now=lambda: 0.0)
    w.observe(_ev("tool_call"))
    w.observe(_ev("tool_call"))
    assert w.tripped() is None
    w.observe(_ev("tool_call"))
    assert w.tripped() == "tool_calls"


def test_token_cutoff_uses_latest_turn_end():
    w = CutoffWatchdog(cutoffs(total_tokens=100), now=lambda: 0.0)
    w.observe(_ev("turn_end", total_tokens_in=40, total_tokens_out=40))
    assert w.tripped() is None
    w.observe(_ev("turn_end", total_tokens_in=60, total_tokens_out=60))
    assert w.tripped() == "tokens"


def test_wall_clock_cutoff():
    clock = [0.0]
    w = CutoffWatchdog(cutoffs(wall_clock_sec=10), now=lambda: clock[0])
    w.observe(_ev("turn_start"))
    assert w.tripped() is None
    clock[0] = 11.0
    assert w.tripped() == "wall_clock"


def test_first_cutoff_wins():
    clock = [0.0]
    w = CutoffWatchdog(cutoffs(wall_clock_sec=10, tool_calls=1), now=lambda: clock[0])
    w.observe(_ev("tool_call"))
    w.observe(_ev("tool_call"))  # trips tool_calls
    clock[0] = 1000
    # tool_calls already tripped first; result should remain
    assert w.tripped() == "tool_calls"


def test_token_count_and_tool_count_exposed():
    w = CutoffWatchdog(cutoffs(), now=lambda: 0.0)
    w.observe(_ev("tool_call"))
    w.observe(_ev("tool_call"))
    w.observe(_ev("turn_end", total_tokens_in=30, total_tokens_out=70))
    assert w.tool_call_count == 2
    assert w.total_tokens == 100
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_cutoff_watchdog.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement `cutoff_watchdog.py`**

```python
"""Cutoff watchdog: pure state machine over CommanderEvents.

Tracks running counts of tool calls and total tokens, plus elapsed wall-clock
time, and reports the first cutoff to trip. The watchdog is the single source
of truth for "world limits" per the design doc — commander may have its own
softer turn limits as guard rails.
"""

import time
from typing import Callable, Optional

from commander_runner import CommanderEvent
from common import ScenarioCutoffs


class CutoffWatchdog:
    def __init__(self, cutoffs: ScenarioCutoffs, now: Callable[[], float] = time.perf_counter):
        self.cutoffs = cutoffs
        self._now = now
        self._start = now()
        self._tripped: Optional[str] = None
        self.tool_call_count = 0
        self.total_tokens = 0  # latest turn_end's in+out

    def observe(self, event: CommanderEvent) -> None:
        if event.event == "tool_call":
            self.tool_call_count += 1
        elif event.event == "turn_end":
            tokens_in = int(event.data.get("total_tokens_in", 0))
            tokens_out = int(event.data.get("total_tokens_out", 0))
            self.total_tokens = tokens_in + tokens_out

    def tripped(self) -> Optional[str]:
        """Return the name of the first cutoff that has tripped, or None.

        Sticky: once a cutoff has tripped, the same name is returned forever.
        """
        if self._tripped is not None:
            return self._tripped
        if self.tool_call_count > self.cutoffs.tool_calls:
            self._tripped = "tool_calls"
        elif self.total_tokens > self.cutoffs.total_tokens:
            self._tripped = "tokens"
        elif (self._now() - self._start) > self.cutoffs.wall_clock_sec:
            self._tripped = "wall_clock"
        return self._tripped

    @property
    def elapsed_sec(self) -> float:
        return self._now() - self._start
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_cutoff_watchdog.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add cutoff_watchdog.py tests/test_cutoff_watchdog.py
git commit -m "feat: add cutoff watchdog state machine"
```

---

## Task 9: GameSession orchestrator

**Files:**
- Create: `game_session.py`
- Create: `tests/test_game_session.py`

Composes everything from Tasks 3-8 into a single function: given a model + scenario, run one game and return a `GameSessionResult`. This is the seam Task 11 will plug into the runner.

- [ ] **Step 1: Write the failing test (unit test of result aggregation)**

`tests/test_game_session.py`:

```python
from unittest.mock import MagicMock, patch

from commander_runner import CommanderEvent
from common import Scenario, ScenarioCutoffs
from game_session import GameSessionResult, run_game_session


def _scenario(**overrides):
    base = dict(
        name="test",
        fixture="fix",
        players=[{"id": "alice", "controlled_by": "llm"}],
        scorer="generic",
        cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=100),
    )
    base.update(overrides)
    return Scenario(**base)


def test_run_game_session_completes_normally(monkeypatch):
    """Commander exits cleanly, no cutoffs trip."""
    fake_proc = MagicMock()
    fake_proc.poll.return_value = 0
    fake_proc.wait.return_value = 0

    events = [
        CommanderEvent("turn_start", 1, "t"),
        CommanderEvent("tool_call", 1, "t", {"tool": "scan"}),
        CommanderEvent("turn_end", 1, "t", {"total_tokens_in": 50, "total_tokens_out": 80}),
    ]

    fake_admin = MagicMock()
    fake_admin.get_player_stats.return_value = {"credits": 100, "stats": {"credits_earned": 100}}
    fake_admin.get_event_log.return_value = []

    fake_gs_proc = MagicMock()
    fake_gs_proc.poll.return_value = None

    with patch("game_session.start_gameserver", return_value=fake_gs_proc), \
         patch("game_session.stop_gameserver"), \
         patch("game_session.allocate_port", return_value=18091), \
         patch("game_session.AdminClient", return_value=fake_admin), \
         patch("game_session.spawn_commander", return_value=fake_proc), \
         patch("game_session.iter_events", return_value=iter(events)):

        result = run_game_session(
            scenario=_scenario(),
            model_name="qwen-7b",
            commander_model_string="ollama/qwen-7b",
            scenario_path="/tmp/whatever.yaml",
        )

    assert isinstance(result, GameSessionResult)
    assert result.termination_reason == "completed"
    assert result.tool_call_count == 1
    assert result.total_tokens == 130
    assert result.final_player_stats == {"credits": 100, "stats": {"credits_earned": 100}}
    fake_admin.reset.assert_called_once_with("fix")


def test_run_game_session_trips_tool_call_cutoff():
    fake_proc = MagicMock()
    fake_proc.poll.return_value = None  # still running

    # Three tool_calls, cutoff at 2
    events = [CommanderEvent("tool_call", i, "t") for i in range(3)]

    fake_admin = MagicMock()
    fake_admin.get_player_stats.return_value = {}
    fake_admin.get_event_log.return_value = []
    fake_gs_proc = MagicMock()

    sc = _scenario(cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=2))

    with patch("game_session.start_gameserver", return_value=fake_gs_proc), \
         patch("game_session.stop_gameserver"), \
         patch("game_session.allocate_port", return_value=18091), \
         patch("game_session.AdminClient", return_value=fake_admin), \
         patch("game_session.spawn_commander", return_value=fake_proc), \
         patch("game_session.iter_events", return_value=iter(events)):

        result = run_game_session(
            scenario=sc,
            model_name="qwen-7b",
            commander_model_string="ollama/qwen-7b",
            scenario_path="/tmp/whatever.yaml",
        )

    assert result.termination_reason == "tool_calls"
    fake_proc.terminate.assert_called()
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_game_session.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement `game_session.py`**

```python
"""Run one SpaceMolt game session: gameserver + commander + cutoff watchdog.

Assembles game_admin, game_lifecycle, commander_runner, and cutoff_watchdog
into a single entry point. Tests use mocks; the integration smoke test in
tests/test_game_session_integration.py exercises the real binaries.
"""

import secrets
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from common import (
    GAMESERVER_BINARY, COMMANDER_DIR,
    COMMANDER_LOCAL_BASE_URL_ENV,
    Scenario,
)
from game_admin import AdminClient, AdminError
from game_lifecycle import allocate_port, start_gameserver, stop_gameserver
from commander_runner import CommanderEvent, iter_events, spawn_commander
from cutoff_watchdog import CutoffWatchdog


LLAMACPP_BASE_URL = "http://127.0.0.1:18080/v1"  # matches runner.LLAMACPP_PORT


@dataclass
class GameSessionResult:
    scenario_name: str
    termination_reason: str  # completed | wall_clock | tokens | tool_calls | error
    tool_call_count: int
    total_tokens: int
    elapsed_sec: float
    events: list[CommanderEvent] = field(default_factory=list)
    final_player_stats: dict = field(default_factory=dict)
    final_event_log: list = field(default_factory=list)
    error: Optional[str] = None


def run_game_session(
    scenario: Scenario,
    model_name: str,
    commander_model_string: str,
    scenario_path: str,
) -> GameSessionResult:
    """Run one scenario × model game session end to end.

    `commander_model_string` is the value passed to commander's `--model` flag,
    formatted for the local provider (see Task 6 investigation — e.g.
    "ollama/qwen2.5-7b-instruct").

    `scenario_path` is the path commander reads for scenario goal text. For
    SpaceMolt this is the markdown scenario file in ~/workspace/smbench/scenarios,
    NOT the testbench YAML.
    """
    port = allocate_port()
    admin_token = secrets.token_hex(16)
    session_id = uuid.uuid4().hex[:8]
    server_url = f"http://127.0.0.1:{port}"

    events: list[CommanderEvent] = []
    watchdog = CutoffWatchdog(scenario.cutoffs)
    termination = "error"
    error: Optional[str] = None
    final_stats: dict = {}
    final_log: list = []

    gs_proc = None
    cmd_proc = None
    try:
        gs_proc = start_gameserver(GAMESERVER_BINARY, port=port, admin_token=admin_token)
        admin = AdminClient(server_url, admin_token)
        admin.reset(scenario.fixture)

        cmd_proc = spawn_commander(
            commander_dir=COMMANDER_DIR,
            model=commander_model_string,
            scenario_path=Path(scenario_path),
            server_url=server_url,
            session=session_id,
            llm_base_url_env=COMMANDER_LOCAL_BASE_URL_ENV,
            llm_base_url=LLAMACPP_BASE_URL,
        )

        for event in iter_events(cmd_proc):
            events.append(event)
            watchdog.observe(event)
            if watchdog.tripped() is not None:
                termination = watchdog.tripped()
                cmd_proc.terminate()
                try:
                    cmd_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    cmd_proc.kill()
                break
        else:
            # Generator exhausted normally — commander exited
            cmd_proc.wait(timeout=10)
            termination = "completed"

        try:
            final_stats = admin.get_player_stats(scenario.llm_player_id)
            final_log = admin.get_event_log()
        except AdminError as e:
            # Final-state read failure shouldn't mask the run; record but continue
            error = f"final-state read: {e}"

    except Exception as e:
        termination = "error"
        error = str(e)[:200]
    finally:
        if cmd_proc is not None and cmd_proc.poll() is None:
            cmd_proc.terminate()
            try:
                cmd_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cmd_proc.kill()
        if gs_proc is not None:
            stop_gameserver(gs_proc)

    return GameSessionResult(
        scenario_name=scenario.name,
        termination_reason=termination,
        tool_call_count=watchdog.tool_call_count,
        total_tokens=watchdog.total_tokens,
        elapsed_sec=watchdog.elapsed_sec,
        events=events,
        final_player_stats=final_stats,
        final_event_log=final_log,
        error=error,
    )
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_game_session.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add game_session.py tests/test_game_session.py
git commit -m "feat: add GameSession orchestrator"
```

---

## Task 10: game_scorers.py — port smbench scorers

**Files:**
- Create: `game_scorers.py`
- Create: `tests/test_game_scorers.py`

Port the four named scorers + generic fallback from `~/workspace/smbench/src/lib/scorer.ts:18-99`. Each scorer takes a `GameSessionResult` and a params dict, returns `(score: float in [0,1], details: str)`.

- [ ] **Step 1: Write the failing test**

`tests/test_game_scorers.py`:

```python
import pytest

from commander_runner import CommanderEvent
from game_scorers import score_game, ScorerNotFound
from game_session import GameSessionResult


def _result(events=None, stats=None, **overrides):
    base = dict(
        scenario_name="test",
        termination_reason="completed",
        tool_call_count=0,
        total_tokens=0,
        elapsed_sec=0.0,
        events=events or [],
        final_player_stats=stats or {},
        final_event_log=[],
    )
    base.update(overrides)
    return GameSessionResult(**base)


def test_bootstrap_grind_full_credit():
    events = [CommanderEvent("tool_call", 1, "t") for _ in range(30)]
    result = _result(
        events=events,
        stats={"credits": 5000, "stats": {"credits_earned": 5000}},
        tool_call_count=30,
    )
    score, details = score_game("bootstrap_grind", result, {})
    # 40 (credits) + 20 (efficiency, no errors) + 20 (activity 30/30) + 20 (ratio 5000/30=166>30)
    # = 100 / 100 = 1.0
    assert score == pytest.approx(1.0, abs=0.01)
    assert "credits_earned=5000" in details


def test_bootstrap_grind_zero():
    result = _result(stats={"credits": 0, "stats": {"credits_earned": 0}})
    score, details = score_game("bootstrap_grind", result, {})
    assert score == 0.0


def test_bootstrap_grind_with_tool_errors_dilutes_efficiency():
    events = [CommanderEvent("tool_call", 1, "t")] * 5 + [CommanderEvent("tool_error", 1, "t")] * 5
    result = _result(events=events, stats={"credits": 0, "stats": {"credits_earned": 0}})
    score, _ = score_game("bootstrap_grind", result, {})
    # Only efficiency contributes: 0.5 * 20 = 10 → 0.10 normalized
    assert score == pytest.approx(0.10, abs=0.01)


def test_navigation():
    result = _result(stats={"stats": {"systems_explored": 10}}, tool_call_count=20)
    result.events = [CommanderEvent("tool_call", 1, "t")] * 20
    score, _ = score_game("navigation", result, {})
    # 50 (exploration) + 25 (efficiency) + 25 (activity) = 100 → 1.0
    assert score == pytest.approx(1.0, abs=0.01)


def test_generic_fallback():
    events = [CommanderEvent("tool_call", 1, "t")] * 30
    result = _result(events=events, tool_call_count=30)
    score, _ = score_game("generic", result, {})
    # 50 efficiency + 50 activity = 100 → 1.0
    assert score == pytest.approx(1.0, abs=0.01)


def test_unknown_scorer_raises():
    with pytest.raises(ScorerNotFound):
        score_game("does_not_exist", _result(), {})
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_game_scorers.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement `game_scorers.py`**

```python
"""Game scenario scorers — Python port of smbench/src/lib/scorer.ts.

Each scorer takes a GameSessionResult and params dict, returns (score, details)
where score is in [0, 1] (matching testbench's existing 0-1 normalization) and
details is a human-readable summary string for the report.

Note: smbench uses a 0-100 scale; we divide by 100 here to match testbench's
existing scoring convention (see _score_constraints in runner.py:175).
"""

from typing import Callable

from game_session import GameSessionResult


class ScorerNotFound(KeyError):
    pass


def _tool_metrics(result: GameSessionResult) -> tuple[int, int, float]:
    tool_calls = sum(1 for e in result.events if e.event == "tool_call")
    tool_errors = sum(1 for e in result.events if e.event == "tool_error")
    total = tool_calls + tool_errors
    accuracy = tool_calls / total if total > 0 else 0.0
    return total, tool_errors, accuracy


def _stat(stats: dict, key: str) -> float:
    inner = stats.get("stats", {}) if isinstance(stats, dict) else {}
    return float(inner.get(key, 0))


def _bootstrap_grind(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    credits_earned = _stat(result.final_player_stats, "credits_earned")
    earn_ratio = (credits_earned / total_tools) if total_tools > 0 else 0.0

    credit_score = min(credits_earned / 5000, 1) * 40
    efficiency_score = accuracy * 20
    activity_score = min(total_tools / 30, 1) * 20
    ratio_score = min(earn_ratio / 30, 1) * 20

    raw = credit_score + efficiency_score + activity_score + ratio_score
    return raw / 100, (
        f"credits_earned={int(credits_earned)} tools={total_tools} "
        f"errors={errors} ratio={earn_ratio:.1f}"
    )


def _navigation(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    explored = _stat(result.final_player_stats, "systems_explored")

    exploration = min(explored / 10, 1) * 50
    efficiency = accuracy * 25
    activity = min(total_tools / 20, 1) * 25
    raw = exploration + efficiency + activity
    return raw / 100, f"systems_explored={int(explored)} tools={total_tools} errors={errors}"


def _trading(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    credits = float(result.final_player_stats.get("credits", 0))
    earned = _stat(result.final_player_stats, "credits_earned")

    credit_score = min(credits / 15000, 1) * 40
    earned_score = min(earned / 20000, 1) * 30
    efficiency = accuracy * 15
    activity = min(total_tools / 40, 1) * 15
    raw = credit_score + earned_score + efficiency + activity
    return raw / 100, f"credits={int(credits)} earned={int(earned)} tools={total_tools}"


def _combat(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    pirates = _stat(result.final_player_stats, "pirates_destroyed")

    pirate_score = min(pirates / 3, 1) * 50
    efficiency = accuracy * 25
    activity = min(total_tools / 30, 1) * 25
    raw = pirate_score + efficiency + activity
    return raw / 100, f"pirates_destroyed={int(pirates)} tools={total_tools}"


def _generic(result: GameSessionResult, params: dict) -> tuple[float, str]:
    total_tools, errors, accuracy = _tool_metrics(result)
    efficiency = accuracy * 50
    activity = min(total_tools / 30, 1) * 50
    raw = efficiency + activity
    return raw / 100, f"tools={total_tools} errors={errors} accuracy={accuracy:.2f}"


_REGISTRY: dict[str, Callable[[GameSessionResult, dict], tuple[float, str]]] = {
    "bootstrap_grind": _bootstrap_grind,
    "navigation": _navigation,
    "trading": _trading,
    "combat": _combat,
    "generic": _generic,
}


def score_game(scorer_name: str, result: GameSessionResult, params: dict) -> tuple[float, str]:
    if scorer_name not in _REGISTRY:
        raise ScorerNotFound(f"Unknown game scorer: {scorer_name}")
    return _REGISTRY[scorer_name](result, params)
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_game_scorers.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add game_scorers.py tests/test_game_scorers.py
git commit -m "feat: port smbench game scorers to Python"
```

---

## Task 11: runner.py integration — run_game_scenario + score branch

**Files:**
- Modify: `runner.py` (add `run_game_scenario` and a `game` branch in `score_result`)
- Create: `tests/test_runner_game.py`

`run_game_scenario` is the parallel of `run_llamacpp_prompt` (`runner.py:300-337`). It produces a `BenchmarkResult` with the new game fields populated. `score_result` learns to dispatch on `scorer == "game"` (where the prompt_cfg is actually a scenario coerced into the same dict shape; see Task 12).

- [ ] **Step 1: Write the failing test**

`tests/test_runner_game.py`:

```python
from unittest.mock import patch, MagicMock

from common import BenchmarkResult, Scenario, ScenarioCutoffs
from commander_runner import CommanderEvent
from game_session import GameSessionResult
from runner import run_game_scenario, score_result


def _scenario():
    return Scenario(
        name="bootstrap_grind",
        fixture="s1-bootstrap-grind",
        players=[{"id": "alice", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={},
        cutoffs=ScenarioCutoffs(wall_clock_sec=600, total_tokens=10000, tool_calls=100),
    )


def test_run_game_scenario_populates_benchmark_result():
    fake_session = GameSessionResult(
        scenario_name="bootstrap_grind",
        termination_reason="completed",
        tool_call_count=15,
        total_tokens=2500,
        elapsed_sec=42.0,
        events=[CommanderEvent("tool_call", i, "t") for i in range(15)],
        final_player_stats={"credits": 1000, "stats": {"credits_earned": 1000}},
    )
    model_cfg = {"name": "Qwen 2.5 7B Instruct"}

    with patch("runner.run_game_session", return_value=fake_session):
        r = run_game_scenario(
            model_cfg=model_cfg,
            scenario=_scenario(),
            commander_model_string="ollama/qwen2.5-7b",
            scenario_md_path="/fake/s1.md",
        )

    assert isinstance(r, BenchmarkResult)
    assert r.model == "Qwen 2.5 7B Instruct"
    assert r.runtime == "llamacpp"
    assert r.scenario_name == "bootstrap_grind"
    assert r.tool_call_count == 15
    assert r.termination_reason == "completed"
    assert r.wall_time_sec == 42.0
    assert r.final_state_summary == {"credits": 1000, "stats": {"credits_earned": 1000}}


def test_score_result_dispatches_to_game_scorer():
    r = BenchmarkResult(model="m", runtime="llamacpp", prompt_name="bootstrap_grind")
    r.scenario_name = "bootstrap_grind"
    r.tool_call_count = 30
    r.final_state_summary = {"credits": 5000, "stats": {"credits_earned": 5000}}
    r.output = "ignored for game scorers"

    # The "prompt_cfg" for a scenario carries scorer + scorer_params + game flag
    pcfg = {
        "scorer": "game",
        "game_scorer": "bootstrap_grind",
        "scorer_params": {},
        "category": "game",
    }
    # Simulate that game_session populated events + stats; for the score path
    # we inject them via a synthetic GameSessionResult on the result object.
    from commander_runner import CommanderEvent
    from game_session import GameSessionResult
    r._game_session = GameSessionResult(  # type: ignore[attr-defined]
        scenario_name="bootstrap_grind",
        termination_reason="completed",
        tool_call_count=30,
        total_tokens=1000,
        elapsed_sec=10.0,
        events=[CommanderEvent("tool_call", i, "t") for i in range(30)],
        final_player_stats={"credits": 5000, "stats": {"credits_earned": 5000}},
    )

    score_result(r, pcfg)
    assert r.score is not None
    assert r.score > 0.5
```

- [ ] **Step 2: Run, expect failure**

Run: `pytest tests/test_runner_game.py -v`
Expected: ImportError.

- [ ] **Step 3: Add `run_game_scenario` and the `game` scorer branch to `runner.py`**

Add these imports at the top of `runner.py`:

```python
from common import (
    LLAMA_CLI, LLAMA_SERVER, LLAMA_CACHE_DIR,
    BenchmarkResult,
    Scenario,
    compute_scenario_hash,
)
from game_session import run_game_session, GameSessionResult
from game_scorers import score_game, ScorerNotFound
```

Modify `score_result` (currently `runner.py:104-129`) to add the game branch *before* the `if scorer == "exact_match":` line:

```python
    if scorer == "game":
        _score_game(result, prompt_cfg)
        return
```

And add the new helper at the end of the scoring section:

```python
def _score_game(result: BenchmarkResult, prompt_cfg: dict) -> None:
    session: Optional[GameSessionResult] = getattr(result, "_game_session", None)
    if session is None:
        result.score = 0.0
        result.score_details = "no game session attached"
        return
    try:
        score, details = score_game(
            prompt_cfg["game_scorer"],
            session,
            prompt_cfg.get("scorer_params", {}),
        )
    except ScorerNotFound as e:
        result.score = 0.0
        result.score_details = str(e)
        return
    result.score = score
    result.score_details = details
```

Add `run_game_scenario` near the end of the llama.cpp runner section (after `run_llamacpp_prompt`):

```python
def run_game_scenario(
    model_cfg: dict,
    scenario: Scenario,
    commander_model_string: str,
    scenario_md_path: str,
) -> BenchmarkResult:
    """Run a SpaceMolt scenario against the already-running llama-server.

    Returns a BenchmarkResult with both the standard fields and the new
    scenario-specific fields. The score is NOT computed here — call
    score_result() afterward, which will dispatch to the game scorer.
    """
    result = BenchmarkResult(
        model=model_cfg["name"],
        runtime="llamacpp",
        prompt_name=scenario.name,
    )
    result.scenario_name = scenario.name
    result.scenario_hash = compute_scenario_hash(scenario)

    session = run_game_session(
        scenario=scenario,
        model_name=model_cfg["name"],
        commander_model_string=commander_model_string,
        scenario_path=scenario_md_path,
    )

    result.wall_time_sec = session.elapsed_sec
    result.termination_reason = session.termination_reason
    result.tool_call_count = session.tool_call_count
    result.generation_tokens = session.total_tokens  # best-available token total
    result.final_state_summary = session.final_player_stats
    if session.error:
        result.error = session.error

    # Stash the session on the result so score_result can read it without
    # re-running the game. This is an in-memory-only attribute; not persisted.
    result._game_session = session  # type: ignore[attr-defined]
    return result
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pytest tests/test_runner_game.py -v`
Expected: 2 passed.

- [ ] **Step 5: Run the full test suite to verify no regressions**

Run: `pytest tests/ -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add runner.py tests/test_runner_game.py
git commit -m "feat: integrate game scenarios into runner scoring and execution"
```

---

## Task 12: benchmark.py — scenario iteration and --scenarios filter

**Files:**
- Modify: `benchmark.py`

The main loop already iterates `models × runtimes × prompts`. Scenarios become a parallel iteration that runs *after* prompts, while the same llama.cpp server is still up.

- [ ] **Step 1: Read the existing main loop**

Re-read `benchmark.py:196-283` so the changes below land in the right place. The crucial structure: after `start_llamacpp_server`, the prompts loop runs inside `try:`, and `finally:` shuts the server down.

- [ ] **Step 2: Add CLI arg + scenario loading**

In the argparse block (around `benchmark.py:55-93`), add:

```python
    parser.add_argument(
        "--scenarios", type=str, default=None,
        help="Run game scenarios matching this name (or 'all' for every scenario). Default: no scenarios.",
    )
    parser.add_argument(
        "--scenario-md-dir", type=str,
        default=str(Path.home() / "workspace" / "smbench" / "scenarios"),
        help="Directory containing the scenario markdown files commander reads (default: ~/workspace/smbench/scenarios)",
    )
```

Add `from pathlib import Path` at the top of `benchmark.py` if not already present.

In the imports block, add:

```python
from common import load_scenarios, COMMANDER_LOCAL_PROVIDER
from runner import run_game_scenario
```

After the `prompts = ...` filtering logic (around line 148), add scenario loading:

```python
    # Load scenarios if requested
    scenarios: list = []
    if args.scenarios:
        all_scenarios = load_scenarios()
        if args.scenarios == "all":
            scenarios = all_scenarios
        else:
            scenarios = [s for s in all_scenarios if args.scenarios in s.name]
        if not scenarios:
            print(f"No scenarios matching: {args.scenarios}")
            print(f"Available: {', '.join(s.name for s in all_scenarios)}")
            sys.exit(1)
```

- [ ] **Step 3: Insert scenario execution inside the runtime loop**

Locate the inner `try:` block (around line 243) where prompts are iterated. After the prompts-tier loop ends but **before** the `except KeyboardInterrupt:` clause, add:

```python
                # ── Game scenarios (llama.cpp only — commander needs OpenAI-compat HTTP) ──
                if scenarios and runtime == "llamacpp":
                    print(f"\n  ── Game Scenarios ({len(scenarios)}) ──", flush=True)
                    for scenario in scenarios:
                        scenario_md_path = str(Path(args.scenario_md_dir) / f"{scenario.fixture}.md")

                        # Cache check using scenario_hash
                        cached = existing.get(scenario.name)
                        s_hash = compute_scenario_hash(scenario)
                        if cached and cached.scenario_hash == s_hash:
                            print(f"  [cached] scenario:{scenario.name}")
                            # Cached results don't have a live GameSession; we can't
                            # rescore via game_scorers without one. The cached score
                            # was computed at run time and persisted via score_details.
                            results.append(cached)
                            continue

                        commander_model_string = f"{COMMANDER_LOCAL_PROVIDER}/{model_cfg['name']}"
                        r = run_game_scenario(
                            model_cfg=model_cfg,
                            scenario=scenario,
                            commander_model_string=commander_model_string,
                            scenario_md_path=scenario_md_path,
                        )
                        # Synthesize the scorer dispatch dict expected by score_result
                        pcfg = {
                            "scorer": "game",
                            "game_scorer": scenario.scorer,
                            "scorer_params": scenario.scorer_params,
                            "category": "game",
                            "tier": 0,
                            "style": "game",
                        }
                        r.prompt_name = scenario.name
                        score_result(r, pcfg)
                        print_result_summary(r)
                        results.append(r)
                        append_result(r)
```

Add `compute_scenario_hash` to the existing `from common import ...` block at the top of `benchmark.py`.

> **Important:** Do **not** persist `r._game_session` — it is an in-memory-only attribute and `_EXECUTION_FIELDS` already filters it out at write time. Cached scenario rows therefore cannot be rescored, which is the same trade-off existing prompts have for fields not in `_EXECUTION_FIELDS`. The score is recorded in `score_details` at run time.

- [ ] **Step 4: Smoke-test that benchmark.py still parses and imports**

Run: `python benchmark.py --help`
Expected: usage text including `--scenarios` and `--scenario-md-dir`. No errors.

- [ ] **Step 5: Run unit tests to verify nothing is broken**

Run: `pytest tests/ -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add benchmark.py
git commit -m "feat: wire game scenarios into benchmark.py main loop"
```

---

## Task 13: First scenario YAML — bootstrap_grind

**Files:**
- Create: `prompts/scenarios/bootstrap_grind.yaml`
- Delete: `prompts/scenarios/_placeholder.yaml`

- [ ] **Step 1: Verify the scenario markdown commander reads exists**

Run: `ls ~/workspace/smbench/scenarios/s1-bootstrap-grind.md`
Expected: file exists. If not, fix `--scenario-md-dir` default in Task 12 or stop and ask.

- [ ] **Step 2: Write `prompts/scenarios/bootstrap_grind.yaml`**

```yaml
name: bootstrap_grind
fixture: s1-bootstrap-grind
players:
  - id: alice
    controlled_by: llm
scorer: bootstrap_grind
scorer_params: {}
cutoffs:
  wall_clock_sec: 900       # 15 min hard ceiling
  total_tokens: 200000      # ~200k token budget
  tool_calls: 300           # ~10x typical run
commander:
  max_turns: 250            # commander's own guard rail (looser)
```

- [ ] **Step 3: Delete the placeholder**

```bash
rm prompts/scenarios/_placeholder.yaml
```

- [ ] **Step 4: Verify scenario loads**

Run: `python -c "from common import load_scenarios; print([s.name for s in load_scenarios()])"`
Expected: `['bootstrap_grind']`

- [ ] **Step 5: Commit**

```bash
git add prompts/scenarios/bootstrap_grind.yaml prompts/scenarios/_placeholder.yaml
git commit -m "feat: add bootstrap_grind scenario YAML"
```

---

## Task 14: End-to-end smoke test (integration)

**Files:**
- Create: `tests/test_game_session_integration.py`

This is the only test that touches real binaries. It is gated behind `RUN_INTEGRATION=1` (set up in Task 0's `conftest.py`). It's the moment of truth for Task 6's commander-wiring guess.

- [ ] **Step 1: Write the integration test**

```python
"""End-to-end smoke test: real gameserver + real commander + real llama.cpp.

Gated behind RUN_INTEGRATION=1. Requires:
  - Gameserver binary at $TESTBENCH_GAMESERVER_BINARY (or default)
  - Commander checkout at $TESTBENCH_COMMANDER_DIR (or default)
  - Llama.cpp server running on :18080 with a small model loaded
    (run `python benchmark.py --quick --model-name 'qwen 2.5 7b'` in another shell first)
  - ~/workspace/smbench/scenarios/s1-bootstrap-grind.md present
"""
import os
from pathlib import Path

import pytest

from common import (
    Scenario, ScenarioCutoffs, GAMESERVER_BINARY, COMMANDER_DIR,
    COMMANDER_LOCAL_PROVIDER,
)
from game_session import run_game_session


@pytest.mark.integration
def test_bootstrap_grind_smoke():
    if not GAMESERVER_BINARY.exists():
        pytest.skip(f"gameserver binary not at {GAMESERVER_BINARY}")
    if not COMMANDER_DIR.exists():
        pytest.skip(f"commander dir not at {COMMANDER_DIR}")

    scenario_md = Path.home() / "workspace" / "smbench" / "scenarios" / "s1-bootstrap-grind.md"
    if not scenario_md.exists():
        pytest.skip(f"scenario md not at {scenario_md}")

    # Tight cutoffs so the smoke test finishes fast even if the model is slow
    scenario = Scenario(
        name="smoke_bootstrap",
        fixture="s1-bootstrap-grind",
        players=[{"id": "alice", "controlled_by": "llm"}],
        scorer="bootstrap_grind",
        scorer_params={},
        cutoffs=ScenarioCutoffs(wall_clock_sec=120, total_tokens=20000, tool_calls=20),
        commander_max_turns=50,
    )

    result = run_game_session(
        scenario=scenario,
        model_name="Qwen 2.5 7B Instruct",
        commander_model_string=f"{COMMANDER_LOCAL_PROVIDER}/qwen2.5-7b-instruct",
        scenario_path=str(scenario_md),
    )

    # We don't assert success — only that the pipeline runs end-to-end without
    # exception and produces a recognizable termination reason.
    assert result.termination_reason in ("completed", "wall_clock", "tokens", "tool_calls")
    assert result.error is None or "final-state read" in (result.error or "")
    print(f"\nSmoke test result: {result.termination_reason}")
    print(f"  tool_calls={result.tool_call_count} tokens={result.total_tokens}")
    print(f"  events captured: {len(result.events)}")
    print(f"  final_stats: {result.final_player_stats}")
```

- [ ] **Step 2: Run with integration flag (requires manual setup)**

Before running:
1. In a separate terminal, start a small llama.cpp model: `python benchmark.py --model-name 'qwen 2.5 7b' --quick` (this blocks; the server stays up while a prompt is in flight). For a cleaner setup, manually start `llama-server -hf Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M --port 18080` directly.
2. Verify the gameserver binary path: `ls $TESTBENCH_GAMESERVER_BINARY` (or the default in Task 6).
3. Verify commander path: `ls $TESTBENCH_COMMANDER_DIR/package.json`

Then run: `RUN_INTEGRATION=1 pytest tests/test_game_session_integration.py -v -s`
Expected: test passes (any termination_reason is acceptable). Failure modes and what they tell you:

- **`AdminError: 500` on reset** → gameserver doesn't accept the `{fixture: ...}` body. Fix in the gameserver per the Task 3 note.
- **`HealthCheckTimeout` waiting on /health** → gameserver binary path wrong or it crashed. Check stderr in `gs_proc`.
- **Commander exits immediately, 0 events captured** → commander couldn't connect to llama.cpp. Most likely Task 6's `COMMANDER_LOCAL_PROVIDER` / `COMMANDER_LOCAL_BASE_URL_ENV` are wrong. Print commander's stderr (it's captured on `cmd_proc.stderr`) — temporarily add `print(cmd_proc.stderr.read())` in the `finally` block of `game_session.run_game_session` to debug.
- **Commander runs but never emits JSONL** → it's not in `--benchmark` mode or its stdout format changed. Check `~/workspace/commander/src/loop.ts:115-118` for the event emission code.
- **`termination_reason == "tool_calls"` after 21+ tool_calls** → working as designed; the cutoff fired.

- [ ] **Step 3: Run unit suite one more time as a sanity check**

Run: `pytest tests/ -v`
Expected: all unit tests still pass; the integration test is auto-skipped without `RUN_INTEGRATION=1`.

- [ ] **Step 4: Commit**

```bash
git add tests/test_game_session_integration.py
git commit -m "test: add end-to-end game session integration smoke test"
```

---

## Self-review checklist (for the executing agent)

After completing all tasks, verify:

1. **Spec coverage** — every section of the spec maps to a task:
   - `game_runner.py` → split into Tasks 4 (lifecycle), 5 (port), 7 (commander), 8 (watchdog), 9 (orchestrator). The single-file design in the spec is implemented as five focused files; this is a deliberate refinement for testability.
   - `prompts/scenarios/*.yaml` → Tasks 1 (loader) and 13 (first scenario)
   - `common.py` extension → Tasks 1, 2, 6
   - `game_scorers.py` → Task 10
   - `runner.py` extension → Task 11
   - `benchmark.py` extension → Task 12
   - `BenchmarkResult` extension → Task 2
   - `[paths]` config section → Task 6 (env-var-based instead of a config file; simpler, same effect)

2. **`pytest tests/`** — all unit tests pass.

3. **`python benchmark.py --help`** — shows `--scenarios` and `--scenario-md-dir`.

4. **`RUN_INTEGRATION=1 pytest tests/test_game_session_integration.py -v -s`** — runs end-to-end against real binaries (this is the load-bearing verification; it confirms Task 6's wiring is correct).

5. **No `<FILL IN>` strings remaining** in `common.py` after Task 6.
