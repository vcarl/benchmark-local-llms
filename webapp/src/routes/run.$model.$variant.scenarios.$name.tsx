import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { DATA, normalizeRecord } from "../lib/data";
import { RunHeader } from "../components/RunHeader";
import { ScenarioView } from "../components/ScenarioView";
import {
  encodeVariant,
  parseVariant,
  scenariosForVariant,
  variantsForModel,
} from "../lib/run-summary";

export const Route = createFileRoute("/run/$model/$variant/scenarios/$name")({
  component: ScenarioDetailPage,
});

function ScenarioDetailPage() {
  const { model, variant, name } = useParams({
    from: "/run/$model/$variant/scenarios/$name",
  });
  const decodedModel = decodeURIComponent(model);
  const decodedName = decodeURIComponent(name);
  const variantKey = useMemo(
    () => parseVariant(decodeURIComponent(variant)),
    [variant],
  );
  const variants = useMemo(
    () => variantsForModel(DATA, decodedModel),
    [decodedModel],
  );
  const record = useMemo(() => {
    if (variantKey === null) return null;
    const matches = scenariosForVariant(DATA, decodedModel, variantKey).filter(
      (r) => r.scenario_name === decodedName,
    );
    if (matches.length === 0) return null;
    if (matches.length === 1) return normalizeRecord(matches[0]);
    const sorted = [...matches].sort((a, b) => {
      if (a.executed_at === b.executed_at) return 0;
      if (a.executed_at === "") return 1;
      if (b.executed_at === "") return -1;
      return a.executed_at < b.executed_at ? 1 : -1;
    });
    return normalizeRecord(sorted[0]);
  }, [decodedModel, variantKey, decodedName]);

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

  const variantSegment = encodeVariant(variantKey);

  return (
    <div>
      <RunHeader
        model={decodedModel}
        active={variantKey}
        variants={variants}
        activeTab="scenarios"
      />
      <div style={{ padding: "var(--space-5) var(--space-8)" }}>
        <Link
          to="/run/$model/$variant/scenarios"
          params={{ model: decodedModel, variant: variantSegment }}
          style={{ color: "var(--accent-300)", fontSize: "var(--fz-11)", textDecoration: "none" }}
        >
          ← All scenarios
        </Link>
        <h2 style={{ margin: "var(--space-2) 0 0", fontSize: "var(--fz-16)" }}>
          {decodedName}
        </h2>
      </div>
      {record === null ? (
        <div style={{ padding: 16, color: "var(--text-muted)" }}>
          Scenario not found.
        </div>
      ) : (
        <ScenarioView rec={record} />
      )}
    </div>
  );
}
