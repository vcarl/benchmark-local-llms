# Deploy

The report is a static site: the webapp, the snapshots it reads, and markdown renderings of the same data for agents. GitHub Pages serves every byte; `https://vcarl.com/evals/` is the public, canonical URL.

## Hosting

| Host | Serves | Why |
|---|---|---|
| `https://vcarl.github.io/benchmark-local-llms/` (`PAGES_ORIGIN`) | Everything: `assets/`, `snapshots/`, `index.html`, `llms.txt`, `llms/**.md` | Pages bandwidth is free. Pages sends `access-control-allow-origin: *`, so pages on other hosts can load from it. Built from branch `gh-pages`, path `/` |
| `https://vcarl.com/evals/` (`SITE_URL`) | A proxy of the Pages root: Netlify 200 rewrites in the vcarl.com repo's `public/_redirects` (`/evals` and `/evals/*` → `PAGES_ORIGIN`) | The canonical URL. Netlify bandwidth is metered, so only `index.html` (under 2 KB) and the markdown pass through it |

The webapp is built with Vite's `base` set to `PAGES_ORIGIN`, so the script and stylesheet tags in `index.html` and every snapshot, detail and prompt-pack fetch (`webapp/src/lib/snapshots.ts`) name the Pages origin. A browser at `vcarl.com/evals/` fetches the shell from Netlify and everything else straight from GitHub. Routes are hash routes (`#/release/draft`), so `/evals` and `/evals/` serve every view from the one `index.html`.

`index.html` declares `<link rel="canonical" href="SITE_URL">` and a `<link rel="alternate" type="text/markdown">` to `llms.txt`. Its meta description, a note inside the app root (shown before the JavaScript mounts and replaced when it does) and a `<noscript>` block point agents to `llms.txt`.

`robots.txt` applies only at a host root. vcarl.com's `public/robots.txt` and `public/llms.txt` live in that repo. A `robots.txt` for `vcarl.github.io` would need a separate `vcarl.github.io` user-site repo, which does not exist.

## Building and publishing

```bash
scripts/deploy-pages.sh [--store DIR] [--legacy-root DIR] [--out DIR] [--remote REMOTE] [--push]
```

| Flag / env | Default | Meaning |
|---|---|---|
| `--store` | `store` | Store passed to `./bench report` |
| `--legacy-root` | `.` | Legacy root passed to `./bench report` (the directory holding `benchmark-archive*`) |
| `--out` | a new temp directory | Site directory; must be absent or empty (the build empties it) |
| `--remote` | `origin` | Remote name or URL that `--push` publishes to |
| `--push` | off | Publish; without it the site is only built for inspection |
| `PAGES_ORIGIN` | `https://vcarl.github.io/benchmark-local-llms/` | Data origin; the webapp build and the llms generator both read it |
| `SITE_URL` | `https://vcarl.com/evals/` | Canonical URL; the webapp build and the llms generator both read it |

The script stops if any tracked file has uncommitted changes. `./bench report` additionally refuses uncommitted dataset manifests. Then it:

1. Runs `./bench report --store … --legacy-root …` into `webapp/public/snapshots/`. Earlier snapshots still in that directory stay in its index, so they remain citable after a new eval version.
2. Runs `vite build` with `PAGES_ORIGIN` and `SITE_URL` into the site directory, which copies `public/snapshots/` in.
3. Runs `webapp/src/llms/cli.ts` on the site directory (below) and adds `.nojekyll`.
4. Prints the file count and total bytes, and the bytes that pass through `SITE_URL`.
5. With `--push`, commits the site directory into a fresh repository as a single root commit on `gh-pages` and force-pushes it to the remote. Every deploy replaces the branch, so `gh-pages` always holds exactly one commit and the history does not accumulate generated data.

The deploy runs locally because the store it reads is local, and generated data never enters `main`.

To deploy from this machine's store:

```bash
scripts/deploy-pages.sh --store <store> --legacy-root <legacy root>          # build, inspect
scripts/deploy-pages.sh --store <store> --legacy-root <legacy root> --push   # build and publish
```

To build without deploying (relative URLs, usable at any mount point), run `./bench report` then `cd webapp && npm run build`; `npm run dev` serves `webapp/public/snapshots/` locally.

## llms.txt

`webapp/src/llms/render.ts` renders markdown from the snapshots alone. The output is a pure function of `snapshots/` and the two URLs, so anyone can rebuild it from a published site:

```bash
node_modules/.bin/tsx webapp/src/llms/cli.ts <site-dir> --site-url <SITE_URL> --data-origin <PAGES_ORIGIN>
```

It reads `<site-dir>/snapshots/` and writes next to it:

| Path | Contents |
|---|---|
| `llms.txt` | [llmstxt.org](https://llmstxt.org) index: what the benchmark measures, usage notes, absolute links to every page below |
| `llms/methodology.md` | Pass rule, coverage adjustment, intervals, tiers, scope, provenance, with links to these docs on GitHub |
| `llms/<dataset>/leaderboard.md` | Per ranked dataset (its current snapshot): rank, tier, config, model, runtime, quant, pass rate ± 95% CI, core and stretch pass rates, challenges run |
| `llms/<dataset>/configs/<configId>.md` | One per row: config, runtime versions, config hash, hardware, harness commits, score, failures, cost, per-challenge results. A configId with several rows gets `-<configHash[:8]>` appended |
| `llms/<dataset>/challenges/<id>.md` | Items, scopes, families, a link to the challenge YAML, per-config pass rates |
| `llms/<dataset>/release.md` | Release notes: release file facts, challenges, snapshot digests to cite |
| `llms/<dataset>/errata.md` | The snapshot's errata with their measured `scoresChanged`, when it has any |

Every number comes from the webapp's own model, the same `scopeRow`, `sortRows`, `groupRows` and `stats.ts` the page uses. Tiers come from the score sort with grouping `none`, one tier per config. The pages omit the efficiency score: it is relative to the pool on one machine. A row's weights digest appears only when it distinguishes the row from the model's other rows (the variant label); the config hash always covers it.

There is no `llms-full.txt`. The pages total about 1.2 MB, all of it served through Netlify, so `llms.txt` links pages for an agent to fetch one at a time instead.
