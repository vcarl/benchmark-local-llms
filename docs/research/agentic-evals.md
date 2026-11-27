# Agentic and tool-use evaluation: adoption options

Research date: 2026-11-18. Sources are primary (GitHub READMEs, papers, official docs) unless marked. "(unverified)" marks claims not confirmed against a primary source in this pass; check before building on them.

## 1. Executive recommendation

Adopt in this order:

1. **BFCL (V3 multi-turn + V1/V2 single-turn AST categories), via Inspect's `inspect_evals/bfcl` port (path a, shell out).** Fully programmatic: AST matching for single-turn, final-state comparison for multi-turn, text-answer matching for V4. No LLM judge, no user simulator. Apache-2.0 data. Short episodes, so it is the only agentic-adjacent benchmark that fits "sequential runs, one model in memory" at the cost of a normal prompt corpus. It measures exactly the thing our harness cannot currently see: whether a (model, runtime, quant, chat template) config emits parseable, correct tool calls. Skip V4 web-search (needs a SerpAPI key, non-reproducible live web) and treat memory categories as optional.
2. **Terminal-Bench 2.0 via Harbor (path a), pointed at our managed server, subset first.** Verifier is a container test script (programmatic), no judge. It is the best "does the model act as an agent" signal with deterministic scoring, but episodes are long and the scaffold (agent system prompt) is part of the benchmark; see section 5. Start with a 10-20 task subset and `k=3`.
3. **Defer tau2-bench.** It is the right shape for pass^k, but the user simulator is an LLM (reward is database-state-based, yet the trajectory depends on a simulator we would have to host locally or call remotely). Both options violate our reproducibility stance unless the simulator is pinned and archived. Revisit only if the user accepts a pinned local simulator as a documented config axis.

Integration path: **hybrid (c)**. Run external harnesses against the managed `llama-server`, but ingest their per-sample logs into our content-hashed attempt archive as a new score kind, and keep our config/stats model as source of truth. Do not port task data into YAML for BFCL (too large, upstream scorers are the value) and do not write a TS agent loop except for the thin one needed for our own scenarios. Rationale and details in section 4.

Do not adopt: SWE-bench (Docker-on-arm64 experimental, heavy), OSWorld/WebArena (infeasible), StableToolBench (LLM judge), GAIA (see notes).

## 2. Comparison table

| Benchmark | Measures | Scoring | LLM sim/judge? | License | Local endpoint | Tool-call format | Mac feasibility |
|---|---|---|---|---|---|---|---|
| BFCL V1-V3 | single/parallel/multi-function calls; multi-turn stateful tools | AST match; multi-turn final-state + execution match | No | Apache-2.0 (leaderboard data); code repo Apache-2.0 (unverified for code) | Yes (`--skip-server-setup`, `REMOTE_OPENAI_BASE_URL`; vLLM/sglang backends documented, llama.cpp not mentioned) | Both: `-FC` native tools vs prompt mode | Good; inference is cheap |
| BFCL V4 | web search (100 multihop Qs), memory (KV/vector/summ.), format sensitivity | Text-answer check; state checks | No | as above | as above | prompt-format variants | Web search needs SerpAPI: skip |
| tau-bench / tau2-bench | policy-following tool agents in retail/airline/telecom (+ banking_knowledge, intake in 2.0) | DB-state reward; pass^k | **Yes: LLM user simulator**; communication checks use an LLM judge | MIT | LiteLLM-based; custom base URL not documented in README (unverified, likely via LiteLLM `openai/` prefix) | Native tools | Python 3.12-3.13 via `uv`; episodes long (many turns, two LLMs) |
| ToolBench / StableToolBench | RapidAPI tool use | Pass/win rate via GPT-4 judge over cached APIs (secondary source) | **Yes** | Apache-2.0 (unverified) | Possible | Prompt (ReAct-style) | Reject: judge |
| NexusRaven | single-turn function calling (Nexus function-calling benchmarks) | AST-like match (unverified) | No (unverified) | Apache-2.0 (unverified) | Dataset-only | Python-call format | Saturated/dated; BFCL supersedes |
| ACEBench | Normal / Special (ambiguous, incomplete instructions) / Agent (multi-turn) | Normal+Special: rule-based match; Agent: simulated multi-agent dialogue (unverified in detail) | Agent split uses a user-role LLM (unverified) | Unverified | Scripts `generate.py`, `eval_main.py`; endpoint support unverified | Mixed | Only Normal+Special are plausible. Repo location ambiguous (ob1-s/ACEBench vs chenchen0103/ACEBench) |
| MCP-Universe | 6 domains, 11 real MCP servers | Execution-based: format, static, dynamic evaluators; no judge by design | No | Unverified | Unverified | Native tools over MCP | Needs live services/API keys (maps, GitHub, etc.): poor reproducibility |
| MCP-Bench (Accenture) | 28 live MCP servers, 250 tools | Hybrid: schema checks + LLM judge (secondary source) | **Yes** | Unverified | Unverified | Native tools | Reject: judge, live servers |
| Terminal-Bench 2.0 (Harbor) | terminal tasks in containers | Container test verifier | No | Apache-2.0 (Harbor) | Yes via LiteLLM-style model strings (details unverified) | Agent-scaffold dependent | Docker local; arm64 not addressed in README; long episodes |
| inspect_evals agentic | BFCL, Tau2, AppWorld, GAIA, AgentBench, Cybench, SWE-bench etc. | varies per eval | varies; AppWorld state-based, no judge | MIT (Inspect) | Yes (section 3) | Inspect-built native tool schemas | Docker sandbox per sample |
| SWE-bench Lite/Verified | GitHub issue patches | Test-based | No | MIT | n/a (agent produces patches; `swebench infer` uses mini-SWE-agent) | scaffold | **arm64 "experimental"**, recommends x86_64, 120 GB disk |
| AgentBench | 8 environments | varies | some | Apache-2.0 (unverified) | Yes | varies | Heavy, dated |
| OSWorld / WebArena | GUI/web agents | state check | partly | varies | n/a | multimodal | Infeasible (VMs, multimodal, hours/task) |
| GAIA | tool-using assistant QA | Exact-match against answer (quasi-exact), no judge in original (unverified) | No (unverified) | Gated dataset on HF | Needs web/file tools | native | Needs web search/browser tools; gated data; contamination concerns |

## 3. Per-benchmark notes

**BFCL.** README (https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard) lists V1 (simple/parallel/multiple, AST), V2 (live, community-contributed enterprise data), V3 (multi-turn, multi-step), V4 (web search, memory, format sensitivity). Local runs use vLLM or sglang backends, or `--skip-server-setup` with `LOCAL_SERVER_ENDPOINT`/`LOCAL_SERVER_PORT` or `REMOTE_OPENAI_BASE_URL`; results land as `result/MODEL/BFCL_v3_<CATEGORY>_result.json` and `score/...`. Model names ending `-FC` use native function calling; others use a prompt-based mode. That dichotomy is directly useful to us: the same model can be evaluated in FC and prompt mode, isolating the chat-template/runtime tool-parsing effect from raw capability. The Inspect port (https://github.com/UKGovernmentBEIS/inspect_evals, `bfcl`) scores V1/V2 by AST matching, V3 by backend-state comparison, V4 by final-text match; the `exec_*` categories are not execution-scored there (open issue), `rest` unimplemented, default run is 4,981 samples. Format sensitivity (Python/XML/JSON function docs, varied call markers, https://gorilla.cs.berkeley.edu/blogs/17_bfcl_v4_prompt_variation.html) is directly relevant to our template-varied configs. Caveat: multi-turn BFCL needs the upstream stateful Python backends; those ship inside both the upstream repo and the Inspect port.

**tau-bench / tau2-bench.** https://github.com/sierra-research/tau2-bench (MIT). Domains airline, retail, telecom, banking_knowledge, intake; text and voice modes; text-v1 is 50 tasks per domain per language. An LLM plays the customer; config uses LiteLLM with `--agent-llm`, `--user-llm`, `--agent-llm-args`. Custom `api_base` is not documented in the README (unverified; LiteLLM normally supports it). pass^k, introduced in the tau-bench paper (https://arxiv.org/abs/2406.12045), asks success on all k trials; a commentary noted simulator stochasticity conflates agent and simulator variance. For v1 comparability the README points to v1.0.1. Requires Python >=3.12,<3.14 and `uv`. If adopted, the user simulator must be a pinned model recorded in the config hash.

**ToolBench / StableToolBench.** Scoring is a GPT-4 judge (pass rate, win rate vs reference) over cached API responses (from a 2026 secondary table; not verified against the StableToolBench repo). Violates the no-judge rule. Exclude.

**NexusRaven.** Function-calling datasets in Python-call syntax. Largely subsumed by BFCL; not researched against primary sources this pass (unverified). Low priority.

**ACEBench.** https://arxiv.org/abs/2501.12851 (v8); repos https://github.com/ob1-s/ACEBench and an alternate linked from the paper. 4,538 APIs, 8 domains, 68 subdomains, English and Chinese. Normal and Special categories are the plausible programmatic subset; the Agent split simulates multi-agent dialogue (almost certainly an LLM user, unverified). Worth a later look as a second single-turn tool-calling signal with "ambiguous/incomplete instruction" abstention cases that BFCL covers less.

**MCP evals.** MCP-Universe (https://arxiv.org/abs/2508.14704) is execution-based (format, static, dynamic evaluators) with explicit rejection of LLM-as-judge, but "dynamic" ground truth is fetched live and the tasks hit real servers (GPT-5 scores 43.7%), so replicability and local-model scores both look poor. MCP-Bench (https://arxiv.org/abs/2508.20453) uses a judge component (secondary source). Neither fits the replicable-dataset goal now.

**Inspect + inspect_evals.** https://inspect.aisi.org.uk. Inspect provides `react()` agents, sandbox providers (docker, k8s, modal, custom), and an eval-log format. inspect_evals (https://ukgovernmentbeis.github.io/inspect_evals/) lists BFCL, Tau2, AppWorld (state-based unit tests, no judge), AgentDojo, GAIA, AgentBench, Cybench, SWE-bench Verified, OSWorld, Mind2Web and more. Some wrappers need LLM judges (e.g. MCPTox, PinchBench, WildClawBench); per-eval pages must be checked. Third-party `inspect-harbor` (https://pypi.org/project/inspect-harbor/) runs Harbor tasks inside Inspect (unverified in depth).

**Terminal-Bench 2.0 / Harbor.** https://github.com/harbor-framework/harbor (Apache-2.0), `harbor run --dataset terminal-bench@2.0`, local Docker default, cloud via Daytona/Modal. Custom agents via `--agent-import-path module:Class` (https://tbench.ai/docs). Verifier is test-script based. README does not cover custom `api_base` or arm64; verify before commitment. Official agents are real CLI agents (Claude Code, Codex CLI, OpenHands) plus Terminus; each brings its own system prompt.

**SWE-bench.** https://github.com/SWE-bench/SWE-bench (MIT). Verified is 500 tasks; Lite on HF. Docker required, README recommends x86_64 with 120 GB free, 16 GB RAM, 8 cores, and calls arm64 support "experimental" with local Buildx image builds. Scoring is test-based, no judge, but the agent scaffold (mini-SWE-agent via `swebench infer`) dominates results and each episode is tens of turns with large contexts. Poor value on a single Mac.

**OSWorld / WebArena.** Need full VMs or browser farms, multimodal input, and hours per task. Infeasible for this harness.

**GAIA.** Original scoring is quasi-exact-match on a final answer (unverified here), so no judge is required in principle; but the dataset is gated, tasks need web browsing/file tools, and answers leak into training data. Low priority.

## 4. Integration architectures

Constraints: our config axes (model, runtime, quant, sampling, system prompt, template), content-hashed attempt archives, offline re-scoring, errata, cluster-robust SEs, one model in memory, sequential runs.

**(a) Shell out to an external harness.**
- Pros: zero harness work; upstream scoring stays authoritative; BFCL/Inspect/Harbor already target OpenAI-compatible endpoints.
- Cons: the external scaffold owns the prompt (violates "system prompt is config" unless overridable); logs must be translated; model lifecycle needs coordination (we start `llama-server`, hand the URL over, tear down afterward); two timeouts/retry policies; upstream version drift must be pinned in the archive (harness git SHA, dataset hash).
- Ingest contract: for each sample, archive the full request/response transcript, tool schemas sent, upstream score, upstream scorer version, plus our configHash. Offline re-scoring then means re-running the upstream scorer over the archived transcripts (BFCL's `eval` step and Inspect's `inspect score` both separate inference from scoring, which maps to our `./bench score`).

**(b) Port task data into YAML + TS agent loop.**
- Pros: full control of system prompt, archive, and scoring; one code path with SpaceMolt scenarios.
- Cons: re-implements tool backends (BFCL multi-turn state machines, tau domains), re-implements scoring, loses comparability with published numbers; large ongoing maintenance. Only sensible for single-turn BFCL AST categories (data is JSON, scorer is a pure function) and only if parity with upstream is verified on a few models.

**(c) Hybrid (recommended).**
- Inference by upstream harness against our managed server; our own types for the result: a new `AgenticScore` member beside `PromptScore | ScenarioScore`, carrying a pass boolean/reward plus `trials` for pass^k. Pass-rate and cluster-robust SEs apply (cluster by task; trials within task are the repeated measures).
- System prompt: for BFCL via Inspect, the system prompt can be set by task/solver args (verify the override point per eval; unverified). For Terminal-Bench/Harbor, a custom `BaseAgent` in our repo reads the config's system prompt and drives a minimal tool loop (bash tool only), avoiding vendor CLI scaffolds. This is the single most important integration decision: if a benchmark's agent scaffold is not replaceable, the result measures (model x scaffold), and must be labelled as such rather than as a config-varied system prompt.
- Existing `AgentEvent` trace (tool_call/tool_result/turn_end) is a good normal form for the transcript: map Inspect/Harbor events into it so the webapp detail panel works unchanged.

Recommended order: (1) Inspect BFCL, (2) Harbor custom agent running a subset of Terminal-Bench, (3) evaluate whether a TS single-turn BFCL port is worth it for fast re-scoring.

## 5. Which benchmarks hardcode scaffolds or system prompts

- BFCL: prompts are built by the harness (prompt-mode system prompt plus function docs). FC mode sends tools via the API. A config-supplied system prompt must be appended or substituted; changing it changes the benchmark's prompt-mode definition (unverified how overridable). Treat the harness prompt as fixed and the config system prompt as an optional extra message, or run FC mode only.
- tau2: agent has a domain policy as its system prompt (part of the task); the config system prompt can only be additive.
- Terminal-Bench/Harbor: agent-defined. Custom agent required to honor config.
- SWE-bench: scaffold-defined (mini-SWE-agent). Same issue.
- Inspect `react()`: system prompt is a parameter, so most flexible.

## 6. Tool-calling runtime support

**llama.cpp `llama-server`.** Requires `--jinja`; tools render through the model's chat template; output is parsed back to OpenAI `tool_calls` (https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md). Native handlers: Llama 3.x, Functionary v3.x, Hermes 2/3, Qwen 2.5 (+Coder), Mistral Nemo, Firefunction v2, Command R7B, DeepSeek R1 (WIP), GPT-OSS (Harmony). Unrecognized templates fall to a "Generic" handler (more tokens, less reliable; the startup log says `Chat format: Generic`). Parallel tool calls off by default (`"parallel_tool_calls": true` to enable). Aggressive KV quant (`-ctk q4_0`) can badly degrade tool calling. `--chat-template-file` overrides templates, which matches our vendored-template model; the repo doc does not cover `tool_choice` (unverified). Implication: record the detected chat format in each archive; "Generic" runs are a different condition. Newer model families (Qwen3.x, GLM, etc.) are listed in the doc only partially; newer handlers likely exist in `common/chat.cpp` (unverified).

**mlx_lm.server.** The in-repo SERVER.md does not document `tools`/`tool_calls` (checked this pass), and `max_tokens` defaults to 512, which truncates tool calls. However, the repo now contains a `mlx_lm/tool_parsers/` package with parsers for Gemma, GLM 4.7, Kimi K2/K3, Laguna, Longcat, MiniCPM5, MiniMax M2, Mistral, Qwen3-Coder, pythonic and generic JSON (https://github.com/ml-explore/mlx-lm/tree/main/mlx_lm/tool_parsers), so structured tool calls are implemented per model family even though the doc lags. Parser selection and streaming behavior were not verified; earlier issues report raw `<tool_call>` text leaking and stop-token problems with gpt-oss (https://github.com/ml-explore/mlx-lm/issues/613, mixed evidence). Test with a one-call smoke request per model before running any benchmark. Inspect docs also warn about the 512 default.

**oMLX.** https://github.com/jundot/omlx. OpenAI and Anthropic-compatible; supports the tool-call formats available in mlx-lm, auto-detecting by model family (JSON `<tool_call>`, Qwen3.5 XML, Gemma, GLM, MiniMax, Mistral `[TOOL_CALLS]`, Kimi, Longcat). The chat template must accept `tools`. Streaming hides tool markup and emits structured calls after the full turn is parsed. Grammar-constrained output is available (ignores `thinking_budget`).

**Cross-cutting.** Tool-call success is a joint function of model, template, parser, and quantization; any failure to parse becomes a benchmark failure. That is legitimate signal (failure is failure) but must be recorded as a distinct failure class (parse failure vs wrong call) so it can be attributed to runtime versus model. Template changes are our own config axis and align with BFCL's FC vs prompt split. Thinking-model output (`reasoning_content` handling) must be verified per runtime so reasoning does not leak into `content` and corrupt AST parsing.

## 7. Statistical concerns

- **Variance.** Multi-turn episodes compound errors; single-sample pass rates are noisy. Unit of analysis is task, with k trials per task as repeated measures; our cluster-robust SEs by task apply directly. Never treat trials as independent samples.
- **pass^k.** tau-bench: probability all k trials of a task succeed; falls fast (about 25% at k=8 on tau-retail for one model, per the paper). Compute pass^k from per-task success counts with the unbiased estimator C(c,k)/C(n,k); report alongside pass@1. Requires n>=k trials per task, so budget accordingly. Because we sample at configured temperature, pass^k is a property of the config's sampling settings; temperature-0 runs make k trials degenerate.
- **Simulator variance.** With an LLM user simulator the trial-to-trial variance partially belongs to the simulator; pin its model, seed where possible, and record it.
- **Cost.** Single Mac, sequential: a BFCL V1-V3 pass is thousands of short calls (cheap, minutes to an hour for mid-size models). Terminal-Bench tasks run tens of turns with growing context, so prompt-processing dominates on Apple silicon; expect many minutes per task and hours per k=3 pass on a 100B-class model (estimate, not measured). Use subsets, resample only edge items (matching our publishable-dataset policy), and hard caps on turns and wall time recorded as failures.
- **Contamination/drift.** Pin dataset versions (BFCL version, tau2 text-v1 vs newer, terminal-bench@2.0) in the archive; upstream scorer fixes are errata events.

## 8. Open questions for the user

1. Is a pinned local LLM user simulator (tau2) acceptable as a recorded config axis, or is "no LLM in the scoring loop" strict including simulators?
2. For scaffold-bound benchmarks (Terminal-Bench, SWE-bench), do you accept a custom minimal bash-tool agent in our repo (comparable only within our own results) rather than the official agents (comparable to leaderboards)?
3. Should BFCL's prompt-mode and FC-mode both be run per config (doubles cost, isolates the template/parser effect), or FC only?
4. Python as a dependency: OK to require `uv` plus Docker as an optional lane for these benchmarks, kept outside the TS toolchain and CI?
5. Is a new score kind (`AgenticScore` with trials) acceptable, or should these be forced into the `[0,1]` PromptScore shape?
6. Trial budget: how many k and which task subset for Terminal-Bench, given hours-per-pass costs?

## Sources

- BFCL: https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard ; https://gorilla.cs.berkeley.edu/blogs/15_bfcl_v4_web_search.html ; https://gorilla.cs.berkeley.edu/blogs/16_bfcl_v4_memory.html ; https://gorilla.cs.berkeley.edu/blogs/17_bfcl_v4_prompt_variation.html
- inspect_evals: https://ukgovernmentbeis.github.io/inspect_evals/ ; https://github.com/UKGovernmentBEIS/inspect_evals ; Inspect providers https://inspect.aisi.org.uk/providers.html
- tau2: https://github.com/sierra-research/tau2-bench ; https://arxiv.org/abs/2406.12045
- ACEBench: https://arxiv.org/abs/2501.12851 ; https://github.com/ob1-s/ACEBench
- MCP-Universe: https://arxiv.org/abs/2508.14704 ; MCP-Bench: https://arxiv.org/abs/2508.20453
- Harbor / Terminal-Bench: https://github.com/harbor-framework/harbor ; https://tbench.ai/docs
- SWE-bench: https://github.com/SWE-bench/SWE-bench
- llama.cpp: https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md
- mlx-lm: https://github.com/ml-explore/mlx-lm/tree/main/mlx_lm/tool_parsers ; https://github.com/ml-explore/mlx-lm/issues/613
- oMLX: https://github.com/jundot/omlx
