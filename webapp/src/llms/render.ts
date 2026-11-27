// The agent-facing markdown (llms.txt and the pages it links), rendered from
// the published snapshots alone so anyone can rebuild it byte for byte from
// `snapshots/`. Every number comes from the webapp's own model (scopeRow,
// sortRows, groupRows, stats.ts), so the markdown and the page agree.
// Layout and contents: docs/DEPLOY.md § llms.txt.
import { REPO_URL } from "../lib/constants";
import { formatCount } from "../lib/format";
import { groupRows, type Scope, type ScopedRow, scopeRow, sortRows } from "../lib/model";
import { type Cell, hardwareLabel, type Row, type RowsDataset } from "../lib/rows";
import { type IndexEntry, releaseHeading } from "../lib/snapshots";
import { inScope } from "../lib/view-state";

const ALL: Scope = { items: "all", challenges: [] };
const DOCS = `${REPO_URL}/blob/main/docs`;

const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
/** `98.2% ± 1.7` (the 95% CI half-width in points), or the bare rate without an interval. */
const rateCI = (s: ScopedRow) => (s.ci === null ? pct(s.score) : `${pct(s.score)} ± ${(s.ci * 100).toFixed(1)}`);
const scopeRate = (row: Row, items: "core" | "stretch") => {
  const s = scopeRow(row, { items, challenges: [] });
  return s.items === 0 ? "—" : pct(s.score);
};
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const page = (...blocks: (string | false)[]) => `${blocks.filter((b) => b !== false).join("\n\n")}\n`;

interface Ranked {
  s: ScopedRow;
  rank: number;
  tier: number | null;
  key: string;
}

/** Every in-scope row ranked by pass rate, one tier per config (the webapp's score sort, grouping `none`). */
const rank = (ds: RowsDataset): Ranked[] => {
  const sorted = sortRows(ds.rows.map((r) => scopeRow(r, ALL)).filter(inScope), "score");
  const groups = groupRows(sorted, "none", "score", ds.dataset.ranked);
  const keys = pageKeys(ds.rows);
  return groups.map((g, i) => {
    const s = g.rows[0] as ScopedRow;
    return { s, rank: i + 1, tier: g.tier?.n ?? null, key: keys.get(s.row.rowId) as string };
  });
};

/** A row's page name: its configId, with the config hash (then the machine) added where that repeats. */
const pageKeys = (rows: Row[]): Map<string, string> => {
  const count = (f: (r: Row) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
    return (r: Row) => m.get(f(r)) as number;
  };
  const byId = count((r) => r.configId);
  const byHash = count((r) => `${r.configId}-${r.configHash}`);
  const keys = new Map(
    rows.map((r) => [
      r.rowId,
      byId(r) === 1
        ? r.configId
        : `${r.configId}-${r.configHash.slice(0, 8)}${byHash(r) === 1 ? "" : `-${r.hardwareId.slice(0, 8)}`}`,
    ]),
  );
  if (new Set(keys.values()).size !== rows.length) throw new Error("llms: two rows share a page name");
  return keys;
};

const sumFailures = (cells: Cell[]): string => {
  const acc: Record<string, number> = {};
  for (const c of cells) for (const [k, n] of Object.entries(c.failureKinds)) acc[k] = (acc[k] ?? 0) + n;
  const list = Object.entries(acc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return list.length === 0 ? "none" : list.map(([k, n]) => `${k} ${n}`).join(", ");
};

export interface LlmsInput {
  /** `snapshots/index.json` entries, in file order. */
  index: IndexEntry[];
  /** Snapshots by digest: at least each dataset's current (first-listed) one. */
  snapshots: Map<string, RowsDataset>;
  /** The public site URL with a trailing slash; every link is absolute under it. */
  siteUrl: string;
  /** Where the snapshot JSON is served from (the Pages origin), with a trailing slash. */
  dataOrigin: string;
}

/** Site-relative path → file contents: llms.txt and llms/**.md. */
export const renderLlms = ({ index, snapshots, siteUrl, dataOrigin }: LlmsInput): Map<string, string> => {
  const out = new Map<string, string>();
  const url = (path: string) => `${siteUrl}${path}`;
  const current = index.filter((e, i) => index.findIndex((f) => f.dataset === e.dataset) === i);
  const datasets = current.flatMap((entry) => {
    const ds = snapshots.get(entry.digest);
    if (ds === undefined) throw new Error(`llms: snapshot ${entry.digest} (${entry.dataset}) not loaded`);
    return ds.dataset.ranked ? [{ entry, ds }] : [];
  });

  for (const { entry, ds } of datasets) {
    const dir = `llms/${ds.dataset.label}`;
    const ranked = rank(ds);
    const release = ds.dataset.release;
    const cite = `Snapshot \`${entry.digest}\`: ${ds.dataset.title}${ds.dataset.version === null ? "" : `, eval version ${ds.dataset.version}`}, executed ${entry.span ?? "on unknown dates"}.`;
    const links = {
      leaderboard: url(`${dir}/leaderboard.md`),
      config: (k: string) => url(`${dir}/configs/${k}.md`),
      challenge: (id: string) => url(`${dir}/challenges/${id}.md`),
      release: url(`${dir}/release.md`),
      errata: url(`${dir}/errata.md`),
      methodology: url("llms/methodology.md"),
    };
    const yaml = (id: string) => `${REPO_URL}/blob/main/releases/${release}/challenges/${id}.yaml`;
    const hasErrata = ds.dataset.errata.length > 0;

    out.set(
      `${dir}/leaderboard.md`,
      page(
        `# Leaderboard: ${ds.dataset.title}`,
        `> ${cite} ${ranked.length} configs over ${ds.challengeSet.length} challenges (${ds.challengeSet.reduce((n, c) => n + c.items, 0)} items).`,
        `Ranked by pass rate: items passed over every item of the set, a missing or failed item counting as a fail. ± is the 95% interval half-width in points (clustered by item family); a config whose paired interval against its tier's head excludes 0 starts a new tier, so configs within a tier are not resolved from each other. Core and stretch are the pass rates over each item scope. Each config is one model on one stack (runtime, quant, chat template, sampler settings) on one machine. Method: [methodology](${links.methodology}). Interactive view: ${siteUrl}`,
        table(
          ["Rank", "Tier", "Config", "Model", "Runtime", "Quant", "Pass rate ± 95% CI", "Core", "Stretch", "Challenges run"],
          ranked.map(({ s, rank, tier, key }) => [
            String(rank),
            tier === null ? "—" : String(tier),
            `[${s.row.configId}](${links.config(key)})${s.row.variantLabel === "" ? "" : ` (${s.row.variantLabel})`}`,
            s.row.modelName,
            s.row.runtime,
            s.row.quant ?? "—",
            rateCI(s),
            scopeRate(s.row, "core"),
            scopeRate(s.row, "stretch"),
            `${s.challenges[0]}/${s.challenges[1]}${s.complete ? "" : " (partial)"}`,
          ]),
        ),
        `Challenges: ${ds.challengeSet.map((c) => `[${c.id}](${links.challenge(c.id)})`).join(", ")}.`,
        `Release notes: ${links.release}${hasErrata ? ` · Errata: ${links.errata}` : ""}`,
      ),
    );

    for (const { s, rank: r, tier, key } of ranked) {
      const row = s.row;
      const hw = ds.hardware[row.hardwareId];
      const weights = row.variant.weights;
      const p = row.provenance;
      const cells = ds.challengeSet.flatMap((c) => {
        const cell = row.cells[c.id];
        return cell === undefined ? [] : [{ c, cell, cs: scopeRow(row, { items: "all", challenges: [c.id] }) }];
      });
      out.set(
        `${dir}/configs/${key}.md`,
        page(
          `# ${row.configId}: ${ds.dataset.title}`,
          `> ${row.modelName} on ${row.runtime}${row.quant === null ? "" : ` ${row.quant}`}, ${hardwareLabel(ds, row.hardwareId)}. Pass rate ${rateCI(s)} (95% CI), rank ${r} of ${ranked.length}${tier === null ? "" : `, tier ${tier}`}. ${cite}`,
          [
            "## Config",
            `- Model: ${row.modelName} (\`${row.artifact}\`)`,
            `- Runtime: ${row.runtime}; versions: ${p.runtimeVersions.join(", ") || "not recorded"}`,
            `- Quant: ${row.quant ?? "—"}; temperature ${row.temperature}`,
            ...(row.variantLabel === "" ? [] : [`- Variant (what sets it apart from the model's other rows): ${row.variantLabel}`]),
            `- Config hash: \`${row.configHash}\` (covers weights, chat template, system prompt and sampler settings)`,
            `- Weights digest: ${weights === undefined ? "not shown in the snapshot; the config hash covers it" : `\`${weights}\` (prefix)`}`,
            `- Hardware: ${hw === undefined ? row.hardwareId : `${hw.cpu} (${hw.cpuCores} CPU cores${hw.gpuCores === undefined ? "" : `, ${hw.gpuCores} GPU cores`}), ${hw.memoryGb} GB, ${hw.os}`} (\`${row.hardwareId}\`)`,
            `- Harness commits: ${p.gitShas.map((g) => `\`${g}\``).join(", ") || "not recorded"}`,
            `- Samples per item: ${p.samples === null ? "not recorded" : p.samples[0] === p.samples[1] ? p.samples[0] : `${p.samples[0]}–${p.samples[1]}`}; submitters: ${p.submitters.join(", ")}`,
            `- Executed: ${row.freshness.executedFrom ?? "?"} – ${row.freshness.executedTo ?? "?"}`,
          ].join("\n"),
          [
            "## Score",
            `- Pass rate: ${rateCI(s)} (${formatCount(s.passed)}/${s.items} items); core ${scopeRate(row, "core")}, stretch ${scopeRate(row, "stretch")}`,
            `- Rank ${r} of ${ranked.length}${tier === null ? "" : `, tier ${tier}`} on the [leaderboard](${links.leaderboard})`,
            `- Completeness: ${row.completeness.state}; challenges ${row.completeness.challenges.join("/")}, items ${row.completeness.items.join("/")}`,
            `- Failures (sample lines): ${sumFailures(cells.map((x) => x.cell))}`,
          ].join("\n"),
          s.cost === null
            ? "## Cost\n\nNo cost recorded."
            : [
                "## Cost",
                "Measured on the hardware above; wall time and speed describe this machine and runtime, not the model alone.",
                "",
                `- Generation tokens: ${s.cost.tokens.toFixed(0)} total, ${s.tokensPerItem?.toFixed(0) ?? "—"} per item`,
                `- Wall time: ${s.cost.wallSec.toFixed(0)} s total, ${s.wallPerItem?.toFixed(1) ?? "—"} s per item`,
                `- Generation speed: ${s.cost.genTps.toFixed(1)} tok/s`,
                `- Peak memory: ${s.cost.peakMemoryGb.toFixed(1)} GB`,
              ].join("\n"),
          "## Challenges",
          table(
            ["Challenge", "Status", "Passed / items", "Pass rate ± 95% CI", "Gen tokens", "Wall s", "tok/s", "Peak GB"],
            cells.map(({ c, cell, cs }) => [
              `[${c.id}](${links.challenge(c.id)})`,
              cell.status,
              `${formatCount(cell.passed)}/${cell.items}`,
              rateCI(cs),
              cell.cost === null ? "—" : cell.cost.tokens.toFixed(0),
              cell.cost === null ? "—" : cell.cost.wallSec.toFixed(0),
              cell.cost === null ? "—" : cell.cost.genTps.toFixed(1),
              cell.cost === null ? "—" : cell.cost.peakMemoryGb.toFixed(1),
            ]),
          ),
        ),
      );
    }

    for (const c of ds.challengeSet) {
      const rows = sortRows(
        ds.rows.map((r) => scopeRow(r, { items: "all", challenges: [c.id] })).filter((s) => s.items > 0),
        "score",
      );
      const keys = new Map(ranked.map((x) => [x.s.row.rowId, x.key]));
      const families = new Set(ds.rows.flatMap((r) => Object.keys(r.cells[c.id]?.families ?? {})));
      const scopes = Object.entries(c.scopes).map(([k, n]) => `${k} ${n}`);
      out.set(
        `${dir}/challenges/${c.id}.md`,
        page(
          `# Challenge ${c.id}: ${ds.dataset.title}`,
          `> ${c.items} items (${scopes.join(", ")}) in ${families.size} families; version ${c.version}, content hash \`${c.hash}\`. ${cite}`,
          `What it measures: the items themselves, with prompts, answer keys and scorers, are public in [${c.id}.yaml](${yaml(c.id)}). An item passes only at a score of exactly 1. Families group items that share a scenario; the interval below clusters on them.`,
          table(
            ["#", "Config", "Model", "Status", "Passed / items", "Pass rate ± 95% CI"],
            rows.map((s, i) => {
              const key = keys.get(s.row.rowId);
              const cell = s.row.cells[c.id] as Cell;
              return [
                String(i + 1),
                key === undefined ? s.row.configId : `[${s.row.configId}](${links.config(key)})`,
                s.row.modelName,
                cell.status,
                `${formatCount(cell.passed)}/${cell.items}`,
                rateCI(s),
              ];
            }),
          ),
          `Leaderboard: ${links.leaderboard}`,
        ),
      );
    }

    const rf = ds.releaseFile;
    const releaseEntries = index.filter((e) => e.release === release);
    out.set(
      `${dir}/release.md`,
      page(
        `# Release notes: ${releaseHeading(release)}`,
        [
          `- Release: \`${rf.release}\`${rf.label === undefined ? "" : ` (${rf.label})`}`,
          ...(rf.date === undefined ? [] : [`- Date: ${rf.date}`]),
          ...(rf.committedAt === undefined ? [] : [`- Committed: ${rf.committedAt}`]),
          ...(rf.closed === undefined ? [] : [`- Closed at eval version: ${rf.closed}`]),
          `- Commitment: ${rf.commitment === undefined ? (release === "draft" ? "none; the pre-release is uncommitted and its items may still change" : "none recorded") : `\`${rf.commitment}\``}`,
          `- Errata: ${hasErrata ? links.errata : "none"}`,
        ].join("\n"),
        `## ${ds.challengeSet.length} challenges, ${ds.challengeSet.reduce((n, c) => n + c.items, 0)} items`,
        ds.challengeSet.map((c) => `- [${c.id}](${links.challenge(c.id)}) v${c.version}: ${c.items} items`).join("\n"),
        "## Snapshots to cite",
        releaseEntries
          .map(
            (e) =>
              `- ${e.title}${e.evalVersion === null ? "" : `, eval ${e.evalVersion}`}${e === releaseEntries.find((x) => x.dataset === e.dataset) ? " (current)" : " (earlier)"}: \`${e.digest}\``,
          )
          .join("\n"),
        "## Verify",
        `\`./bench release verify ${release}\` (in the [harness repo](${REPO_URL})) re-derives every published prompt and scorer blob of the release and checks its challenge files against its release file. A snapshot digest identifies exactly the rows shown; rebuilding a snapshot also needs the execution bundles, which are not published.`,
      ),
    );

    if (hasErrata)
      out.set(
        `${dir}/errata.md`,
        page(
          `# Errata: ${releaseHeading(release)}`,
          `> A released item changes only through a published erratum; each states the recorded scores it changed. Process: [ERRATA-PROCESS.md](${DOCS}/ERRATA-PROCESS.md). ${cite}`,
          ...ds.dataset.errata.map((e) =>
            [
              `## ${e.id} (${e.date}): ${e.kind}`,
              "",
              e.description,
              "",
              `- Scores changed: ${e.scoresChanged.lines} recorded lines across ${e.scoresChanged.configs} configs${e.scorerChange ? "; scorer change" : ""}`,
              `- Release status: ${e.releaseStatus}${e.releasedIn === undefined ? "" : ` (released in ${e.releasedIn})`}`,
              `- Items: ${e.items.map((i) => `\`${i}\``).join(", ")}`,
            ].join("\n"),
          ),
        ),
      );
  }

  out.set(
    "llms/methodology.md",
    page(
      "# Methodology",
      "> How the pass rates, intervals and tiers on these pages are computed. The repository docs are authoritative; this page summarizes them.",
      `- **Items and scorers.** Each challenge is a set of items with a deterministic scorer: exact match on a marked answer, constraint checks, JSON or tool-call matching, or code run against tests in a sandbox. There is no LLM judge. Items and prompts are public. [SCORING.md](${DOCS}/SCORING.md)`,
      `- **Pass rule.** An item passes only at a score of exactly 1. Partial credit (including the 0.75 for a correct answer in the wrong format) is recorded for diagnosis but counts as a fail. Errors, timeouts and malformed output are failures and are never filtered out. A resampled item counts once, at the share of its samples that passed. [§ Per-execution score vs pass rate](${DOCS}/SCORING.md#per-execution-score-vs-pass-rate)`,
      `- **Coverage adjustment.** A config's pass rate is passed items over every item of the dataset's challenge set. A challenge it did not run, or ran only incompletely, keeps its items in the denominator with 0 passed, so running fewer challenges never raises a score. Only complete runs count; the newest complete run of each config × challenge is used and runs are never pooled. [§ The pass-rate formula](${DOCS}/SCORING.md#the-pass-rate-formula), [§ Report rows](${DOCS}/SCORING.md#report-rows)`,
      `- **Intervals.** Items sharing a scenario are correlated, so the sampling unit is the item family. The 95% interval is the cluster-robust (CR1) standard error of the pass rate over families, times the Student-t critical value with (families − 1) degrees of freedom; none is given below 5 families. [§ Uncertainty and statistical ties](${DOCS}/SCORING.md#uncertainty-and-statistical-ties)`,
      `- **Tiers.** Sorted by pass rate, a tier runs from its head until a config whose paired 95% interval against the head (over the families both scored) excludes 0; that config starts the next tier. Configs in one tier are not statistically resolved from each other.`,
      `- **Scope.** Items are core (short, practical work) or stretch (solver-backed multi-step reasoning); the core and stretch columns are the pass rate over each. [§ Scope](${DOCS}/SCORING.md#scope)`,
      `- **What a row is.** A row is one config (model weights, runtime, quant, chat template, system prompt, sampler settings) on one machine. Results describe a model on that stack, not the model in the abstract. Cost figures (tokens, wall time, speed, memory) come from that one machine and do not transfer to other hardware; the webapp's efficiency score is notional for the same reason and is not reproduced here.`,
      `- **Releases and errata.** A release is a frozen item set; the draft (pre-release) may still change. Released items change only through published errata that state the scores they changed. [ERRATA-PROCESS.md](${DOCS}/ERRATA-PROCESS.md), [ARCHITECTURE.md § Vocabulary](${DOCS}/ARCHITECTURE.md#vocabulary)`,
      `- **Provenance.** Every page cites the snapshot digest it was built from; the snapshots are published at ${dataOrigin}snapshots/ (\`index.json\` lists them) and these pages rebuild from them byte for byte. [ARCHIVE-FORMAT.md § Snapshots](${DOCS}/ARCHIVE-FORMAT.md#snapshots)`,
    ),
  );

  const machines = [...new Set(datasets.flatMap(({ ds }) => Object.keys(ds.hardware).map((id) => hardwareLabel(ds, id))))];
  const llms = page(
    "# Local LLM benchmark",
    `> Local language models benchmarked on one workstation (${machines.join("; ")}) on bounded, checkable text work: code, math and finance, logic, extraction, instruction constraints, tool calls. Every item has a deterministic scorer; there is no LLM judge. Each result describes a model on a stack (runtime, quant, chat template, sampler settings) on that machine, with a 95% interval.`,
    [
      "Notes:",
      "",
      "- Pages are markdown and quote snapshot digests; cite a digest with any number you reuse.",
      "- Pass rates count a missing or failed item as a fail (coverage adjustment). Configs within one tier are not statistically resolved from each other; prefer tiers over single-rank differences.",
      "- The pre-release (draft) set is newest and largest but may still change; the alpha challenge set is archival.",
      `- The same data, interactive, needs JavaScript: ${siteUrl}`,
    ].join("\n"),
    ...datasets.map(({ ds, entry }) => {
      const dir = `llms/${ds.dataset.label}`;
      return [
        `## ${ds.dataset.title}`,
        "",
        `- [Leaderboard](${url(`${dir}/leaderboard.md`)}): ${entry.rows} configs ranked by pass rate with 95% intervals and tiers; links to each config's page`,
        `- [Release notes](${url(`${dir}/release.md`)}): release facts, challenge list, snapshot digests`,
        ...(ds.dataset.errata.length === 0 ? [] : [`- [Errata](${url(`${dir}/errata.md`)}): ${ds.dataset.errata.length} errata with the scores each changed`]),
        ...ds.challengeSet.map((c) => `- [Challenge ${c.id}](${url(`${dir}/challenges/${c.id}.md`)}): ${c.items} items, per-config pass rates`),
      ].join("\n");
    }),
    ["## Methodology", "", `- [Methodology](${url("llms/methodology.md")}): pass rule, coverage adjustment, intervals, tiers`].join("\n"),
  );
  out.set("llms.txt", llms);
  return out;
};
