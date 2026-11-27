// Mirrors webapp/src/lib/model.ts scopeRow (scope: all items, all challenges).
const path = require("path"), W = path.join(__dirname, "work");
const fs = require("fs");
const index = JSON.parse(fs.readFileSync(path.join(W, "index.json"), "utf8"));
// The index's first entry: the alpha dataset.
const ds = JSON.parse(fs.readFileSync(path.join(W, `${index.snapshots[0].digest}.json`), "utf8"));
const out = [], missing = [];
for (const r of ds.rows) {
  let passed=0, items=0, scoredItems=0, scored=0, total=0, costItems=0; const costs=[];
  for (const c of Object.values(r.cells)) {
    if (c.items===0) continue; total++; items+=c.items; passed+=c.passed;
    if (c.status!=="scored") continue; scored++; scoredItems+=c.items;
    if (c.cost) { costs.push(c.cost); costItems+=c.items; }
  }
  const name = r.modelName + (r.variantLabel ? " · " + r.variantLabel : "");
  const tok = costs.reduce((s,c)=>s+c.tokens,0), wall = costs.reduce((s,c)=>s+c.wallSec,0);
  const timed = costs.filter(c=>c.genTps>0), decode = timed.reduce((s,c)=>s+c.tokens/c.genTps,0);
  const o = { n:name, k:r.modelKey, rt:r.runtime, q:r.quant, ok: scored===total, ch:[scored,total],
    s:+(items?passed/items:0).toFixed(5), run: scoredItems? +(passed/scoredItems).toFixed(5):null,
    tok: costs.length?tok:null, tpi: costItems? +(tok/costItems).toFixed(1):null,
    wall: costs.length? +wall.toFixed(1):null, wpi: costItems? +(wall/costItems).toFixed(3):null,
    tps: costs.length? (decode? +(timed.reduce((s,c)=>s+c.tokens,0)/decode).toFixed(2) : 0):null,
    mem: costs.length? +Math.max(...costs.map(c=>c.peakMemoryGb)).toFixed(2):null, hw:r.hardwareId };
  if (o.tok===null || !(o.mem>0) || !(o.tps>0)) missing.push(o.n + " mem="+o.mem+" tps="+o.tps+" tok="+o.tok);
  out.push(o);
}
require("fs").writeFileSync(path.join(W, "rows.json"), JSON.stringify(out));
console.error(JSON.stringify(ds.dataset), out.length, "rows; complete", out.filter(o=>o.ok).length, "hw", [...new Set(out.map(o=>o.hw))]);
console.error("missing/zero cost:", missing);
