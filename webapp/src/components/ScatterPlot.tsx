import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import type { BenchmarkResult } from "../lib/data";
import { RUNTIME_COLORS } from "../lib/colors";

interface ScatterPlotProps {
  data: BenchmarkResult[];
}

interface AggPoint {
  model: string;
  runtime: string;
  score: number;
  tokens: number;
  mem: number;
  tier: string;
  category: string;
  family: string;
}

function modelFamily(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("qwen")) return "Qwen";
  if (lower.includes("mistral")) return "Mistral";
  if (lower.includes("gemma")) return "Gemma";
  if (lower.includes("llama")) return "Llama";
  if (lower.includes("phi")) return "Phi";
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("devstral")) return "Mistral";
  if (lower.includes("gpt")) return "GPT";
  return name.split(" ")[0] || "Other";
}

function topKey(counts: Record<string, number>): string {
  let best = "";
  let max = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

type GroupByOption = "runtime" | "tier" | "category" | "family";

export function ScatterPlot({ data }: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [groupBy, setGroupBy] = useState<GroupByOption>("runtime");

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Aggregate per (model, runtime)
    const agg: Record<
      string,
      {
        model: string;
        runtime: string;
        scores: number[];
        tokens: number;
        mem: number[];
        tiers: Record<string, number>;
        cats: Record<string, number>;
      }
    > = {};
    data.forEach((d) => {
      const key = d.model + "|" + d.runtime;
      if (!agg[key])
        agg[key] = {
          model: d.model,
          runtime: d.runtime,
          scores: [],
          tokens: 0,
          mem: [],
          tiers: {},
          cats: {},
        };
      agg[key].scores.push(d.score);
      agg[key].tokens +=
        (d.prompt_tokens || 0) + (d.generation_tokens || 0);
      if (d.peak_memory_gb > 0) agg[key].mem.push(d.peak_memory_gb);
      const tierKey = "Tier " + d.tier;
      agg[key].tiers[tierKey] = (agg[key].tiers[tierKey] || 0) + 1;
      agg[key].cats[d.category] = (agg[key].cats[d.category] || 0) + 1;
    });

    const points: AggPoint[] = Object.values(agg)
      .map((a) => ({
        model: a.model,
        runtime: a.runtime,
        score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
        tokens: a.tokens,
        mem: a.mem.length ? Math.max(...a.mem) : 0,
        tier: topKey(a.tiers),
        category: topKey(a.cats),
        family: modelFamily(a.model),
      }))
      .filter((p) => p.tokens > 0);

    // Use max memory across runtimes for same model
    const memByModel: Record<string, number> = {};
    points.forEach((p) => {
      if (p.mem > 0)
        memByModel[p.model] = Math.max(memByModel[p.model] || 0, p.mem);
    });
    points.forEach((p) => {
      if (memByModel[p.model]) p.mem = memByModel[p.model];
    });

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const width = 420;
    const height = 300;
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Log-scale X axis for total tokens
    const tokenValues = points.map((d) => d.tokens);
    const xMin = Math.max(1, (d3.min(tokenValues) ?? 1) * 0.8);
    const xMax = (d3.max(tokenValues) ?? 10) * 1.2;
    const x = d3.scaleLog().domain([xMin, xMax]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const maxMem = d3.max(points, (d) => d.mem) || 20;
    const rScale = d3.scaleSqrt().domain([0, maxMem]).range([4, 18]);

    // Color logic based on groupBy
    const colorScheme = d3.schemeTableau10;
    function getGroupKey(d: AggPoint): string {
      switch (groupBy) {
        case "runtime":
          return d.runtime;
        case "tier":
          return d.tier;
        case "category":
          return d.category;
        case "family":
          return d.family;
      }
    }

    const groupKeys = [...new Set(points.map(getGroupKey))].sort();
    const groupColorScale = d3
      .scaleOrdinal<string>()
      .domain(groupKeys)
      .range(colorScheme);

    function getColor(d: AggPoint): string {
      if (groupBy === "runtime") {
        return RUNTIME_COLORS[d.runtime] || "#9ca3af";
      }
      return groupColorScale(getGroupKey(d));
    }

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3.axisBottom(x).ticks(5, "~s"),
      )
      .selectAll("text")
      .style("font-size", "10px");
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((d) => Math.round(Number(d) * 100) + "%"),
      )
      .selectAll("text")
      .style("font-size", "10px");

    // Grid lines
    g.append("g")
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 0.5);

    // Axis labels
    svg
      .append("text")
      .attr("x", margin.left + innerW / 2)
      .attr("y", height - 2)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("fill", "#6b7280")
      .text("Total Tokens");
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + innerH / 2))
      .attr("y", 12)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("fill", "#6b7280")
      .text("Avg Score");

    const tooltip = d3.select(tooltipRef.current);

    // Dots
    g.selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d) => x(d.tokens))
      .attr("cy", (d) => y(d.score))
      .attr("r", (d) => rScale(d.mem || 4))
      .attr("fill", (d) => getColor(d))
      .attr("opacity", 0.5)
      .attr("stroke", (d) => getColor(d))
      .attr("stroke-width", 1)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 0.9);
        tooltip
          .style("opacity", "1")
          .html(
            `${d.model} (${d.runtime})<br>${Math.round(d.score * 100)}% score, ${d.tokens.toLocaleString()} tokens${d.mem > 0 ? `, ${d.mem.toFixed(1)} GB` : ""}`,
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mouseleave", function () {
        d3.select(this).attr("opacity", 0.5);
        tooltip.style("opacity", "0");
      });

    // Legend - top-left inside chart
    const leg = svg
      .append("g")
      .attr(
        "transform",
        `translate(${margin.left + 8},${margin.top + 4})`,
      );
    groupKeys.forEach((key, i) => {
      const color =
        groupBy === "runtime"
          ? RUNTIME_COLORS[key] || "#9ca3af"
          : groupColorScale(key);
      leg
        .append("circle")
        .attr("cx", 0)
        .attr("cy", i * 14)
        .attr("r", 4)
        .attr("fill", color)
        .attr("opacity", 0.6);
      leg
        .append("text")
        .attr("x", 8)
        .attr("y", i * 14 + 4)
        .style("font-size", "10px")
        .style("fill", "#6b7280")
        .text(key);
    });

    return () => {
      svg.selectAll("*").remove();
    };
  }, [data, groupBy]);

  return (
    <div className="chart-card">
      <h3>Score vs Total Tokens</h3>
      <div
        className="chart-subtitle"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Dot size = peak memory. Hover for details.</span>
        <label style={{ fontSize: "11px", color: "#6b7280" }}>
          Color by:{" "}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
            style={{
              fontSize: "11px",
              color: "#6b7280",
              background: "transparent",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              padding: "1px 4px",
            }}
          >
            <option value="runtime">Runtime</option>
            <option value="tier">Tier</option>
            <option value="category">Category</option>
            <option value="family">Model family</option>
          </select>
        </label>
      </div>
      <svg ref={svgRef} />
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          background: "#1f2937",
          color: "#fff",
          padding: "6px 10px",
          borderRadius: "6px",
          fontSize: "11px",
          pointerEvents: "none",
          opacity: 0,
          whiteSpace: "nowrap",
          zIndex: 1000,
        }}
      />
    </div>
  );
}
