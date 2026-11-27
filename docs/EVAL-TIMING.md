# Evaluation timing

Items are public once released, so a model may have trained on the items it is scored on. What decides that is a pair: when the item became public, and when the model's weights were published. The date we ran the evaluation does not enter: weights published before an item was public cannot have trained on our public copy, whenever we run them. Each snapshot of a frozen release (`YYYY.N`) discloses, per row, how many of its counted items fall in each case. It is disclosure only: it never changes a score, a pass rate or a rank.

## Which datasets carry labels

Only datasets on a frozen release carry timing labels. Datasets on release `0` (the alpha challenge set) and on the draft carry none: their snapshots' `timing` is null and the webapp shows no timing disclosure for them.

The alpha and draft items are reachable on GitHub: the alpha items since the first push of `main` on 2026-03-24, and most of the draft's generated suites (extraction, transform, ifeval, longctx, regex, sql, and parts of chains, followups and stretch) since the `eval-dataset` branch push of 2026-11-18. `item-dates.json` records that reachability. It is not counted as publication: the benchmark had no audience before its first frozen release. It is not a disclosure and not an erratum.

## Effective publication date

An item of a frozen release is published at the later of:

1. its first public push (`item-dates.json`), and
2. the `committedAt` of the earliest frozen release whose `release.json` holds its prompt digest.

An item with no public push is `unpublished`, whatever release holds it. Release `0` and the draft are not frozen releases for this rule, so a prompt carried over from them dates from the first frozen release that holds it, or from a later push.

## Item dates: `item-dates.json`

```json
{
  "asOf": "2026-11-27T03:09:55Z",
  "source": "https://github.com/vcarl/benchmark-local-llms",
  "items": {
    "<prompt digest>": { "publishedAt": "2026-06-20T21:07:59Z", "evidence": "GitHub activity push refs/heads/main …" }
  }
}
```

- Keyed by prompt digest: the SHA-256 of the item's prompt blob (`promptContent`, [ARCHIVE-FORMAT.md § Releases](./ARCHIVE-FORMAT.md#releases)). The digest is the same in every release that keeps the prompt; an edited prompt is a new digest with its own date. Release 0's 12-hex legacy digests are not used: its items are hashed from their prompt text the same way.
- `publishedAt` is the earliest time that exact prompt was reachable on a branch of the public repository `source`: technical reachability, which feeds the [effective publication date](#effective-publication-date). No entry means the prompt was not reachable as of `asOf`.
- `evidence` names the push and the commit and file that held the prompt. Times are GitHub's server-side push times from the repository activity log (every push, force push, branch creation and merge, including branches since deleted), not commit dates, which their author sets.
- The file sits outside every release: it is not in `release.json`, item digests or the item-set digest, so dating an item never changes a release.
- Entries are append-only. `npx tsx scripts/timing/date-items.ts` adds an entry for every local item (`releases/*/challenges/`) whose digest it finds public and never changes an existing one. It reads the activity log with `gh api`, fetches any public commit missing locally, scans every YAML and JSON file of every public commit (challenge files, the legacy `prompts/` corpus, `gh-pages` detail files) for `prompt` / `prompt_text` strings and multi-turn `turns`, and hashes each as the harness does. It checks itself first: its scan of the local challenge YAML must give exactly the harness's digests.
- Run it after any push that makes items public. Until it runs, those items still read as unpublished.

## Model dates: `model-dates.yaml`

```yaml
qwen3.5-9b:
  model: Qwen/Qwen3.5-9B
  released: "2026-02-27"
  releasedSource: https://huggingface.co/api/models/Qwen/Qwen3.5-9B
  releasedNote: "HF repo createdAt of the original repo; the public release may be later."
  cutoff: "2025-06"            # only when the vendor states one
  cutoffSource: https://…
```

- Keyed by `modelKey` ([SCORING.md § Report rows](./SCORING.md#report-rows)), so every GGUF, MLX and requantized build of one model shares the base model's dates. A fine-tune, distill or merge has its own key and its own dates.
- `released` is when the weights became public: the vendor's stated release date, else the original Hugging Face repo's `createdAt` (its `releasedNote` says so). `cutoff` is a training or knowledge cutoff the vendor states. Dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, at the precision of the source.
- Every date names its source URL; a date without one fails the build. A fact with no source is left out and counts as unknown.

## Labels

Per item and row, with the item's effective publication day (UTC) and the row's model dates. A coarse date covers its whole period: `2025-06` is June 1–30.

| Label | Meaning |
|---|---|
| `unpublished` | The item was not public as of `asOf`: the weights cannot have trained on it. |
| `predates` | The weights were published before the item became public. |
| `cutoff-claimed` | The weights were published after the item, but the stated cutoff is before it. |
| `exposable` | The weights were published after the item, and the cutoff is missing or not before it. |
| `unknown` | The item or the release date is missing, or the two fall on the same day or period. |

## In the snapshot

A frozen release's snapshot carries a `timing` block beside `rows`, never in them, so it leaves an archival dataset's `rowsDigest` unchanged ([ARCHIVE-FORMAT.md § Snapshots](./ARCHIVE-FORMAT.md#snapshots)):

- `timing.rows[rowId][challengeId]`: items per label, for each scored challenge of the row; the row's shares sum these.
- `timing.items["<challenge>/<item>"]`: the item's effective `publishedAt`, its first push (`pushedAt`, with `evidence`) and its first frozen release's `committedAt` (`frozenAt`), or null when not public.
- `timing.models[modelKey]`: the row models' entries, sources and notes included.
- `timing.itemDates`: `asOf` and `source` of `item-dates.json`; null without the file, when every item is unknown.

`inputs.itemDates` and `inputs.modelDates` are the SHA-256 of the two files (null when absent, and for alpha and draft snapshots, which do not read them). `./bench report` takes them from `--item-dates-file` (default `item-dates.json`) and `--model-dates-file` (default `model-dates.yaml`), and both count as harness paths for its dirty-tree check. The webapp shows each row's shares and, in the drilldown, the dates behind them.

## Limits

- `predates` does not mean uncontaminated. Items draw on upstream sources and classic puzzles (much of `logic` and `math`) that may be in training data from elsewhere.
- Only the exact prompt is dated. An item's generated siblings, an earlier wording or the same suite under another name may be public while its own digest is not.
- A cutoff is the vendor's claim, and post-training data can extend past it.
- A repo's `createdAt` can precede the public release of its weights, which errs toward `predates`.
- Push dates assume the repository has been public since it was created. Had it been private for a while, its early push dates would be earlier than the true ones; a release's `committedAt` bounds them from below.
