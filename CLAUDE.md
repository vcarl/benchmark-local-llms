# CLAUDE.md

Local-LLM benchmark harness (TypeScript + Effect-TS). The `./bench` CLI (`src/`) runs configurations against challenges into a content-addressed store and builds content-addressed snapshots; `webapp/` is a static viewer that reads them.

## Invariants

Each line links to the doc that owns the rule. Change the owner, not this file, when behavior changes.

- **Releases.** A release is a frozen item set, `YYYY.N`. Release `0` is the "alpha challenge set". The in-development set is "the draft" / "pre-release", `releases/draft/`. Never call release 0 pre-release. [ARCHITECTURE § Vocabulary](docs/ARCHITECTURE.md#vocabulary)
- **Errata.** Items and prompts are public. A released item changes only via a published erratum `<release>.<n>` whose `scoresChanged` states measured counts (lines, configs). [ERRATA § Erratum fields](docs/ERRATA.md#erratum-fields)
- **Alpha is archival.** Closed at eval `0.7`, never modified; its rows are pinned by `rowsDigest` in `datasets/alpha.yaml` and `./bench report` fails on drift. Never re-stamp or rewrite archives. [ARCHIVE-FORMAT § Datasets](docs/ARCHIVE-FORMAT.md#datasets)
- **Datasets.** `datasets/<name>.yaml` is exactly its listed bundles, in exactly one format (legacy pins or v4 bundles, never mixed). [ARCHIVE-FORMAT § Datasets](docs/ARCHIVE-FORMAT.md#datasets)
- **Complete runs only.** A cell (config × challenge) counts one complete bundle, newest by `run.startedAt` (tie: lower digest); nothing is pooled across runs; an incomplete bundle never counts (no complete bundle: `not_run`). `run` skips a cell only when one bundle holds all of it. [SCORING § Report rows](docs/SCORING.md#report-rows)
- **Resume.** An interrupted cell resumes its own open file in `store/open/` (original header and run id kept). [ARCHIVE-FORMAT § Lifecycle](docs/ARCHIVE-FORMAT.md#lifecycle-open-to-sealed)
- **Provenance before reuse.** Convert old records only when provenance is proven (`./bench legacy convert`); otherwise rerun. [ARCHIVE-FORMAT § Converting](docs/ARCHIVE-FORMAT.md#converting-a-legacy-dataset)
- **Draft inclusion.** An execution counts only when its prompt is current (`messagesDigest`) and is graded under the release's scorer digest; every config version is its own variant row. [SCORING § Report rows](docs/SCORING.md#report-rows)
- **Scoring changes** need a `SCORING_RULES` bump; the golden corpus `src/scoring/rules-golden.test.ts` fails otherwise. [SCORING § Scoring rules version](docs/SCORING.md#scoring-rules-version)
- **Failure is failure.** Score-0 outcomes (errors, malformed output, timeouts) are never filtered out. Format flaws earn `0.75` partial credit. No LLM judge. [SCORING § Failure kind](docs/SCORING.md#failure-kind), [§ Format flaws](docs/SCORING.md#format-flaws)
- **Generated challenges.** Generated suites in `releases/draft/challenges/` come from `scripts/author/draft.ts` and `scripts/author/next/draft-*.ts`; edit the generator and regenerate, never the YAML. Then `./bench release sync draft`. [ERRATA § The coverage check](docs/ERRATA.md#the-coverage-check)
- **System prompts are config**: `configs.yaml` selects a key from `system-prompts.yaml`; never inline one in a challenge. [CONFIG](docs/CONFIG.md#system-promptsyaml)
- **Nothing goes upstream.** EEE export is for standardization only; never submit data anywhere. [SUBMISSION-READINESS § Policy](docs/SUBMISSION-READINESS.md#policy)

## Workflow

```bash
npm test                    # vitest: src/, scripts/author/, webapp/src/
npm run typecheck           # tsc --noEmit (src/ only)
npm run lint                # biome + scripts/lint-strict.sh (src/ only)
./bench score --dataset alpha && ./bench score --dataset draft   # fresh checkout: store/ is gitignored
./bench report              # snapshots → webapp/public/snapshots/
```

- `./bench report` refuses tracked changes under `src/`, `releases/`, `datasets/`, `configs.yaml`, `system-prompts.yaml` unless `--allow-dirty` (snapshot marked `harnessDirty`).
- New runs join the draft: `./bench run`, then `./bench dataset add draft <bundle…>`, `./bench score --dataset draft`, commit `datasets/draft.yaml`, then `./bench report` (it refuses an uncommitted manifest).
- `scripts/` is outside tsc and lint, but `scripts/author/**/*.test.ts` run under `npm test`.
- `scripts/deploy-pages.sh` builds the site (snapshots, webapp, `llms.txt`) into a local directory; `--push` publishes it to `gh-pages`. Never run it with `--push` unless Carl asks. [DEPLOY](docs/DEPLOY.md)

## Map

| Path | What |
|---|---|
| `src/cli/` | `@effect/cli` entry (`main.ts`) and subcommands; the only place for `throw`/`try`/`console` |
| `src/orchestration/` | Run loop: per-cell skip/resume, execute, seal, score; hardware probe |
| `src/llm/` | OpenAI-compatible client; llama.cpp / MLX / oMLX server supervisor |
| `src/scoring/` | Scorers, `SCORING_RULES`, failure kinds, Docker sandbox |
| `src/config/` | YAML loaders (configs, challenges, system prompts), legacy hashing, errata coverage |
| `src/store/` | Bundles (open, seal, verifying reader), skip index, score log, digests |
| `src/release/` | Release load, commit, verify; item-set digest |
| `src/dataset/` | Dataset manifests |
| `src/report/` | Manifests → snapshots, v4 rows, detail files |
| `src/legacy/` | Read-only schemaVersion 1–3 reader, freeze, convert, legacy rows |
| `src/audit/`, `src/export/` | Item audit stats; EEE export |
| `src/schema/`, `src/errors/` | Effect schemas; tagged errors |
| `src/game/` | Spacemolt scenario game (scenario items) |
| `releases/<release>/` | `challenges/`, `release.json`, `errata.yaml`, `blobs/`; `0` = alpha, `draft` = pre-release |
| `datasets/` | Manifests (`alpha.yaml` legacy, `draft.yaml` v4); `sources/` holds conversion source records |
| `store/` | Gitignored: `bundles/`, `open/`, `scores/` |
| `webapp/` | Static viewer of `webapp/public/snapshots/`; `webapp/src/llms/` renders the agent-facing markdown |

Docs (each owns its topic):

- [README.md](README.md): intro, quickstart, CLI reference
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): vocabulary, module layout, bundle lifecycle, report pipeline
- [GUARANTEES.md](docs/GUARANTEES.md): promises the harness makes, each linking to its mechanism
- [ARCHIVE-FORMAT.md](docs/ARCHIVE-FORMAT.md): on-disk formats: store, bundles, score log, releases, datasets, snapshots, legacy archives, freeze/convert
- [SCORING.md](docs/SCORING.md): scorers, pass rate, run skip, row/cell selection, failure kinds, scorer digests
- [ERRATA.md](docs/ERRATA.md): erratum fields, eval versions, coverage check, errata workflow, cutting a release
- [EVAL-TIMING.md](docs/EVAL-TIMING.md): item freeze dates, weights publication dates recorded on the run, per-row timing labels
- [ERRATA-PROCESS.md](docs/ERRATA-PROCESS.md): public errata rules, rendered at `/errata` (keep it in step with ERRATA.md; no repo links)
- [CONFIG.md](docs/CONFIG.md): YAML schemas for configs, challenges, system prompts
- [CHAT-TEMPLATES.md](docs/CHAT-TEMPLATES.md): chat templates and their pitfalls per runtime
- [EEE-EXPORT.md](docs/EEE-EXPORT.md): Every Eval Ever export
- [SCENARIOS.md](docs/SCENARIOS.md): intent of the spacemolt scenarios
- [SUBMISSION-READINESS.md](docs/SUBMISSION-READINESS.md): gate for any external submission
- [DEPLOY.md](docs/DEPLOY.md): GitHub Pages hosting behind vcarl.com/evals, the deploy script, llms.txt
- [FOLLOW-UPS.md](docs/FOLLOW-UPS.md): known open work, with where to start
- `docs/research/`: dated research reports

## Docs

`docs/*.md` are current-state and authoritative. `docs/superpowers/specs/` are dated design records, not maintained after implementation; `docs/superpowers/historical/` holds past designs. When behavior changes, update the owning doc in the same change.
