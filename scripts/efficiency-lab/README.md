# Efficiency lab

A standalone explorer for the efficiency formula in `docs/SCORING.md` (§ Efficiency). It scores the report rows under several formula families (geometric, additive, cost-per-correct, score-gated, Pareto), with sensitivity readouts. Use it to re-tune the exponents when the data changes. The shipped formula is the geometric family, log-min–max normalization, weights `S 1.70, wall 0.50, tps 0.60, tokens 0.70, mem 0.10`; the webapp implementation is `withEfficiency` in `webapp/src/lib/model.ts` and must be kept in step with `core.cjs`.

Files: `core.cjs` (pure scoring core), `page.html` (UI template), `extract.cjs` (report rows to `rows.json`), `build.cjs` (inlines core and data into one HTML page), `test.cjs` (core tests), `harness.cjs` (builds a page that drives the UI, for a headless browser check). Generated files go to `work/` (git-ignored).

```
./bench report --output scripts/efficiency-lab/work    # writes work/data.js (and a details/ folder you can delete)
node scripts/efficiency-lab/extract.cjs                # work/rows.json, from the "main" dataset
node scripts/efficiency-lab/build.cjs                  # work/efficiency-lab.html
node scripts/efficiency-lab/test.cjs                   # core tests over rows.json
open scripts/efficiency-lab/work/efficiency-lab.html
```

`extract.cjs` mirrors `scopeRow` for the all-items, all-challenges scope: wall seconds and tokens per item, generation tok/s as the unweighted mean over scored cells, peak memory as the maximum, score as the coverage-adjusted pass rate. The page loads fonts from Google Fonts and otherwise needs no network.
