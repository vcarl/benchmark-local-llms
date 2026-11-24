# Run provenance and report rows

> Design record (2026-11-17). Not maintained; current behavior is in [docs/](../../) — see [SCORING.md § Report rows](../../SCORING.md#report-rows) and [ARCHIVE-FORMAT.md](../../ARCHIVE-FORMAT.md).
>
> Superseded by [the archive data model design](./2026-11-17-archive-data-model-design.md).

## Problem

A ranking row must say which benchmark it scores, which executions it counts, and what produced them. A run has no identity, so the webapp guesses "the latest invocation" and sometimes cuts a run in two. A cache replay writes a header with the replayer's date and environment, so an old execution looks fresh, and a later single-sample replay supersedes five-sample evidence. Nothing records the machine, so contributors' results could not be told apart from local ones.

The archive now records run identity, replay origin, and hardware. The report selects evidence and emits one row per configuration, challenge set, and machine. The webapp only sums and displays.

## Archive format (schemaVersion 3)

New attempts are written with `schemaVersion: 3`. Readers accept 1, 2 and 3. Every feature gated on the content store accepts 2 or higher. Existing archives are never rewritten.

**Header additions**

| Field | Meaning |
|---|---|
| `invocationId` | A random UUID shared by every attempt one `./bench run` writes. |
| `submitter` | Who produced the attempt: `BENCH_SUBMITTER`, default `local`. A value containing `@` is rejected, so no email addresses enter an archive. |
| `lines` | `{ generated, replayed }`, filled at finalize. These are the counts of item lines this attempt executed and copied from the cache. |
| `env.hardware` | The hardware profile (below). |
| `env.hardwareId` | 12-hex `shortSha256` of the profile's hardware fields. |

New headers omit `env.hostname`. The field stays optional so older archives decode.

**Cache-hit lines** carry `cachedFrom: { attemptId, executedAt }`. It names the attempt that executed the line. A hit on a line that already carries `cachedFrom` keeps the original value. A hit on a line without it names the attempt the line was found in, preferring an attempt that started before the line's `executedAt` (the executor, not an earlier replay). It is the second sanctioned exception to the verbatim-copy rule, after the `scorerHash` stamp. The cache serves a line only from an attempt with the running machine's `hardwareId` (an attempt without one is local), so a replay never crosses machines.

**Hardware profile** (`env.hardware`):

```ts
{ cpu: string; cpuCores: number; coreTypes?: Record<string, number>;
  gpu?: string; gpuCores?: number; gpuMemoryGb?: number; memoryGb: number; os: string }
```

`cpu` and `memoryGb` come from Node's `os`. On macOS, `coreTypes` maps each `hw.perflevelN.name` to its cores (`{ Super: 6, Performance: 12 }` on an M5 Max), `gpuCores` comes from `system_profiler`, `os` from `sw_vers`. On Linux, `os` comes from `/etc/os-release` and the GPU from `nvidia-smi` when present. A failed probe leaves its field absent and never fails a run. The probe runs once per process.

`hardwareId` hashes every profile field except `os`, so an OS update keeps the machine's rows together. The profile holds no hostname, serial number, username or email.

## Report rows

`bench report` adds `globalThis.__BENCHMARK_ROWS` to `data.js` beside the unchanged `__BENCHMARK_DATA`, which the webapp keeps reading.

```ts
interface RowsDataset {
  dataset: { label: string; archiveDir: string; challengesDir: string;
             release: string | null; errata: string[]; generatedAt: string };
  challengeSet: { id: string; version: number; hash: string; items: number;
                  scopes: Record<string, number> }[];
  hardware: Record<string, HardwareProfile>;   // hardwareId → profile
  rows: Row[];
}
```

**Dataset.** One report emits one dataset: one archive directory scored against one challenge directory. `--dataset-label` names it (default `main` for `challenges/`, else the directory name). The challenge set comes from `--challenges-dir` at report time. It is never inferred from the records. `release` is the `release-baseline.json` label when the baseline names any item of the set, and `errata` lists the `errata.yaml` ids that name an item of the set. The pilot is a separate report: `--archive-dir benchmark-archive-next --challenges-dir challenges-next --dataset-label pilot1`. A row never mixes datasets.

**Row = configHash × hardwareId.** Each item line belongs to the hardware of the attempt that executed it, so a replay never moves evidence to the replayer's machine. Archives without a hardware profile predate submissions, so they are the operator's own. The report attributes them to `--legacy-hardware`, which defaults to the reporting machine's `hardwareId`. Pass `unknown` to keep them apart.

**Selection.** For each row and each set challenge, the report pools the lines of every completed attempt with the same `(configHash, challengeId, challengeVersion)` whose `itemHash` equals the set item's current hash. Retired lines are dropped. For each `(item, sample)` it keeps the line with the latest `executedAt`. This is the cache's own rule, so a row equals what `bench run` would serve. Verbatim replays collapse into their original, and a later single-sample replay cannot drop earlier resamples.

**Executor.** A line's executor is `cachedFrom.attemptId`, else the earliest-started attempt holding the identical line that started no later than its `executedAt`. The executor's header supplies runtime version, git sha and submitter; a missing value reports `unknown`.

**Cell status**, per set challenge:

- `scored`: every set item has a counted line.
- `stale_hash`: no full coverage at the current item hashes, but a completed attempt of this challenge exists for the row.
- `interrupted`: only interrupted attempts exist.
- `not_run`: nothing exists.

A non-`scored` cell counts 0 passed, and its items stay in the denominator.

```ts
interface Cell {
  status: "scored" | "stale_hash" | "interrupted" | "not_run";
  items: number; passed: number; nearMissCredit: number;
  families: Record<string, [number, number]>; scopes: Record<string, [number, number]>;
  failureKinds: Record<string, number>;
  samples: [number, number] | null;            // min/max samples per item
  executedFrom: string | null; executedTo: string | null;
  runtimeVersions: string[]; gitShas: string[];
  sourceAttempts: string[];                    // executors of counted lines
  restamped: boolean;
}
interface Row {
  rowId: string; configHash: string; configId: string; hardwareId: string;
  artifact: string; runtime: string; quant: string | null; temperature: number;
  variant: Record<string, string>; variantLabel: string;
  cells: Record<string, Cell>;
  passed: number; items: number; passRate: number; se: number | null;
  scopes: Record<string, [number, number]>; families: Record<string, [number, number]>;
  nearMissCredit: number; failureKinds: Record<string, number>;
  completeness: { state: "complete" | "partial"; challenges: [number, number]; items: [number, number] };
  freshness: { executedFrom: string | null; executedTo: string | null };
  provenance: { runtimeVersions: string[]; gitShas: string[]; submitters: string[];
                samples: [number, number] | null; restamped: number; mixed: boolean };
}
```

**Headline.** `passRate = Σ passed / Σ set items`. A resampled item counts at its pass fraction, and a missing item counts as a fail, as today. `se` is the family-clustered CR1 standard error from SCORING.md: one cluster per family of the set, `null` below 5 clusters. `scopes` splits core and stretch over the same cells.

**Provenance.** `mixed`: the counted lines span several runtime versions or git shas (`unknown` included), or over 7 days.

**Variant.** `variant` holds only the config knobs and machine that differ among rows of the same `artifact`; `variantLabel` joins them (`t0.7 · topK 20`).

## Ingesting a contributor's archive

A contributor sets `BENCH_SUBMITTER`, runs `./bench run` into a fresh archive directory, and bundles each attempt with `./bench export`. The maintainer unpacks the bundles into the dataset's archive directory. Submitted attempts carry their own `hardwareId` and `submitter`, so they form their own rows. Only schemaVersion 3 submissions are accepted; an older archive has no hardware profile and would be attributed to the reporting machine.

## Out of scope

Webapp changes (model list, filters, dataset switcher, history view) are designed with the maintainer and will then read `__BENCHMARK_ROWS`. Upload infrastructure is out of scope.
