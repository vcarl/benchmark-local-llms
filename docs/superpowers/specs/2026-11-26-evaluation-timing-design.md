# Evaluation timing — design record (2026-11-26)

## Problem

All prompts are public by choice; there is no private split. A model may have trained on our items. Readers need to see, per result, whether that was possible. Exposure belongs to the (item, weights) pair: what matters is when the item became public against when the weights were published, not when we ran the evaluation. A boolean on the run cannot express that.

## Decisions

- **Item dates keyed by prompt digest, outside releases.** One repo-level, append-only `item-dates.json` maps the SHA-256 of a prompt blob to `{ publishedAt, evidence }`. A digest is stable across releases and an edited prompt gets its own date; keeping the map out of `release.json` means dating never changes an item digest or the item-set digest. Tradeoff: the map lives beside the releases rather than in them, so `./bench release verify` does not cover it; the snapshot pins it by digest in `inputs`.
- **Ground truth is GitHub's activity log, not commit dates.** Commit dates are author-set; the repository activity API gives server-side times for every push, force push, branch creation and merge, back to the repository's creation, including force-pushed and deleted branches. A commit is public from the first push that made it reachable. Tradeoff: the API call needs `gh` auth and network; the result is checked in, so builds stay offline.
- **Scan every public file for prompts, hash the harness's way.** Every YAML/JSON blob of every public commit is walked for `prompt` / `prompt_text` strings and multi-turn `turns` (expanded with the harness's `expandItem`, hashed with `promptContent`), so the legacy `prompts/` corpus, unmerged branches and `gh-pages` detail files all count. The script first checks that its walk over the local YAML gives exactly the harness's digests. Tradeoff: a broad scan can only make an item public earlier, never later, which errs toward `exposable`.
- **No entry = not public as of `asOf`.** With the full history scanned, a missing digest is unpublished, not unknown; `asOf` records when that was last checked. Without the file at all, every item is unknown.
- **Model dates keyed by `modelKey`.** `model-dates.yaml` reuses the report's model identity, so requantized and converted builds inherit the base model's dates with no per-config mapping; fine-tunes have their own key. Every date names its source URL, enforced at build time. Tradeoff: `modelKey` is a heuristic over artifact names; a `configs.yaml` `modelKey` override corrects a mis-grouped build.
- **Release date fallback.** Where no vendor-stated release date was found, the original Hugging Face repo's `createdAt` stands in, labelled in `releasedNote`. Tradeoff: it can precede the public release, which errs toward `predates`; requiring a stated date would have left most rows `unknown`.
- **Labels computed at report time.** `unpublished`, `predates`, `cutoff-claimed`, `exposable`, `unknown`; a coarse date covers its whole period, and overlapping release and item dates are `unknown`. An overlapping cutoff does not count as before the item (`exposable`).
- **Beside the rows, never in them.** The snapshot's `timing` block holds per-row, per-scored-challenge label counts, the items' dates and the rows' model entries. Rows are unchanged, so release 0's pinned `rowsDigest` holds. Tradeoff: the webapp reads a second structure keyed by row id instead of a row field.
- **Ruling: alpha and draft are not treated as public.** The alpha items are reachable on GitHub since 2026-03-24 and most draft generated suites since the 2026-11-18 `eval-dataset` push, but nobody has paid attention to the benchmark, so that reachability is recorded (`item-dates.json`) and not counted as publication; it is not a disclosure and not an erratum. Alpha and draft snapshots carry no timing block.
- **Effective publication date.** For an item of a frozen `YYYY.N` release: the later of its first public push and the `committedAt` of the earliest frozen release holding its prompt digest; no push = `unpublished`. Release `0` and the draft are not frozen releases for this rule. Tradeoff: an item pushed early but frozen late dates from the freeze, trusting that nobody trained on an unreleased branch.
- **Disclosure only.** No score, pass rate or rank reads the labels.

## Revised 2026-11-27

The checked-in date files are dropped; both dates now come from records the harness already holds or writes itself. This supersedes the decisions above on item dates, model dates, labels and the effective publication date.

- **Item date = first freeze.** An item is dated by the `committedAt` of the earliest frozen release whose `release.json` holds its prompt digest. A release is public when frozen, so there is no `unpublished` label, no `item-dates.json` and no GitHub activity scan. Tradeoff: an item pushed early but frozen late dates from the freeze, trusting that nobody trained on an unreleased branch.
- **Weights date recorded on the run.** `./bench run` reads the exact Hugging Face revision from the cache path of the weights it loads and records, in the bundle header's `env.weightsSource`, that revision's `lastModified` from `GET /api/models/<repo>/revision/<sha>` (the revision's commit time; `createdAt` there is the repo's). It is `env`, so it enters no config identity; the field is optional, so every existing bundle decodes and verifies unchanged. Tradeoff: a requant or a card-only commit dates later than the base model, overstating exposure, the safe direction; in exchange no hand-curated, heuristically keyed `model-dates.yaml` and no vendor cutoff claims.
- **Never fails a run.** One lookup per config per run, 5 s timeout, any failure recorded as `publishedAt: null`; weights outside the cache record no source. The request carries only the public repo id and revision.
- **Labels per counted bundle.** `predates`, `exposable`, or `unknown` on the same UTC day or without a weights date. A cell counts one bundle, so each challenge of a row is labelled against its own bundle's weights; `timing.rows[rowId][challenge]` carries that bundle's `weightsSource` beside the counts.
- **Kept.** Frozen releases only (alpha and draft `timing: null`, their reachability recorded in prose, not counted), timing beside the rows, disclosure only.

## Out of scope

A fresh-split comparison (regenerating items to compare against public ones), suite weighting (issue #12), and any scoring change.

## Current reference

[docs/EVAL-TIMING.md](../../EVAL-TIMING.md).
