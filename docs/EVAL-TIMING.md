# Evaluation timing

Items are public once released, so a model may have trained on the items it is scored on. What decides that is a pair: when the item became public, and when the weights the run loaded were published. The date we ran the evaluation does not enter: weights published before an item was public cannot have trained on our public copy, whenever we run them. Each snapshot of a frozen release (`YYYY.N`) discloses, per row, how many of its counted items fall in each case. It is disclosure only: it never changes a score, a pass rate or a rank.

## Which datasets carry labels

Only datasets on a frozen release carry timing labels. Datasets on release `0` (the alpha challenge set) and on the draft carry none: their snapshots' `timing` is null and the webapp shows no timing disclosure for them.

The alpha and draft items are reachable on GitHub: the alpha items since the first push of `main` on 2026-03-24, and the draft's generated suites since the `eval-dataset` branch push of 2026-11-18 (every draft item by 2026-11-27). That reachability is recorded here and not counted as publication: the benchmark had no audience before its first frozen release. It is not a disclosure and not an erratum.

## Item date

An item is published at the `committedAt` of the earliest frozen release whose `release.json` holds its prompt digest (the SHA-256 of its prompt blob, [ARCHIVE-FORMAT.md § Releases](./ARCHIVE-FORMAT.md#releases)). A prompt kept across releases keeps its first release's date; an edited prompt is a new digest, dated by the release that first holds it. Release `0` and the draft are not frozen releases for this rule, so a prompt carried over from them dates from the first frozen release that holds it. An item in no frozen release gets no label.

## Weights date

When `./bench run` starts a config, it locates the weights it will load (`src/store/weights.ts`). Weights in the Hugging Face cache sit under `…/models--<org>--<name>/snapshots/<revision>/`, which names the exact revision, for GGUF and MLX/oMLX alike. The run asks the Hub for that revision, once per config per run:

```
GET https://huggingface.co/api/models/<org>/<name>/revision/<revision>
```

and records the reply's `lastModified`, which is that revision's commit time (the reply's `createdAt` is the repository's creation and is not used), in every bundle header of the config ([ARCHIVE-FORMAT.md § Header](./ARCHIVE-FORMAT.md#header)):

```json
"env": { …, "weightsSource": { "repo": "ggml-org/Inkling-2-Mini-GGUF", "revision": "0bdc580634ceac4c4d921f452777bf44228de9af", "publishedAt": "2026-11-25T17:59:57.000Z" } }
```

The request carries only the public repo id and revision. The lookup never fails a run: it times out after 5 s, and any failure (offline, timeout, non-2xx, a reply naming another revision) records `publishedAt: null`. Weights not in the Hugging Face cache (a local path artifact) record no `weightsSource`.

## Labels

Per item and counted bundle, by UTC day: the row's cell for a challenge counts exactly one bundle, and its items are labelled against that bundle's `weightsSource.publishedAt`.

| Label | Meaning |
|---|---|
| `predates` | The weights were published on an earlier day than the item. |
| `exposable` | The weights were published on a later day than the item. |
| `unknown` | Same day, or the bundle records no weights date. |

## In the snapshot

A frozen release's snapshot carries a `timing` block beside `rows`, never in them, so it leaves an archival dataset's `rowsDigest` unchanged ([ARCHIVE-FORMAT.md § Snapshots](./ARCHIVE-FORMAT.md#snapshots)):

- `timing.items["<challenge>/<item>"]`: the item's date, for items in a frozen release.
- `timing.rows[rowId][challengeId]`: `{ weights, labels }` for each scored challenge of the row: the counted bundle's `weightsSource` (null when it records none) and its items per label. The row's shares sum these.

The webapp's drilldown shows each row's shares and, under "Evaluation timing", the weights' publication date with the revision it describes and each challenge's freeze date.

## Limits

- `predates` does not mean uncontaminated. Items draw on upstream sources and classic puzzles (much of `logic` and `math`) that may be in training data from elsewhere.
- Weights publication is not the training date. Training data was gathered earlier, so `predates` is the meaningful case; `exposable` says only that training on the item was possible.
- A revision is dated by its own commit. A requant uploaded after its base model, or a revision that only edits the model card, gets the later date, which overstates exposure: the safe direction for a disclosure.
- Only the exact prompt is dated. An item's generated siblings, an earlier wording or the same suite under another name may have been public before its release.
- A run without network access records `publishedAt: null`, and a bundle may record no `weightsSource` at all (local weights, converted legacy bundles): their items read `unknown`.
