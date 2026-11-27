# Release cycle: public items, frozen releases, errata, eval versions

> Design record (2026-11-17). Not maintained; current behavior is in [docs/](../../) — see [ERRATA.md](../../ERRATA.md) and [ARCHIVE-FORMAT.md § Releases](../../ARCHIVE-FORMAT.md#releases).

## Problem

A public benchmark earns trust by repeating an auditable process for a long time. The harness freezes prompts in a release file and requires an erratum for every item change. This spec gives that process public release names, a schedule, immutable published results, and a webapp that separates data covered by these guarantees from data that isn't.

Items and prompts are public at every stage. The process relies on no secrecy: a released item changes only through a published erratum, every published eval version stays reproducible, and every erratum states how many recorded scores it changed.

## Identities

| Identity | Changes when | Form |
|---|---|---|
| **Release** | Twice a year, in March and September | `YYYY.1`, `YYYY.2` |
| **Eval version** | Each scorer or answer-key patch within a release | `2027.1.3` (`2027.1.0` at the cut) |
| **Dataset** | One manifest of bundles counted against a release at an eval version | `datasets/<name>.yaml` |

Errata are numbered `<release>.<n>`; the eval version after erratum n is the same number, and it fixes which scorer digest grades each item. A published dataset is identified by its release and eval version. The webapp names it that way everywhere it presents results.

**Alpha challenge set.** Release `0` (`initial-main-5fa9760`) and its datasets predate this process; archives were re-scored in place before it existed. They are flagged alpha, closed at eval `0.7`, and never modified. They keep their release file and errata registry as their own record.

**Pre-release.** The draft challenge set, whichever revision is in development, at `releases/draft/`. Pre-release and draft are synonyms. When a draft is cut into a release, a new pre-release begins.

## Lifecycle of a release

```
draft (releases/draft/) ── cut ──▶ release YYYY.N frozen (YYYY.N.0) ──▶ errata YYYY.N.1, YYYY.N.2, …
```

1. **Draft.** The draft is the next release's item set, public in the repo, run and reported as the ranked `draft` dataset. Errata apply only to items of a frozen release: a draft item changes freely, with no erratum, until the release that freezes it. `./bench run` reuses a cell only when the store holds a complete bundle for it whose executions match the current prompt (`messagesDigest`); otherwise the cell is rerun.
2. **Cut (release day).** `./bench release commit <YYYY.N>` freezes the draft's items into `releases/<YYYY.N>/`: challenges, `release.json` with each item's prompt and scorer digest and a digest over the item set, the blobs, and an empty `errata.yaml`. Carl tags the release.
3. **Sweep.** Run the model list against the frozen items into the release's dataset, graded at `<release>.0`.
4. **Errata.** Anyone can report a suspected erratum. Each accepted scorer or answer-key patch is a published erratum `<release>.<n>`, raises the eval version, and publishes a new immutable snapshot.

## Verification

`release.json` records the full SHA-256 of each item's prompt blob and scorer blob (`{ config, rules, runner? }`), and one SHA-256 over the sorted `(challengeId/itemName, promptDigest, scorerDigest)` triples. `./bench release verify <release>` re-derives every blob digest from the published files, re-resolves the challenges, applies the errata, and recomputes the set digest; anyone can run it. A difference between the challenges and `release.json` that no erratum covers fails it, and fails `npm test`.

## Errata, eval versions and immutable snapshots

- Errata are scoped to their release: `releases/<release>/errata.yaml`, with the coverage check run against that release's release file. `added` is only for an item introduced after the cut.
- Each erratum records `scoresChanged`: the measured count of recorded scores it changed (lines, configs).
- Each eval version publishes an immutable, content-addressed snapshot. Re-scoring creates the next eval version's snapshot and never alters an earlier one.
- Errata ids are `<release>.<n>`, never reused or dropped.
- Outside reports go through a "Report an erratum" issue template.
- Making the erratum guarantee more robust is future work.

## Layout

```
releases/
  2027.1/
    challenges/*.yaml
    release.json           # the release file: item digests, the set digest (`commitment`) and `committedAt`
    errata.yaml
    blobs/<sha256>         # every prompt and scorer blob the release has used
```

The alpha challenge set is `releases/0/`; the pre-release set is `releases/draft/`. Snapshots live under the report output (`snapshots/index.json`, `<digest>.json`, `details/`), not under a release.

## Datasets and the report

- A dataset is `datasets/<name>.yaml`: a release, an eval version, and exactly the bundles that count, in one data format. The report scores it against that release's challenges and records the eval version it scored at.
- A result recorded in an older format is reused only when its provenance is proven while converting it, else rerun ([Provenance before reuse](../../GUARANTEES.md#provenance-before-reuse)).
- The pre-release draft is the live dataset, v4 only. A result counts when its prompt is the draft item's current prompt; every config version is its own row, shown as a variant row of its model; every counted result is graded by its item's full scorer digest (config, scoring rules version, sandbox runner) at the dataset's eval version.
- The alpha challenge set is closed and archival: its published `0.7` rows are pinned by its manifest's `rowsDigest`, and a build that would change them fails.
- A release's ranking counts only that release's items. Releases share no items, so scores aren't comparable across releases. The webapp never plots one release's scores against another's as if they were on the same scale.
- **Evaluation timing.** Prompts are public, and a model may be trained on public items ("benchmaxxing"). A per-row flag can't capture that, so rows carry none. Timing is recorded per item and model instead: when the item's prompt became public against when the model's weights were published and its stated cutoff ([2026-11-26 evaluation timing design](./2026-11-26-evaluation-timing-design.md)), so readers can weigh results accordingly.

## Webapp disclosure

The dataset column groups datasets by release, each with its eval version and snapshot digest.

Each release has two pages:
- **Release notes** (`#/release/<release>`): the set digest, the dates, challenge and item counts, the snapshots to cite, and verification instructions.
- **Errata** (`#/errata?release=<release>`): each entry's description and its measured `scoresChanged`.

A challenge cell carries ✱ when a scoring erratum since `<release>.0` changed recorded scores on that challenge's items. The alpha set predates errata markers.

## Phases

1. **Alpha flag** (done). The archive's dataset is `alpha` (release `0`); the webapp shows its title in place of the `initial-main-…` label; the erratum issue template.
2. **Release mechanics** (done). The `releases/` layout, the set digest, `./bench release commit` and `./bench release verify`, and per-release errata coverage.
3. **Eval versions** (done). Immutable, content-addressed snapshots per eval version.
4. **Webapp information architecture** (done). Datasets grouped by release, the release notes and errata pages, and the ✱ erratum marker.

## Out of scope

- The first public release's content (`2027.1` items).
- Hosting and publishing automation. Deploying is a separate decision.
