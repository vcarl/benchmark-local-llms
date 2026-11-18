# Errata process

**Pre-release.** No versioned release of the benchmark has been cut. The current baseline is the initial state of the `main` branch, and these commitments may be refined before the first release.

An erratum is a public record of a change to a benchmark item after the baseline: its answer key, its scorer, its prompt, or whether it is in the set at all. This page describes how errata are identified, recorded, and patched, and how they affect published results.

## Commitments

- **Every item change has an erratum.** An automated check in the test suite compares every item against the baseline and fails when an item differs without an erratum that accounts for it. Errata coverage of item changes is 100%.
- **Scorers are patched as needed.** A wrong answer key or a scorer that grades a correct answer as wrong is fixed when it is found. Stored model outputs are then re-scored under the patched scorer; models are not re-run.
- **Prompts change only at a prompt release, at most twice a year.** A prompt defect found between releases is recorded at once as pending the next release. When the scorer can compensate in the meantime, the scorer is patched immediately and the erratum says so.
- **A release cannot be cut while any change lacks an erratum.** At a release, the baseline is re-taken from the current items, and every erratum pending that release is marked fixed in it.

## What counts as an erratum

Each erratum has one kind:

- **Answer key**: the expected answer was wrong.
- **Scorer**: the scorer graded a correct answer as wrong, or grants partial credit.
- **Prompt ambiguity**: the prompt admits another reading.
- **Retired**: the item is removed from the set.
- **Added**: the item is new since the baseline.

Each erratum records an id (`E-0001`, …), the date it was recorded, its kind, every affected item, what changed and why, whether it changes how stored outputs score, and its prompt-fix status: none, pending the next release, or fixed in a named release.

## How a scoring change is linked to an erratum

The baseline holds a hash of each item's prompt and of its scorer. The check requires:

- a changed scorer hash: an erratum naming the item and marked as a scoring change;
- a changed prompt hash: an erratum naming the item with a prompt fix pending or shipped;
- a removed item: a retired erratum naming it;
- a new item: an added erratum naming it.

A scoring rule that applies across the whole harness, rather than to one item's scorer, changes no item hash and so is not required by the check. Its erratum lists the items whose archived scores it changed.

## Retired items

Items are retired when they no longer discriminate between models, for example when every tested configuration passes them. A retired item is removed from its challenge without changing the challenge's version. Outputs already recorded for it are kept unchanged in the archive and drop out of scoring, so every configuration's results stay comparable over the remaining items. The retired erratum stays in the registry after the item leaves the set.

## Partial credit

Some items declare specific near misses, such as a rounding slip or a percent where a decimal was asked, that earn partial credit. Adding a near miss is a scoring change and needs an erratum. The headline pass rate stays binary: an item passes only at full score. Partial credit is reported separately and never changes the headline.

## Reporting a suspected error

If an answer key looks wrong, a scorer marked a correct answer as wrong, or a prompt can be read another way, [report a suspected erratum](https://github.com/vcarl/benchmark-local-llms/issues/new?template=report-erratum.yml). Name the challenge and item, what you expected, and a model output that shows the problem. A confirmed problem is fixed under the commitments above and recorded as an erratum.
