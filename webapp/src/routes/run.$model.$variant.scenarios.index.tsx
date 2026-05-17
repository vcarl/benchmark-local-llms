import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { DATA, type ScenarioBenchmarkResult } from "../lib/data";
import { RunHeader } from "../components/RunHeader";
import { ScenarioList } from "../components/ScenarioList";
import {
  encodeVariant,
  parseVariant,
  scenariosForVariant,
  variantsForModel,
} from "../lib/run-summary";

export const Route = createFileRoute("/run/$model/$variant/scenarios/")({
  component: ScenariosPage,
});

const orderRecsByExecutedAt = (
  recs: ScenarioBenchmarkResult[],
): ScenarioBenchmarkResult[] => {
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

function ScenariosPage() {
  const { model, variant } = useParams({
    from: "/run/$model/$variant/scenarios/",
  });
  const decodedModel = decodeURIComponent(model);
  const variantKey = useMemo(
    () => parseVariant(decodeURIComponent(variant)),
    [variant],
  );
  const variants = useMemo(
    () => variantsForModel(DATA, decodedModel),
    [decodedModel],
  );
  const orderedScenarios = useMemo(() => {
    if (variantKey === null) return [];
    const matches = scenariosForVariant(DATA, decodedModel, variantKey);
    return orderRecsByExecutedAt(matches);
  }, [decodedModel, variantKey]);

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
        activeTab="scenarios"
      />
      <ScenarioList
        model={decodedModel}
        variantKey={encodeVariant(variantKey)}
        scenarios={orderedScenarios}
      />
    </div>
  );
}
