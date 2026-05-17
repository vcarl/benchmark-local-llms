import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { DATA, type PromptBenchmarkResult } from "../lib/data";
import { RunHeader } from "../components/RunHeader";
import { PromptView } from "../components/PromptView";
import { parseExpanded, encodeExpanded } from "../lib/expanded-state";
import {
  encodeVariant,
  parseVariant,
  recordsForVariant,
  variantsForModel,
} from "../lib/run-summary";

export const Route = createFileRoute("/run/$model/$variant/")({
  component: RunPage,
});

function rowDomId(name: string): string {
  // CSS-safe id derived from prompt_name. Don't put untrusted user input in
  // a getElementById call without normalizing.
  return `prompt-row-${encodeURIComponent(name)}`;
}

// Order prompts within a variant by executed_at ascending; tie-break by
// the index in DATA so the order is stable across renders.
const orderRecsByExecutedAt = (
  recs: PromptBenchmarkResult[],
): PromptBenchmarkResult[] => {
  const indexed = recs.map((r, i) => ({ rec: r, i }));
  indexed.sort((a, b) => {
    const ta = a.rec.executed_at;
    const tb = b.rec.executed_at;
    if (ta !== tb) {
      if (ta === "") return 1;
      if (tb === "") return -1;
      return ta < tb ? -1 : 1;
    }
    return a.i - b.i;
  });
  return indexed.map(({ rec }) => rec);
};

function RunPage() {
  const { model, variant } = useParams({ from: "/run/$model/$variant/" });
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();

  const decodedModel = decodeURIComponent(model);
  const variantKey = useMemo(() => parseVariant(decodeURIComponent(variant)), [variant]);

  const variants = useMemo(() => variantsForModel(DATA, decodedModel), [decodedModel]);

  const orderedRecs = useMemo<PromptBenchmarkResult[]>(() => {
    if (variantKey === null) return [];
    const matches = recordsForVariant(DATA, decodedModel, variantKey).filter(
      (r): r is PromptBenchmarkResult => r.kind === "prompt",
    );
    return orderRecsByExecutedAt(matches);
  }, [decodedModel, variantKey]);

  const orderedNames = useMemo(
    () => orderedRecs.map((r) => r.prompt_name),
    [orderedRecs],
  );

  const expandedSet = useMemo(
    () => parseExpanded(search.expanded, orderedNames),
    [search.expanded, orderedNames],
  );

  const setExpanded = (next: string) => {
    if (variantKey === null) return;
    navigate({
      to: "/run/$model/$variant",
      params: { model: decodedModel, variant: encodeVariant(variantKey) },
      search: (s) => ({
        ...(s as Record<string, unknown>),
        expanded: next,
      }) as never,
    });
  };

  const allExpanded =
    orderedNames.length > 0 && expandedSet.size === orderedNames.length;

  const handleToggleAll = () => setExpanded(allExpanded ? "" : "full");

  const handleToggleRow = (name: string) => {
    const nextSet = new Set(expandedSet);
    if (nextSet.has(name)) nextSet.delete(name);
    else nextSet.add(name);
    setExpanded(encodeExpanded(nextSet, orderedNames));
  };

  // If `?expanded=<name>` lands here from a deep-link, scroll that row into
  // view on first paint. Triggered when the expanded query string changes
  // shape — not on every toggle, since scrolling on toggle is jarring.
  useEffect(() => {
    if (search.expanded === undefined || search.expanded === "" || search.expanded === "full") {
      return;
    }
    const first = search.expanded.split(",")[0];
    if (!first) return;
    const el = document.getElementById(rowDomId(first));
    if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
  }, [search.expanded]);

  if (variantKey === null) {
    return (
      <div>
        <div style={{ padding: 16 }}>
          Invalid variant in URL: {decodeURIComponent(variant)}
        </div>
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <div>
        <div style={{ padding: 16 }}>No runs found for {decodedModel}.</div>
      </div>
    );
  }

  return (
    <div>
      <RunHeader
        model={decodedModel}
        active={variantKey}
        variants={variants}
        allExpanded={allExpanded}
        onToggleAll={handleToggleAll}
        activeTab="prompts"
      />
      {orderedRecs.map((rec) => (
        <PromptView
          key={rec.prompt_name}
          rec={rec}
          expanded={expandedSet.has(rec.prompt_name)}
          onToggle={() => handleToggleRow(rec.prompt_name)}
          isFocused={false}
          rowId={rowDomId(rec.prompt_name)}
        />
      ))}
      {orderedRecs.length === 0 && (
        <div style={{ padding: 16, color: "var(--text-muted)" }}>
          No prompt runs in this variant. Use the header above to switch.
        </div>
      )}
    </div>
  );
}
