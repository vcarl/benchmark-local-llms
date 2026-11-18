# Errata and Releases

Challenge prompts change only at a **prompt release** (at most twice a year). Between releases, scorers are patched as needed, and every item change — scorer or prompt — is documented by an **erratum**. `npm test` enforces full coverage. The public summary of these commitments is [ERRATA-PROCESS.md](./ERRATA-PROCESS.md), which the report webapp renders at `/errata` beside the live registry; keep it in step with this file.

## Files

| File | What it holds |
|---|---|
| `release-baseline.json` | Each item's `promptHash` and `scorerHash` (keyed `challengeId/itemName`) at the last release, plus the release version (`release`), the date, and an optional `label`. Written only by the release command. |
| `errata.yaml` | The errata registry: one entry per documented change since the baseline, and every earlier one. |

Both live at the repo root; `challenges/` holds only challenge suites.

## Versions

A release version is CalVer `YYYY.M` (`2027.1`), or `0` for the pre-release baseline taken from `main` before the first release (`label: initial-main-<sha>`). Errata are sub-releases of the release whose baseline they patch: `<release>.<n>`, with n counting 1, 2, … in `errata.yaml` order within that release (`0.1` … `0.6`; after release `2027.1`, `2027.1.1`, …). The **eval version** `<release>.<n>` is the release baseline plus errata 1..n of that release; the report emits it as `dataset.version` and the webapp header shows it (`eval 0.6 · pre-release`). Errata of earlier releases stay in the registry as history.

## Erratum fields

| Field | Meaning |
|---|---|
| `id` | `<release>.<n>` (`0.1`, …; see [Versions](#versions)). |
| `date` | Date the erratum was recorded. |
| `kind` | `answer-key` (the key was wrong), `scorer` (the scorer graded a correct answer wrong, or grants partial credit), `prompt-ambiguity` (the prompt admits another reading), `retired` (the item is removed), `added` (the item is new since the baseline). |
| `items` | `challengeId/itemName` of every affected item. |
| `description` | Public, plain language for an outside reader: what was wrong and what changed. Rendered on `/errata`. |
| `notes` | Optional internal detail: mechanisms, harness names, commands, counts. Not emitted to the report and not published. |
| `scorerChange` | `true` when the erratum changes how stored outputs score. |
| `releaseStatus` | `none` (complete now), `next-release` (prompt text or the item set changes at the next release), or `released`. |
| `releasedIn` | The release the change shipped in; present iff `releaseStatus` is `released`. |

No erratum field feeds a `promptHash` or `scorerHash`; editing a description or notes changes no item identity.

The public status shown per erratum follows `kind`: prompt-ambiguity errata read "Prompt fix pending next release" / "Prompt fixed in release X"; retired and added errata read "In effect now · joins the baseline at the next release" / "In the baseline since release X" (the item set already changed in scoring); `none` reads "In effect now".

## The coverage check

`src/config/errata.test.ts` resolves every `challenges/*.yaml` and compares each item against `release-baseline.json`. It fails, naming the item, unless:

| Change vs baseline | Covered by |
|---|---|
| `scorerHash` differs | an erratum naming the item with `scorerChange: true` |
| `promptHash` differs | an erratum naming the item with `releaseStatus` other than `none` |
| item removed | an erratum naming the item of kind `retired` |
| item added | an erratum naming the item of kind `added` |

An erratum for a harness-wide scoring rule that changes no `scorerHash` (0.6) is neither required nor tested by the check; it lists the items whose archived scores it changed, and `./bench score --stale` finds the affected attempts by content.

It also fails on an id out of sequence (not `<release>.<n>`, a duplicate or skipped n, or a release newer than the baseline's) and a `releasedIn` field out of step with `releaseStatus`. An erratum may name an item that exists in neither snapshot — a retired item leaves both at the next release, and the erratum stays as history.

A new grader (a constraint check, a scorer mode) that no item in `challenges/` uses changes no `scorerHash` and needs no erratum of its own; the `added` erratum for the first released items that use it describes it.

Only `challenges/` is checked. A challenge set in another directory is outside the baseline; run it into its own archive directory (`--challenges-dir <dir> --archive-dir <archive>`) so it never enters the default report.

## Workflow

- **Scorer defect or wrong key.** Patch the scorer or the author script, regenerate, and add the next erratum (`<release>.<n+1>`) with `scorerChange: true` and `releaseStatus: none`. Then re-score archives: `./bench score --stale`.
- **Prompt defect.** Add an erratum with `releaseStatus: next-release` and patch the scorer if it can compensate now (`scorerChange: true`). Edit the prompt itself when preparing the next release.
- **Retiring an item.** Remove it from its challenge (keep the challenge `version`) and add a `retired` erratum with `releaseStatus: next-release`. Then `./bench score --stale`: archived lines for the item stay in their attempt files and drop out of scoring (see [ARCHIVE-FORMAT.md § Retired items](./ARCHIVE-FORMAT.md#retired-items)). Zero-failure items are found with `./bench audit --flag zero-failure`.

## Cutting a release

```sh
npx tsx scripts/release-baseline.ts <YYYY.M>
```

The maintainer chooses the version. The command refuses a version that is not `YYYY.M` or does not follow the current baseline release, and refuses while any change lacks an erratum or an id is out of sequence. Otherwise it rewrites `release-baseline.json` from the current `challenges/` at `release: <YYYY.M>` and marks every `next-release` erratum `released` with `releasedIn: <YYYY.M>`. Errata recorded afterwards number from `<YYYY.M>.1`. Commit both files with the release. `--challenges-dir <dir>` snapshots a directory other than `challenges/`.

Ref: `src/config/errata.ts`, `scripts/release-baseline.ts`.
