# Errata and Releases

Challenge prompts change only at a **prompt release** (at most twice a year). Between releases, scorers are patched as needed, and every item change — scorer or prompt — is documented by an **erratum**. `npm test` enforces full coverage. Items and prompts are public; a released item changes only through a published erratum that states the measured count of scores it changed. Making that guarantee more robust is future work. The public summary of these rules is [ERRATA-PROCESS.md](./ERRATA-PROCESS.md), which the report webapp renders at `/errata` beside the live registry; keep it in step with this file.

## Files

Each release is a directory `releases/<release>/`: `release.json` (the release file: each item's prompt and scorer digest, `scope` and `family`, and for a frozen release the item-set digest), `errata.yaml` (this release's errata registry), `challenges/*.yaml` and `blobs/`. The layout, the release file's fields, release 0's legacy digests and the draft are specified in [ARCHIVE-FORMAT.md § Releases](./ARCHIVE-FORMAT.md#releases).

## Versions

A release is `YYYY.N` (`2027.1`, `2027.2`; N ≥ 1), or `0` for the alpha challenge set taken from the `main` branch before the first dated release (`label: initial-main-<sha>`). Errata are numbered within their release: `<release>.<n>`, with n counting 1, 2, … in `errata.yaml` order (`0.1` … `0.7`; `2027.1.1`, …). The **eval version** `<release>.<n>` is the release plus errata 1..n; a `YYYY.N` release's is always three-part (`2027.1.0` before any erratum). The report emits it as `dataset.version` and the webapp header shows it (`Alpha challenge set · eval 0.7`). A release with `closed` set rejects errata beyond it.

Which scorer digest grades an item at an eval version is defined in [SCORING.md § Scorer digest and score records](./SCORING.md#scorer-digest-and-score-records).

## Erratum fields

| Field | Meaning |
|---|---|
| `id` | `<release>.<n>` (`0.1`, …; see [Versions](#versions)). |
| `date` | Date the erratum was recorded. |
| `kind` | `answer-key` (the key was wrong), `scorer` (the scorer graded a correct answer wrong, or grants partial credit), `prompt-ambiguity` (the prompt admits another reading), `retired` (the item is removed), `added` (the item is new since the release). |
| `items` | `challengeId/itemName` of every affected item. |
| `description` | Public, plain language for an outside reader: what was wrong and what changed. Rendered on `/errata`. |
| `notes` | Optional internal detail: mechanisms, harness names, commands, counts. Not emitted to the report and not published. |
| `scorerChange` | `true` when the erratum changes how stored outputs score. |
| `scorers` | With `scorerChange: true`: the scorer digest in effect after the erratum, per item (`challengeId/itemName: digest`); its blob is in `blobs/`. |
| `scoresChanged` | `{ lines, configs }`, measured on the archive the report scores (each config's latest line per item and sample): `lines` whose score differs between the eval version before the erratum and after it, `configs` the distinct `configHash`es among them. For a `retired` erratum, the lines it dropped from scoring. Required on every entry; shown on `/errata`. |
| `releaseStatus` | `none` (complete now), `next-release` (prompt text or the item set changes at the next release), or `released`. |
| `releasedIn` | The release the change shipped in; present iff `releaseStatus` is `released`. |

No erratum field feeds a `promptHash` or `scorerHash`; editing a description or notes changes no item identity.

The public status shown per erratum follows `kind`: prompt-ambiguity errata read "Prompt fix pending next release" / "Prompt fixed in release X"; retired and added errata read "In effect now · ships in the next release" / "Shipped in release X" (the item set already changed in scoring); `none` reads "In effect now".

## The coverage check

`src/config/errata.test.ts` runs `verifyRelease` (`src/release/release.ts`, the check `./bench release verify` runs) over every `releases/*/`. For a release it resolves `challenges/*.yaml` and compares each item against `release.json`, failing, naming the item, unless:

| Change vs release | Covered by |
|---|---|
| `scorerHash` differs | an erratum naming the item with `scorerChange: true` |
| `promptHash` differs | an erratum naming the item with `releaseStatus` other than `none` |
| item removed | an erratum naming the item of kind `retired` |
| item added | an erratum naming the item of kind `added` |

It also fails when a `scorerChange` erratum records no `scorers`, when an item's latest recorded scorer digest differs from its resolved one, on an id out of sequence (not `<release>.<n>` of this release, a duplicate or skipped n, or after `closed`), on a `releasedIn` field out of step with `releaseStatus`, on a blob that does not hash to its name or a digest with no blob, and on a frozen release whose items do not hash to its item-set digest. An erratum for a harness-wide scoring rule that changes no scorer digest (0.6) records the items' unchanged digests. An erratum may name an item that exists in neither snapshot — a retired item leaves both at the next release, and the erratum stays as history.

For the draft it fails when `release.json` is out of sync with `challenges/`: after editing a draft suite, run `./bench release sync draft` (writes `release.json` and any missing blobs; never deletes).

A new grader (a constraint check, a scorer mode) that no released item uses changes no `scorerHash` and needs no erratum of its own; the `added` erratum for the first released items that use it describes it.

The draft, `releases/draft/challenges/`, is the pre-release challenge set: `./bench run`'s default `--challenges-dir` (any directory that is not `.../releases/<name>/challenges` is release `draft`; [run skip](./SCORING.md#report-rows)), reported as the dataset whose manifest names release `draft` (ranked, no eval version). Its items change freely, without errata. The generated suites (`trust`, `economics`, `financial`) are written to the draft by `scripts/author/draft.ts`; the alpha challenge set is archival and never modified.

## Workflow

- **Scorer defect or wrong key.** Patch the scorer or the author script, regenerate, and add the next erratum (`<release>.<n+1>`) with `scorerChange: true` and `releaseStatus: none`. Count `scoresChanged` from the score records the new scorer digest changes (`./bench score` writes them); legacy lines graded under an earlier scorer are graded by the current one into the score log by `./bench score`, and v4 executions are re-graded under the new scorer digest as score records.
- **Prompt defect.** Add an erratum with `releaseStatus: next-release` and patch the scorer if it can compensate now (`scorerChange: true`). Edit the prompt itself when preparing the next release.
- **Retiring an item.** Remove it from its challenge (keep the challenge `version`) and add a `retired` erratum with `releaseStatus: next-release` and `scoresChanged` counting the scored lines it drops. Archived lines for the item stay in their attempt files and drop out of scoring (see [ARCHIVE-FORMAT.md § Retired items](./ARCHIVE-FORMAT.md#retired-items)). Zero-failure items are found with `./bench audit --flag zero-failure`.

## Cutting a release

```sh
./bench release sync draft            # release.json + blobs in step with the draft
./bench release commit <YYYY.N>       # --from releases/draft (default)
./bench release verify <YYYY.N>
```

`commit` copies the draft's challenges into `releases/<YYYY.N>/` with its release file, blobs and an empty `errata.yaml`; `verify` re-derives everything and exits nonzero on any mismatch. Both are specified in [ARCHIVE-FORMAT.md § Releases](./ARCHIVE-FORMAT.md#releases).
