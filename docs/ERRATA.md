# Errata and Releases

Challenge prompts change only at a **prompt release** (at most twice a year). Between releases, scorers are patched as needed, and every item change — scorer or prompt — is documented by an **erratum**. `npm test` enforces full coverage. The public summary of these commitments is [ERRATA-PROCESS.md](./ERRATA-PROCESS.md), which the report webapp renders at `/errata` beside the live registry; keep it in step with this file.

## Files

| File | What it holds |
|---|---|
| `release-baseline.json` | Each item's `promptHash` and `scorerHash` (keyed `challengeId/itemName`) at the last release, plus the release label and date. Written only by the release command. |
| `errata.yaml` | The errata registry: one entry per documented change since the baseline, and every earlier one. |

Both live at the repo root; `challenges/` holds only challenge suites.

## Erratum fields

| Field | Meaning |
|---|---|
| `id` | Unique id (`E-0001`, …). |
| `date` | Date the erratum was recorded. |
| `kind` | `answer-key` (the key was wrong), `scorer` (the scorer graded a correct answer wrong, or grants partial credit), `prompt-ambiguity` (the prompt admits another reading), `retired` (the item is removed), `added` (the item is new since the baseline). |
| `items` | `challengeId/itemName` of every affected item. |
| `description` | What changed and why. |
| `scorerChange` | `true` when the erratum changes how stored outputs score. |
| `promptFix` | `none`, `pending-next-release` (prompt text or the item set changes at the next release), or `fixed-in-release`. |
| `release` | The release label the prompt fix shipped in; present iff `promptFix` is `fixed-in-release`. |

## The coverage check

`src/config/errata.test.ts` resolves every `challenges/*.yaml` and compares each item against `release-baseline.json`. It fails, naming the item, unless:

| Change vs baseline | Covered by |
|---|---|
| `scorerHash` differs | an erratum naming the item with `scorerChange: true` |
| `promptHash` differs | an erratum naming the item with `promptFix` other than `none` |
| item removed | an erratum naming the item of kind `retired` |
| item added | an erratum naming the item of kind `added` |

An erratum for a harness-wide scoring rule that changes no `scorerHash` (E-0007) is neither required nor tested by the check; it lists the items whose archived scores it changed, and `./bench score --stale` finds the affected attempts by content.

It also fails on a duplicate `id` and a `release` field out of step with `promptFix`. An erratum may name an item that exists in neither snapshot — a retired item leaves both at the next release, and the erratum stays as history.

A new grader (a constraint check, a scorer mode) that no item in `challenges/` uses changes no `scorerHash` and needs no erratum of its own; the `added` erratum for the first released items that use it describes it.

Only `challenges/` is checked. A challenge set in another directory is outside the baseline; run it into its own archive directory (`--challenges-dir <dir> --archive-dir <archive>`) so it never enters the default report.

## Workflow

- **Scorer defect or wrong key.** Patch the scorer or the author script, regenerate, and add an erratum with `scorerChange: true` and `promptFix: none`. Then re-score archives: `./bench score --stale`.
- **Prompt defect.** Add an erratum with `promptFix: pending-next-release` and patch the scorer if it can compensate now (`scorerChange: true`). Edit the prompt itself when preparing the next release.
- **Retiring an item.** Remove it from its challenge (keep the challenge `version`) and add a `retired` erratum with `promptFix: pending-next-release`. Then `./bench score --stale`: archived lines for the item stay in their attempt files and drop out of scoring (see [ARCHIVE-FORMAT.md § Retired items](./ARCHIVE-FORMAT.md#retired-items)). Zero-failure items are found with `./bench audit --flag zero-failure`.

## Cutting a release

```sh
npx tsx scripts/release-baseline.ts <release-label>
```

The command refuses while any change lacks an erratum. Otherwise it rewrites `release-baseline.json` from the current `challenges/` and marks every `pending-next-release` erratum `fixed-in-release` with `release: <release-label>`. Commit both files with the release.

The baseline is first created from `main` at the label `initial-main-<sha>`; `--challenges-dir <dir>` snapshots a directory other than `challenges/`.

Ref: `src/config/errata.ts`, `scripts/release-baseline.ts`.
