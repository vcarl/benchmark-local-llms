import { createFileRoute, useParams } from "@tanstack/react-router";
import { DATA, normalizeRecord } from "../lib/data";
import { RunHeader } from "../components/RunHeader";
import { PromptView } from "../components/PromptView";
import { ScenarioView } from "../components/ScenarioView";

export const Route = createFileRoute("/run/$model/$name")({
  component: RunPage,
});

function RunPage() {
  const { model, name } = useParams({ from: "/run/$model/$name" });
  const decodedModel = decodeURIComponent(model);
  const matches = DATA.filter((d) => d.model === decodedModel && d.prompt_name === name);

  if (matches.length === 0) {
    return (
      <div className="run-not-found">
        <RunHeader rec={normalizeRecord({ model: decodedModel, prompt_name: name })} />
        <div style={{ padding: 16 }}>No run found for {decodedModel} / {name}.</div>
      </div>
    );
  }

  const rec = matches[matches.length - 1];

  return (
    <div className="run-page">
      <RunHeader rec={rec} />
      {rec.is_scenario ? <ScenarioView rec={rec} /> : <PromptView rec={rec} />}
    </div>
  );
}
