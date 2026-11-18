// Pure scoring core: no DOM. Inlined into the page; required by test.js.
const Core = (() => {
  // id, row key, direction (+1 higher is better), label, unit
  const F = [
    { id: "s", key: "s", dir: 1, label: "Score", short: "score", unit: "" },
    { id: "wall", key: "wpi", dir: -1, label: "Wall s / item", short: "wall", unit: "s" },
    { id: "tps", key: "tps", dir: 1, label: "Gen tok/s", short: "tps", unit: "tok/s" },
    { id: "tok", key: "tpi", dir: -1, label: "Tokens / item", short: "tokens", unit: "tok" },
    { id: "mem", key: "mem", dir: -1, label: "Peak mem GB", short: "mem", unit: "GB" },
  ];
  const EPS = 0.05; // floor for log-min-max goodness so a worst-in-pool factor never zeroes a product

  const val = (r, f, cfg) => (f.id === "s" ? (cfg.basis === "run" ? r.run : r.s) : r[f.key]);
  const median = (xs) => {
    const v = [...xs].sort((a, b) => a - b), m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
  // average ranks, 1..n ascending
  const ranks = (xs) => {
    const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const pearson = (a, b) => {
    const ma = mean(a), mb = mean(b);
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da === 0 || db === 0 ? 0 : n / Math.sqrt(da * db);
  };
  const spearman = (a, b) => pearson(ranks(a), ranks(b));

  // cost per item for the cost-based families
  const COSTS = {
    gbh: { label: "GB·hour", per: "GB·hour", f: (r) => (r.mem * r.wpi) / 3600, text: "peakMemoryGb × wallSecPerItem / 3600" },
    mtok: { label: "million tokens", per: "million tokens", f: (r) => r.tpi / 1e6, text: "tokensPerItem / 1e6" },
    min: { label: "minute", per: "minute", f: (r) => r.wpi / 60, text: "wallSecPerItem / 60" },
    tok: { label: "tokens / item", f: (r) => r.tpi, text: "tokensPerItem" },
    wall: { label: "wall s / item", f: (r) => r.wpi, text: "wallSecPerItem" },
    mem: { label: "peak memory", f: (r) => r.mem, text: "peakMemoryGb" },
    blend: { label: "custom blend", per: "blend unit", text: "" },
  };
  const blendCost = (r, b) => (r.tpi / 1000) ** b.tok * (r.wpi / 60) ** b.wall * r.mem ** b.mem;
  const costFn = (id, cfg) => (id === "blend" ? (r) => blendCost(r, cfg.cpc.blend) : COSTS[id].f);

  // goodness per factor over the pool; returns {g(row), ref}
  const normalizer = (pool, f, norm, cfg) => {
    const xs = pool.map((r) => val(r, f, cfg));
    if (norm === "pct") {
      const sorted = [...xs].sort((a, b) => a - b), n = xs.length;
      // mid-rank percentile in goodness order, in (0,1)
      const pct = (x) => {
        let lo = 0, eq = 0;
        for (const y of sorted) { if (y < x) lo++; else if (y === x) eq++; }
        const p = (lo + eq / 2) / n; // fraction of pool at or below x (mid-rank)
        return f.dir > 0 ? p : 1 - p;
      };
      return { g: (r) => pct(val(r, f, cfg)), ref: { n } };
    }
    if (norm === "logmm") {
      const lmin = Math.log(Math.min(...xs)), lmax = Math.log(Math.max(...xs));
      const g = (r) => {
        const u = lmax === lmin ? 1 : (Math.log(val(r, f, cfg)) - lmin) / (lmax - lmin);
        return EPS + (1 - EPS) * (f.dir > 0 ? u : 1 - u);
      };
      return { g, ref: { min: Math.exp(lmin), max: Math.exp(lmax) } };
    }
    const med = median(xs); // ratio to median
    return { g: (r) => (val(r, f, cfg) / med) ** f.dir, ref: { median: med } };
  };

  const compute = (rows, cfg) => {
    const inPool = (r) => r.tpi !== null && r.mem > 0 && r.tps > 0 && (cfg.pool === "all" || r.ok);
    const pool = rows.filter(inPool);
    const E = new Map(), note = new Map(), refs = {};
    for (const r of rows) if (!inPool(r)) note.set(r, r.tpi === null ? "no cost data" : "incomplete");
    const S = (r) => val(r, F[0], cfg);
    const fam = cfg.fam;
    if (fam === "geo") {
      const w = cfg.geo.w, norms = {};
      for (const f of F.slice(1)) if (w[f.id] > 0) { norms[f.id] = normalizer(pool, f, cfg.geo.norm, cfg); refs[f.id] = norms[f.id].ref; }
      for (const r of pool) {
        let e = S(r) ** w.s;
        for (const id in norms) e *= norms[id].g(r) ** w[id];
        E.set(r, e);
      }
    } else if (fam === "add") {
      const w = cfg.add.w, tot = F.reduce((a, f) => a + w[f.id], 0) || 1;
      for (const f of F) {
        if (w[f.id] <= 0) continue;
        let g;
        if (cfg.add.method === "pct") g = normalizer(pool, f, "pct", cfg).g;
        else {
          // z of score raw, z of log(cost); sign set so higher is better
          const tr = (r) => (f.id === "s" ? val(r, f, cfg) : Math.log(val(r, f, cfg)));
          const xs = pool.map(tr), m = mean(xs), s = sd(xs) || 1;
          g = (r) => (f.dir * (tr(r) - m)) / s;
          refs[f.id] = { mean: m, sd: s, log: f.id !== "s" };
        }
        for (const r of pool) E.set(r, (E.get(r) ?? 0) + (w[f.id] / tot) * g(r));
      }
      if (pool.length && !E.size) for (const r of pool) E.set(r, 0);
    } else if (fam === "cpc") {
      const c = costFn(cfg.cpc.unit, cfg);
      for (const r of pool) {
        if (S(r) < cfg.cpc.floor) { note.set(r, "below floor"); continue; }
        E.set(r, S(r) ** cfg.cpc.p / c(r));
      }
    } else if (fam === "gate") {
      const c = costFn(cfg.gate.cost, cfg), med = median(pool.map(c));
      refs.costMedian = med;
      for (const r of pool) {
        if (cfg.gate.mode === "gate") {
          if (S(r) < cfg.gate.T) { note.set(r, "below gate"); continue; }
          E.set(r, med / c(r));
        } else E.set(r, S(r) - cfg.gate.lambda * Math.log10(c(r) / med));
      }
    } else if (fam === "pareto") {
      const axes = F.filter((f) => cfg.pareto.axes[f.id]);
      const good = (r, f) => f.dir * val(r, f, cfg);
      for (const r of pool) {
        let n = 0;
        if (axes.length) for (const o of pool) {
          if (o === r) continue;
          let ge = true, gt = false;
          for (const f of axes) { const a = good(r, f), b = good(o, f); if (a < b) { ge = false; break; } if (a > b) gt = true; }
          if (ge && gt) n++;
        }
        E.set(r, n);
      }
    }
    const ranked = rows
      .map((r) => ({ r, e: E.has(r) ? E.get(r) : null, note: note.get(r) ?? null }))
      .sort((a, b) => (a.e === null) - (b.e === null) || (b.e ?? 0) - (a.e ?? 0) || S(b.r) - S(a.r) || a.r.n.localeCompare(b.r.n));
    let k = 0;
    for (const x of ranked) x.rank = x.e === null ? null : ++k;
    return { ranked, pool, refs, rankOf: new Map(ranked.map((x) => [x.r, x.rank])) };
  };

  // Spearman of each input with E, and Pratt shares from OLS of rank(E) on z-scored input ranks.
  const sensitivity = (res, cfg) => {
    const xs = res.ranked.filter((x) => x.e !== null);
    if (xs.length < 8) return null;
    const y = ranks(xs.map((x) => x.e));
    const cols = F.map((f) => ranks(xs.map((x) => val(x.r, f, cfg))));
    const rho = cols.map((c) => pearson(c, y));
    const z = (v) => { const m = mean(v), s = sd(v) || 1; return v.map((a) => (a - m) / s); };
    const Z = cols.map(z), Y = z(y), n = Y.length, k = Z.length;
    // normal equations (Z'Z) b = Z'Y, ridge 1e-9 for exact collinearity
    const A = Z.map((a, i) => Z.map((b, j) => a.reduce((s, v, t) => s + v * b[t], 0) / n + (i === j ? 1e-9 : 0)));
    const c = Z.map((a) => a.reduce((s, v, t) => s + v * Y[t], 0) / n);
    const M = A.map((row, i) => [...row, c[i]]);
    for (let i = 0; i < k; i++) {
      let p = i;
      for (let j = i + 1; j < k; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      [M[i], M[p]] = [M[p], M[i]];
      for (let j = 0; j < k; j++) if (j !== i) { const q = M[j][i] / M[i][i]; for (let t = i; t <= k; t++) M[j][t] -= q * M[i][t]; }
    }
    const beta = M.map((row, i) => row[k] / row[i]);
    const share = beta.map((b, i) => b * c[i]); // Pratt: beta_i * corr(x_i, y); sums to R²
    return { n, rho, share, r2: share.reduce((a, b) => a + b, 0) };
  };

  return { F, EPS, COSTS, val, median, ranks, spearman, compute, sensitivity, blendCost };
})();
if (typeof module !== "undefined") module.exports = Core;
