import { useRef, useEffect } from "react";
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
  gen_tps: number;
  mem: number;
}

export function ScatterPlot({ data }: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Aggregate: avg score, avg gen_tps, max peak_memory per (model, runtime)
    const agg: Record<
      string,
      {
        model: string;
        runtime: string;
        scores: number[];
        gen_tps: number[];
        mem: number[];
      }
    > = {};
    data.forEach((d) => {
      const key = d.model + "|" + d.runtime;
      if (!agg[key])
        agg[key] = {
          model: d.model,
          runtime: d.runtime,
          scores: [],
          gen_tps: [],
          mem: [],
        };
      agg[key].scores.push(d.score);
      if (d.generation_tps > 0) agg[key].gen_tps.push(d.generation_tps);
      if (d.peak_memory_gb > 0) agg[key].mem.push(d.peak_memory_gb);
    });

    const points: AggPoint[] = Object.values(agg)
      .map((a) => ({
        model: a.model,
        runtime: a.runtime,
        score: a.scores.reduce((s, v) => s + v, 0) / a.scores.length,
        gen_tps: a.gen_tps.length
          ? a.gen_tps.reduce((s, v) => s + v, 0) / a.gen_tps.length
          : 0,
        mem: a.mem.length ? Math.max(...a.mem) : 0,
      }))
      .filter((p) => p.gen_tps > 0);

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

    const xMax = Math.max(10, (d3.max(points, (d) => d.gen_tps) ?? 10) * 1.1);
    const x = d3.scaleLinear().domain([0, xMax]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const maxMem = d3.max(points, (d) => d.mem) || 20;
    const rScale = d3.scaleSqrt().domain([0, maxMem]).range([4, 18]);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5))
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
      .text("Generation t/s");
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
      .attr("cx", (d) => x(d.gen_tps))
      .attr("cy", (d) => y(d.score))
      .attr("r", (d) => rScale(d.mem || 4))
      .attr("fill", (d) => RUNTIME_COLORS[d.runtime] || "#9ca3af")
      .attr("opacity", 0.5)
      .attr("stroke", (d) => RUNTIME_COLORS[d.runtime] || "#9ca3af")
      .attr("stroke-width", 1)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("opacity", 0.9);
        tooltip
          .style("opacity", "1")
          .html(
            `${d.model} (${d.runtime})<br>${Math.round(d.score * 100)}% score, ${d.gen_tps.toFixed(1)} t/s${d.mem > 0 ? `, ${d.mem.toFixed(1)} GB` : ""}`,
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

    // Legend
    const leg = svg
      .append("g")
      .attr(
        "transform",
        `translate(${margin.left + innerW - 120},${margin.top + 4})`,
      );
    leg
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 4)
      .attr("fill", RUNTIME_COLORS.llamacpp)
      .attr("opacity", 0.6);
    leg
      .append("text")
      .attr("x", 8)
      .attr("y", 4)
      .style("font-size", "10px")
      .style("fill", "#6b7280")
      .text("llamacpp");
    leg
      .append("circle")
      .attr("cx", 62)
      .attr("cy", 0)
      .attr("r", 4)
      .attr("fill", RUNTIME_COLORS.mlx)
      .attr("opacity", 0.6);
    leg
      .append("text")
      .attr("x", 70)
      .attr("y", 4)
      .style("font-size", "10px")
      .style("fill", "#6b7280")
      .text("mlx");
    return () => {
      svg.selectAll("*").remove();
    };
  }, [data]);

  return (
    <div className="chart-card">
      <h3>Score vs Speed</h3>
      <div className="chart-subtitle">
        Dot size = peak memory. Hover for details.
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
