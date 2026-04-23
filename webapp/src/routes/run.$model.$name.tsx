import { createFileRoute, useParams } from "@tanstack/react-router";
import { DATA } from "../lib/data-dev";
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
        <RunHeader rec={{
          model: decodedModel,
          runtime: "",
          quant: "",
          prompt_name: name,
          category: "",
          tier: 0,
          temperature: 0,
          tags: [],
          is_scenario: false,
          score: 0,
          score_details: "",
          prompt_tokens: 0,
          generation_tokens: 0,
          prompt_tps: 0,
          generation_tps: 0,
          wall_time_sec: 0,
          peak_memory_gb: 0,
          output: "",
          prompt_text: "",
          scenario_name: null,
          termination_reason: null,
          tool_call_count: null,
          final_player_stats: null,
          events: null,
        }} />
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
