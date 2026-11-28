# Methodology

> How the pass rates, intervals and tiers on these pages are computed. The repository docs are authoritative; this page summarizes them.

- **Items and scorers.** Each challenge is a set of items with a deterministic scorer: exact match on a marked answer, constraint checks, JSON or tool-call matching, or code run against tests in a sandbox. There is no LLM judge. Items and prompts are public. [SCORING.md](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/SCORING.md)

- **Pass rule.** An item passes only at a score of exactly 1. Partial credit (including the 0.75 for a correct answer in the wrong format) is recorded for diagnosis but counts as a fail. Errors, timeouts and malformed output are failures and are never filtered out. A resampled item counts once, at the share of its samples that passed. [§ Per-execution score vs pass rate](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/SCORING.md#per-execution-score-vs-pass-rate)

- **Coverage adjustment.** A config's pass rate is passed items over every item of the dataset's challenge set. A challenge it did not run, or ran only incompletely, keeps its items in the denominator with 0 passed, so running fewer challenges never raises a score. Only complete runs count; the newest complete run of each config × challenge is used and runs are never pooled. [§ The pass-rate formula](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/SCORING.md#the-pass-rate-formula), [§ Report rows](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/SCORING.md#report-rows)

- **Intervals.** Items sharing a scenario are correlated, so the sampling unit is the item family. The 95% interval is the cluster-robust (CR1) standard error of the pass rate over families, times the Student-t critical value with (families − 1) degrees of freedom; none is given below 5 families. [§ Uncertainty and statistical ties](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/SCORING.md#uncertainty-and-statistical-ties)

- **Tiers.** Sorted by pass rate, a tier runs from its head until a config whose paired 95% interval against the head (over the families both scored) excludes 0; that config starts the next tier. Configs in one tier are not statistically resolved from each other.

- **Scope.** Items are core (short, practical work) or stretch (solver-backed multi-step reasoning); the core and stretch columns are the pass rate over each. [§ Scope](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/SCORING.md#scope)

- **What a row is.** A row is one config (model weights, runtime, quant, chat template, system prompt, sampler settings) on one machine. Results describe a model on that stack, not the model in the abstract. Cost figures (tokens, wall time, speed, memory) come from that one machine and do not transfer to other hardware; the webapp's efficiency score is notional for the same reason and is not reproduced here.

- **Releases and errata.** A release is a frozen item set; the draft (pre-release) may still change. Released items change only through published errata that state the scores they changed. [ERRATA-PROCESS.md](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/ERRATA-PROCESS.md), [ARCHITECTURE.md § Vocabulary](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/ARCHITECTURE.md#vocabulary)

- **Provenance.** Every page cites the snapshot digest it was built from; the snapshots are published at https://vcarl.github.io/benchmark-local-llms/snapshots/ (`index.json` lists them) and these pages rebuild from them byte for byte. [ARCHIVE-FORMAT.md § Snapshots](https://github.com/vcarl/benchmark-local-llms/blob/main/docs/ARCHIVE-FORMAT.md#snapshots)
