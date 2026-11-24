# Tracing and statistics: research report

Date: 2026-11-18. Scope: what timing and resource signals the harness can capture from its three runtimes, whether to adopt an OpenTelemetry-based tracing backend, and how to make the pass-rate statistics and efficiency inputs hold up for a publishable dataset with submissions from other machines. No LLM-as-judge is assumed anywhere.

Sources marked **[unverified]** come from secondary material or could not be checked against runtime source or a spec.

---

## Executive recommendation

Ordered by value per unit of effort. S = under a day, M = a few days, L = a week or more.

1. **Use t_{C−1} critical values instead of z = 1.96 in the clustered intervals and tier tests (S).** `Z95` is fixed at 1.96 (`webapp/src/lib/stats.ts:20`, `:61`), and the minimum is 5 clusters (`:19`). With C = 5 the correct 97.5% quantile is t₄ = 2.776, so the intervals are about 30% too narrow in small scopes such as a single challenge. This is the cheapest correctness fix available.
2. **Fix the generation-speed aggregate (S).** `src/report/rows.ts:315` averages `generationTps` over every sample line, including lines that record 0: error results (`src/orchestration/run-prompt.ts:233-234`) and aborted streams (`src/llm/chat-completion.ts:343`). It also counts a resampled item K times, unlike the `itemMean` used for every other cost (`rows.ts:296-300`). Rows then average the per-cell means without weights (`webapp/src/lib/model.ts:130`, `scripts/efficiency-lab/extract.cjs:19`). Compute Σ generated tokens / Σ decode seconds over lines with a measured decode.
3. **Capture llama.cpp's full `timings` block and TTFT from the SSE stream; store prefill and decode separately (S–M).** The decoder reads only `prompt_per_second` and `predicted_per_second` (`chat-completion.ts:269-271`) and discards `prompt_n`, `prompt_ms`, `predicted_ms` and `cache_n`. On MLX the speed is derived from total wall time (`run-prompt.ts:99-106`, `:197`), so MLX "tok/s" includes prefill and HTTP overhead while llama.cpp's is decode-only. The two are not comparable in `g_tps` today.
4. **Make resampling a planned, two-term variance budget (M).** Decompose each config's pass-rate variance into a between-item term and a within-item (sampling) term. Resample only where the within-item term is large, and give every config the same per-item K so paired comparisons stay balanced. The `edge` flag (`src/audit/stats.ts:192-199`) selects by discrimination, which measures item quality. It is the wrong target for where extra samples reduce variance.
5. **Control multiplicity in the tier walk (S).** The tier boundaries come from a sequence of unadjusted 95% tests (`webapp/src/lib/model.ts:212-226`). Use Holm across the comparisons made in one list rendering, and keep the unadjusted interval in the drilldown.
6. **Keep the archive as the system of record and add no tracing backend for now (S, as a decision).** Store the new timing fields in `ItemResult` and render them in the existing drilldown. If an interactive span view is wanted later, write an offline exporter from archive to OTLP that emits OpenInference and GenAI attributes. Phoenix or Langfuse can then display it, and neither becomes a runtime dependency.
7. **Add small-cluster-robust inference in an offline analysis script (M).** Use R with `clubSandwich` (CR2 with Satterthwaite degrees of freedom) or Python `wildboottest` (wild cluster bootstrap). Run it for published tables and as a check on the TypeScript CR1 numbers. The webapp keeps CR1 with t critical values.
8. **Fit a 2PL IRT model offline (M).** This gives item difficulty and discrimination, model ability with standard errors, and an evidence-based way to pick items to resample or retire. Use R `mirt` or Python `py-irt`. A binomial-count likelihood handles the K samples per item.
9. **Record environment covariates for timing, and normalise speed by machine for submissions from other hardware (M).** Record thermal state, power and a fixed calibration probe for each attempt. Report wall time and tok/s within a `hardwareId`, or relative to a reference model on the same machine. Do not compare raw values across machines.
10. **Test determinism at temperature 0 and with seeds before claiming replicability (S to run, M to document).** Seeds are already recorded per line (`src/schema/attempt.ts:35-36`; drawn at `src/orchestration/run-challenge.ts:218`). Whether a replay with the same seed reproduces the output depends on prompt caching and batching. Measure it.

---

## Part 1: Tracing and observability

### 1.1 What the harness records today

Each item line stores `promptTokens`, `generationTokens`, `promptTps`, `generationTps`, `peakMemoryGb`, `wallTimeSec`, `seed`, `stopReason`, the outputs and `failureKind` (`src/schema/attempt.ts:23-60`). Requests are streamed (`chat-completion.ts:186-190`). Wall time is the span from `Clock.currentTimeMillis` before the request to after the stream completes (`run-prompt.ts:304-313`). It covers HTTP time, prefill, decode and the harness's own SSE parsing.

Peak memory is the server process's running maximum RSS, polled with `ps` every 30 s (`src/llm/servers/peak-rss.ts`). It has three properties worth knowing:

- It is a server-lifetime maximum and never goes down, so the value on any one line depends on the order items ran in.
- It excludes Metal or MLX wired GPU buffers, which `run-prompt.ts:161-166` already notes. MLX rows therefore under-report memory relative to llama.cpp, whose mmap-backed weights are counted in RSS.
- It belongs to the process and the attempt, not to the item, so storing it per item suggests more precision than it has.

The logger (`src/cli/logger.ts`) writes human-readable lines to stderr. There are no spans and no structured timing beyond the archive.

### 1.2 Signals each runtime can supply

**llama.cpp `llama-server`** (installed build 12359, `b1b770d90`). Checked against `tools/server/README.md` and server source:

- **Per-request `timings`, sent on the final SSE chunk:** `prompt_n`, `prompt_ms`, `prompt_per_token_ms`, `prompt_per_second`, `predicted_n`, `predicted_ms`, `predicted_per_token_ms`, `predicted_per_second`, and `cache_n` (cached prompt tokens, added in [PR #15827](https://github.com/ggml-org/llama.cpp/pull/15827)). Speculative decoding adds draft fields. With these the harness can store prefill time, decode time and KV-cache reuse exactly. The field names were checked in PR snippets and the server source, not in a reference table **[partly unverified for the current build; check one live response]**.
- **`timings_per_token: true`** attaches timings to every chunk. **`return_progress: true`** streams `prompt_progress {total, cache, processed, time_ms}` during prefill ([README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)).
- **`/metrics`** is a Prometheus endpoint and is off unless the server starts with `--metrics`. It reports `llamacpp:prompt_tokens_total`, `prompt_seconds_total`, `tokens_predicted_total`, `n_decode_total`, `n_busy_slots_per_decode`, `requests_processing` and others (`server-task.cpp`). These are server-wide counters, so they add nothing for sequential runs beyond what `timings` already gives.
- **`/slots`** is on by default (`--no-slots` disables it). It shows each slot's state and sampling parameters, which is useful for checking that requested samplers were applied.
- **`cache_prompt`** defaults to true. The README states that because "logits are not guaranteed to be identical across batch sizes", enabling it "can cause nondeterministic results". See §2.7.

**mlx_lm.server** (checked against `mlx_lm/server.py` on main):

- Streaming `usage` includes `prompt_tokens_details.cached_tokens` (`server.py` around lines 1505-1512 and 1721-1729). The harness's `UsageSchema` does not read it.
- There is no timings object, no prefill or decode split, and no metrics endpoint. Prefill and decode can only be separated client-side through TTFT: prefill ≈ time to the first content or reasoning delta, and decode ≈ last delta minus first.
- A request carrying `seed` cannot be batched: `_is_batchable` requires `args.seed is None` (`server.py:766-771`), and the server calls `mx.random.seed(seed)` for each request. Every harness request sends a seed, so MLX always takes the sequential path. That favours determinism and suits a benchmark.

**oMLX** (installed 0.6.3rc3):

- Supports `stream_options.include_usage`. It runs continuous batching with a paged SSD KV cache ([repo](https://github.com/jundot/omlx)).
- No per-request timings are documented. The admin UI has a prefill/generation benchmark but no request metrics API **[unverified beyond the README]**.
- Prefix caching on SSD can carry over between items, so prefill time depends on the order items ran in. Seed handling is not documented **[unverified]**.

**Signals that work on every runtime, from the client side:**

- **TTFT:** time from sending the request to the first SSE chunk with non-empty `content` or `reasoning`. Also record the time to the first answer token, because for reasoning models the gap between the two is a large share of the cost.
- **Decode rate:** (generation tokens − 1) / (t_last − t_first).
- **Inter-token jitter:** the p50 and p95 of gaps between chunks. Chunks are not tokens on every runtime, so label this "chunk" timing.

All of this fits inside `readSse` (`chat-completion.ts:242-300`) as a few `Clock` reads.

**Apple-silicon power and thermals:**

- `powermetrics` requires root.
- [`macmon`](https://github.com/vladkens/macmon) runs without sudo. It reads CPU, GPU and ANE power, temperatures, and memory pressure, and `macmon pipe -s N` emits JSON.
- `pmset -g therm` reports thermal or performance throttling without root.

The useful record is a few attempt-level aggregates: mean package power and energy per generated token, the maximum GPU temperature, and whether throttling occurred. A per-item time series is not needed. Energy per token is also a candidate efficiency input that carries over between machines better than raw tok/s does.

### 1.3 Proposed schema additions (all optional, in `ItemResult`)

- `ttftMs`
- `firstAnswerMs`
- `prefillMs`: `timings.prompt_ms` on llama.cpp; null elsewhere unless TTFT is used as a proxy
- `decodeMs`: `timings.predicted_ms`, else last-delta minus first-delta
- `cachedPromptTokens`: `timings.cache_n` or `usage.prompt_tokens_details.cached_tokens`
- `timingSource`: `"server" | "client"`

The attempt manifest gains `thermal` and `power` summaries and a `calibration` probe result (§2.8).

`promptTps` and `generationTps` become derived values. The archive should never again store 0 to mean "unknown". The current convention, documented at `run-prompt.ts:92-97`, is what breaks the average described in recommendation 2.

### 1.4 Tracing standards and backends

**OpenTelemetry GenAI semantic conventions.**

- The conventions moved out of the core semantic-conventions repository in v1.42.0 (June 2026) to [open-telemetry/semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai). The old [opentelemetry.io GenAI page](https://opentelemetry.io/docs/specs/semconv/gen-ai/) now shows only a "moved" notice.
- Secondary sources from July to September 2026 report that every `gen_ai.*` attribute, span and metric is still at **Development** stability ([dash0](https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained), [dev.to](https://dev.to/azena-ai/opentelemetrys-genai-semantic-conventions-are-not-stable-yet-heres-what-actually-shipped-in-2026-3mke)). The new repository's schema URL is still "TODO" **[stability label not confirmed on the spec page]**.
- The relevant names are `gen_ai.client.operation.duration`, `gen_ai.client.token.usage`, the streaming `gen_ai.client.operation.time_to_first_chunk`, and server-side `gen_ai.server.time_to_first_token` and `gen_ai.server.time_per_output_token`.
- Development stability means attribute names may still change. Emitting them is fine. Persisting them as the archive format is not.

**OpenInference** (Arize; `@arizeai/openinference-semantic-conventions` 2.17.0). It is a stable attribute set (`llm.token_count.*`, `llm.invocation_parameters`, `input.value`, `output.value`) that Phoenix renders natively.

**Backends:**

- **Phoenix** runs as a single local container or a pip install with SQLite, and ingests OTLP. The JS packages are `@arizeai/phoenix-otel` 3.1.0 and `@arizeai/phoenix-client` 8.0.1.
- **Langfuse v3** self-hosting needs Postgres, ClickHouse, Redis and S3. That is heavy for one workstation **[recalled from Langfuse docs; recheck]**. Its JS exporter is `@langfuse/otel` 6.1.1.
- Inside the harness, Effect's `Effect.withSpan` plus `@effect/opentelemetry` would wire OTLP export. The current npm `latest` (4.1.4) targets Effect 4. This repo is on `effect` ^3.21, so it needs the 0.x line.

**Recommendation: do not add live tracing.** Four reasons:

1. **The cost already lives in the archive.** What these backends add is a trace waterfall and an annotation UI. For one sequential request per item, the waterfall is a single bar. The webapp drilldown already shows each line's output, reasoning and cost.
2. **Live export adds a second record that can drift from the archive.** The goal is a replicable dataset with the archive as the source of truth. A second store of the same facts, keyed by span IDs, would need provenance checks of its own.
3. **The useful features are judge features.** Evaluation annotations and LLM-as-judge are out of scope. What remains is a prettier log viewer.
4. **Better options exist without a backend.** Spending the effort on §1.3 fields and drilldown charts gives more:
   - TTFT, prefill and decode stacked per item
   - prefill time against `cachedPromptTokens`
   - tok/s against context length

If a span view is wanted later, write `scripts/export-otlp.ts`. It would read attempt archives and emit one trace per attempt, with one child span per item line, carrying both OpenInference and `gen_ai.*` attributes plus the `configHash`, `promptHash` and `itemHash` IDs. The export is reproducible from the archive, the attribute choice can follow the GenAI conventions as they stabilise, and Phoenix stays optional. Effort: M.

---

## Part 2: More reliable and robust statistics

### 2.1 Review of the current code

**`webapp/src/lib/stats.ts`.**

- **CR1 standard error of a ratio (`:23-30`): correct.** `SE = sqrt(C/(C−1) · Σ(y_c − r·n_c)²)/N` is the cluster-robust sandwich for an intercept-only regression with weights n_c. Without the C/(C−1) factor it is Miller's clustered SE ([Miller 2024, arXiv:2411.00640](https://arxiv.org/abs/2411.00640) §2.3); the factor makes it slightly more conservative. Treating resampled items as pass fractions inside `y_c` is also correct. The cluster residual then contains both between-item and sampling noise, which is what the SE of the observed score should contain.
- **Bug: the interval uses z where t is needed (`:20`, `:61`; consumers `ModelList.tsx:40`, `DrilldownPanel.tsx:100`, `Scatter.tsx:421-422`).** CR1 with C clusters has about C−1 degrees of freedom, and coverage at C = 5-15 with z = 1.96 falls well short of 95% ([Cameron, Gelbach & Miller 2008](https://doi.org/10.1162/rest.90.3.414); [Pustejovsky & Tipton 2018](https://doi.org/10.1080/07350015.2016.1247004)). The full set has about 20 named families plus singletons, which gives large C. Single-challenge scopes such as `trust` or `financial` can come close to `MIN_CLUSTERS`.
  - Fix: export `tCrit(df)` from a 30-entry table (df 1-30, then 1.96), and return `lo` and `hi` from the stats module rather than multiplying `Z95` at each call site.
- **Data-quality issue: families are paired on equal item count only (`:56`).** The check is `cb.n === ca.n`. Two configs that ran different versions of a challenge with the same item count are paired on different items. Pairing on a family key that includes the item-hash set would be exact. This is a low-probability edge case.
- **Duplicated logic.** `ratioSE` and `MIN_CLUSTERS` exist twice, in `src/report/rows.ts:145,173-181` and in `webapp/src/lib/stats.ts:19-30`. Any fix to one must reach the other.

**`webapp/src/lib/model.ts` tier walk (`:212-226`).**

- Each entry is tested against the current tier head with an unadjusted two-sided 95% interval, read one-sided (`lo > 0`). With G groups there are up to G−1 tests per render, so false boundaries accumulate.
- Non-scored cells count 0 passed (`rows.ts:245-249`, documented in `docs/SCORING.md` §Row figures). Between a complete and a partial row, a tier boundary measures completeness, not ability. Either restrict paired tests to families scored in both rows (the `cb.n === ca.n` check does not do this, because the denominators match while one side's y is 0), or mark such comparisons as incomplete.

**`src/audit/stats.ts`.**

- `pointBiserial` (`:112-132`) is a plain Pearson r and is correct for fractional pass values. The leave-one-out rest-score (`:165-168`) is correct.
- Discrimination is computed over configs that may have run different item sets. The rest-score then mixes difficulty with coverage. Restricting it to configs that share the item's challenge is cleaner.
- `passAllK` (`:176-179`) is the fraction of configs that passed all of their own K samples. With unequal K across configs this mixes pass^2 with pass^5. Use the unbiased estimator in §2.6 at a fixed k.
- `saturated` uses `Math.min(opts.minN, 2)` (`:208`), which is always 2 when `minN ≥ 2`, so `--min-n` has no effect on this flag. `docs/SCORING.md` gives no minimum, so check whether this was intended.

**Speed and efficiency inputs.** See recommendations 2 and 3. `docs/SCORING.md` calls `tps` "the generation tokens per second (unweighted mean over those cells)". Even after zeros are excluded, a mean of rates is the wrong estimator. It should be the ratio of totals.

### 2.2 Variance decomposition: between items and between samples

For config m with n items and K_i samples of item i, the observed score is p̂ = (1/n) Σ p̂_i, and

Var(p̂) = σ²_between/n + (1/n²) Σ σ²_within,i / K_i,  with σ²_within,i = p_i(1−p_i).

Miller §3 makes the same split. Resampling shrinks only the second term.

Estimate the within term per item without bias as Σ_k (x_ik − p̂_i)²/(K_i − 1), which equals K/(K−1)·p̂_i(1−p̂_i), from items with K ≥ 2. The between term is the CR1 total minus the within term.

- The report should show both terms per row. If the within share is under about 10%, extra samples are wasted and only more items help.
- This is small TypeScript (S), next to `ratioSE`.
- Paired comparisons decompose the same way. The within term is then the sum of both configs' within variances on the shared items.

### 2.3 Sizing `--samples` and choosing which items to resample

- **The rule.** One extra sample of item i reduces Var(p̂) by roughly p_i(1−p_i)/n² · (1/K_i − 1/(K_i+1)). Rank (config, item) cells by this gain and stop when the remaining within variance is below a set fraction of the between variance. Items with p̂_i at 0 or 1 after K = 2-3 have negligible gain. Items near 0.5 have the most.
- **For tier decisions specifically.** Rank by the contribution to Var(d̂) for adjacent or boundary pairs: items where the two configs' pass fractions disagree and at least one is fractional.
- **Bias control.** To keep paired comparisons balanced and estimates unbiased, choose resample items from a pooled rule (for example, mean over configs of p̂_i(1−p̂_i) above a threshold, or the IRT information in §2.5) and apply the same K_i to every config. Choosing K separately for each config from its own outcomes is optional stopping and biases each item mean slightly toward the starting result. The current `--items FILE` flow supports the pooled rule directly.
- **Effort.** S as an `audit` flag (`--flag resample`, ranked by pooled within variance), or M with an `--apply` mode that writes the items file.
- **Power for the overall budget.** To resolve a paired difference δ at 95% with 80% power you need SE(D) ≤ δ/2.8. With the observed paired SEs in `docs/SCORING.md` (10-20-point intervals, so SE ≈ 2.5-5 points), the detectable δ is about 7-14 points. Halving it needs about 4× the variance reduction, and if the between term dominates that means about 4× the items, not samples. Compute this per comparison in the analysis script.

### 2.4 Intervals with few clusters

For published tables, report one of these:

- **CR2 with Bell-McCaffrey or Satterthwaite degrees of freedom.** R [`clubSandwich`](https://cran.r-project.org/package=clubSandwich) with `vcovCR(type="CR2")` and `coef_test(test="Satterthwaite")`. Fit an intercept-only regression of pass on config, weighted per item, clustered by family. Paired differences are the coefficient of a config dummy in a model with family or item fixed effects.
- **Wild cluster bootstrap with Rademacher or Webb weights.** Python [`wildboottest`](https://github.com/s3alfisc/wildboottest) or R `fwildclusterboot` **[CRAN availability not rechecked]**. It is the most robust option below about 10 clusters.

These belong in an offline script (`scripts/analysis/`) that reads `./bench report` rows. The webapp keeps CR1 with t critical values (§2.1), and the script's output flags any row where CR1-t and CR2 disagree materially.

### 2.5 Item response theory

A 2PL model with logit P(pass_{m,i}) = a_i(θ_m − b_i) gives:

- difficulty b_i, which grounds the tiers in measured difficulty rather than author intent;
- discrimination a_i, a principled replacement for point-biserial;
- ability θ_m with an SE;
- item information I_i(θ), used to choose items to resample or retire near the ability range where models actually differ.

[tinyBenchmarks (Polo et al. 2024, arXiv:2402.14992)](https://arxiv.org/abs/2402.14992) shows that IRT-selected subsets estimate full-benchmark scores well, which is the same goal as "resample only edge items".

- With K samples, model counts as Binomial(K_{m,i}, P). Add a family random effect (a testlet model) to absorb shared-scenario dependence.
- System-prompt variants of one model are separate θ's. A hierarchical prior θ_variant ~ N(θ_model, τ²) makes "does the system prompt matter" a direct estimate of τ.
- Tools: R [`mirt`](https://cran.r-project.org/package=mirt) (2PL, testlet bifactor), `lme4::glmer` (Rasch-like with crossed random effects for item and config, plus a family effect: the simplest robust option), or Python [`py-irt`](https://github.com/nd-ball/py-irt) (Pyro). With dozens of configs and about 180 items, use 1PL/Rasch or strong priors on a_i; 2PL is weakly identified at this size.
- Effort: M, offline only. Do not port it to TypeScript.

### 2.6 pass@k and pass^k

- **pass@k** (at least one of k succeeds): the unbiased estimator from n ≥ k samples with c correct is 1 − C(n−c, k)/C(n, k) ([Chen et al. 2021, arXiv:2107.03374](https://arxiv.org/abs/2107.03374)).
- **pass^k** (all k succeed, the reliability notion `passAllK` targets): the unbiased estimator is C(c, k)/C(n, k) ([τ-bench, Yao et al. 2024, arXiv:2406.12045](https://arxiv.org/abs/2406.12045)).

Both are a few lines of TypeScript (S); compute products to avoid overflow. Report both at a fixed k (for example k = 2 on items with n ≥ 2) per config, not per item across configs. pass^k is the relevant figure for "can I rely on this model at temperature > 0".

### 2.7 Seeds and determinism

**Current state.** Every fresh sample draws a random seed and stores it on the line (`run-challenge.ts:218`, `src/schema/attempt.ts:35-36`), and the request carries it (`chat-completion.ts:194`). The seed is drawn from Effect's `Random`, not derived from (configHash, itemHash, sample). An identical rerun therefore does not repeat the seed sequence, though any single line can be replayed. Deriving the seed as a hash of (configHash, itemHash, sample) makes reruns reproducible by construction (S).

**Determinism by runtime:**

- **llama.cpp.** `cache_prompt` (default on) can change logits because batch shapes differ between a cold and a cached prefix (README). Requests are sequential, but prefix reuse across items that share a system prompt still changes the prefill batch. For replication experiments send `cache_prompt: false`, or accept and document the effect.
- **mlx_lm.** Seeded requests skip batching and reseed the global RNG (§1.2), so same-seed replay should be deterministic on one machine and MLX version **[untested]**.
- **oMLX.** Continuous batching and SSD prefix caching make determinism unlikely **[unverified]**.
- **Across machines and kernels.** Floating-point reduction order differs, so expect divergence even at temperature 0 ([Thinking Machines, "Defeating Nondeterminism in LLM Inference", 2025](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/)).

**Action.** Add a `./bench` check that replays N lines with their stored seeds and reports the exact-match rate per runtime (M). Publish that rate as part of the dataset's replicability statement. Submissions from other hardware are then judged on score distribution, not exact outputs.

### 2.8 Timing measurement noise and comparison across hardware

- **Warmup.** oMLX is warmed up (`omlx.ts` header). The first measured item on llama.cpp and mlx_lm still pays first-touch costs (page faults on mmap'd weights, Metal pipeline compilation). Issue one unrecorded warmup completion on every runtime, or drop the first item from timing summaries.
- **Robust aggregates.** For per-row speed, use the ratio of totals for throughput and the median for per-item wall and TTFT, with an interquartile range alongside. Rows hold about 180 items of very different lengths, so a mean wall time per item mostly reflects a few long reasoning traces.
- **Separate the measured quantities.**
  - Decode tok/s is a property of the machine and runtime at a given context length.
  - Prefill tok/s depends on the cache.
  - Generated tokens per item is the model's own verbosity and transfers across hardware.

  The efficiency formula should take decode tok/s (or energy per token) and tokens per item separately, which it partly does already.
- **Cross-hardware normalisation.** At attempt start, run a fixed calibration probe: one reference prompt with fixed `max_tokens`, `cache_prompt: false`, and a pinned small reference GGUF. Store decode and prefill tok/s in the manifest. Speed-derived efficiency inputs are then reported as ratios to the reference probe on the same `hardwareId`.
  - This normalises the machine but not the model-specific memory-bandwidth effects. Keep raw values visible and within-machine comparisons primary.
  - Rows from different `hardwareId`s should not share a min-max efficiency pool (`docs/SCORING.md` §Efficiency) until normalised.
- **Thermal covariates.** Store throttle state and package power (§1.2). Exclude or flag attempts that throttled.
- **Repeated timing.** Wall time on resampled items already gives repeated measurements. Report the per-row coefficient of variation of decode tok/s so readers can see the noise floor.

### 2.9 Multiple comparisons

- **Tiers.** Apply Holm's step-down procedure ([Holm 1979](https://www.jstor.org/stable/4615733)) to the p-values of the comparisons the walk makes, as one family per rendered list. Holm is S in TypeScript: sort the p-values and compare p_(j) with α/(m−j+1).
- **The all-pairs matrix in the analysis script.** Use Benjamini-Hochberg FDR control (`statsmodels.stats.multitest.multipletests(method="fdr_bh")`, or R `p.adjust`).
- **System-prompt variants.** Pre-register which comparisons are confirmatory (variant against the same model's default prompt). Adjust only within that family, so that comparing two prompts on one model is not diluted by unrelated pairs.

### 2.10 What goes in TypeScript and what goes offline

- **TypeScript (webapp or `src/report`):**
  - t critical values
  - the speed aggregate fix
  - the variance decomposition
  - Holm in the tier walk
  - pass@k and pass^k
  - deterministic seeds
  - the resample ranking in `audit`
  - the timing fields and drilldown charts
- **Offline (`scripts/analysis/`, Python or R, reading `./bench report` JSON):**
  - CR2 with Satterthwaite degrees of freedom (`clubSandwich`)
  - wild cluster bootstrap (`wildboottest`)
  - IRT or GLMM (`mirt`, `lme4`, `py-irt`)
  - BH-adjusted pairwise tables
  - power curves

Published numbers come from the offline script. The webapp shows the fast approximation with the same estimand.

---

## Open questions for the user

1. **Efficiency across hardware.** Should rows from different machines ever share one efficiency ranking? The options are: always split by `hardwareId`; normalise with a calibration probe (§2.8); or drop wall time and tok/s in favour of tokens per item and energy per token. This choice decides whether the calibration probe and `macmon` integration are worth building.
2. **Published intervals.** Are you willing to let the published intervals come from an R or Python script (CR2 or wild bootstrap, IRT) while the webapp keeps the TypeScript CR1-t approximation? Or must every published number be reproducible from TypeScript alone?
3. **Replicability bar.** Is it "same score distribution" or "same outputs on the same machine and runtime"? The second requires deterministic seeds and `cache_prompt: false` on llama.cpp, which costs prefill time and changes measured wall time.
4. **Tier semantics.** Should tiers control the familywise error rate (Holm, fewer and more conservative boundaries), or stay a per-comparison visual cue with adjusted intervals only in published tables?
