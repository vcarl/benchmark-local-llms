const assert = require("assert"); const C = require("./core.cjs"); const rows = require("./work/rows.json");
const W0 = { s: 1, wall: 0, tps: 0, tok: 0, mem: 0 };
const base = { basis: "s", pool: "all", geo: { norm: "med", w: { ...W0 } }, add: { method: "z", w: { ...W0 } },
  cpc: { unit: "gbh", p: 1, floor: 0, blend: { tok: 1, wall: 0, mem: 0 } }, gate: { mode: "gate", cost: "tok", T: 0.6, lambda: 0.1 }, pareto: { axes: { s: true, tok: true } } };
const cfg = (o) => ({ ...base, ...o });
const close = (a, b, m) => assert(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), m + `: ${a} vs ${b}`);
// 1. geo, ratio-to-median, tokens^0.25 == current formula up to a constant -> identical rank
const cur = cfg({ fam: "geo", geo: { norm: "med", w: { ...W0, tok: 0.25 } } }); const res = C.compute(rows, cur);
const withCost = rows.filter((r) => r.tpi !== null);
const curE = (r) => r.s * (1000 / r.tpi) ** 0.25;
const byCur = [...withCost].sort((a, b) => curE(b) - curE(a) || b.s - a.s);
assert.deepStrictEqual(res.ranked.filter((x) => x.e !== null).map((x) => x.r.n), byCur.map((r) => r.n), "current-formula rank");
const med = C.median(withCost.map((r) => r.tpi)); const r0 = rows[0];
close(res.ranked.find((x) => x.r === r0).e, r0.s * (med / r0.tpi) ** 0.25, "geo hand value");
assert.strictEqual(res.ranked.at(-1).e, null); assert.strictEqual(res.ranked.at(-1).note, "no cost data");
// 2. cpc GB·hour hand value
const c2 = C.compute(rows, cfg({ fam: "cpc" })); close(c2.ranked.find((x) => x.r === r0).e, r0.s / ((r0.mem * r0.wpi) / 3600), "cpc");
// 3. logmm: best-in-pool memory gets 1, worst gets EPS
const c3 = C.compute(rows, cfg({ fam: "geo", geo: { norm: "logmm", w: { ...W0, s: 0, mem: 1 } } }));
const es = c3.ranked.filter((x) => x.e !== null).map((x) => x.e); close(Math.max(...es), 1, "logmm max"); close(Math.min(...es), C.EPS, "logmm min");
// 4. pct: score-only additive pct equals score rank
const c4 = C.compute(rows, cfg({ fam: "add", add: { method: "pct", w: { ...W0 } } }));
assert.strictEqual(C.spearman(c4.ranked.filter((x) => x.e !== null).map((x) => x.e), c4.ranked.filter((x) => x.e !== null).map((x) => x.r.s)), 1);
// 5. pareto on score only: count == rows strictly below
const c5 = C.compute(rows, cfg({ fam: "pareto", pareto: { axes: { s: true } } }));
const top = c5.ranked[0]; assert.strictEqual(top.e, withCost.filter((r) => r.s < top.r.s).length);
// 6. gate & penalty
const c6 = C.compute(rows, cfg({ fam: "gate" })); assert(c6.ranked.every((x) => x.e === null || x.r.s >= 0.6));
const c7 = C.compute(rows, cfg({ fam: "gate", gate: { mode: "penalty", cost: "tok", T: 0, lambda: 0.1 } }));
close(c7.ranked.find((x) => x.r === r0).e, r0.s - 0.1 * Math.log10(r0.tpi / med), "penalty");
// 7. sensitivity: score-only E -> rho(score)=1, R² ~ 1; complete pool
const s = C.sensitivity(C.compute(rows, cfg({ fam: "geo", geo: { norm: "med", w: { ...W0 } } })), base);
close(s.rho[0], 1, "rho"); assert(Math.abs(s.r2 - 1) < 1e-6, "r2 " + s.r2);
assert.strictEqual(C.compute(rows, cfg({ fam: "cpc", pool: "complete" })).pool.length, 25);
console.log("ok; current-formula sensitivity", JSON.stringify(C.sensitivity(res, cur)));
