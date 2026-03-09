import * as d3 from "d3";
import { deleteConfiguration, getAllConfigurations, getCurrentSessionId } from "./config-store";
import { renderStarGraph } from "./star-graph";

const HEIGHT = 220;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

function truncate3(value) {
  return Math.trunc(value * 1000) / 1000;
}

export async function renderRateoChart() {
  const container = document.getElementById("rateo-chart");
  if (!container) {
    return;
  }
  const getTarget = () => window.__starTarget || null;

  const sessionId = getCurrentSessionId();
  const all = await getAllConfigurations();
  const points = all
    .filter((item) => item.sessionId === sessionId)
    .map((item) => ({
      id: item.id,
      timestep: Number(item.timestep),
      rateo: truncate3(Number(item.rateo)),
      weights: item.weights || {},
    }))
    .filter((item) => Number.isFinite(item.timestep) && Number.isFinite(item.rateo))
    .sort((a, b) => a.timestep - b.timestep);

  if (!points.length) {
    container.textContent = "No configurations saved yet.";
    return;
  }

  const timesteps = points.map((p) => p.timestep);
  const availableWidth = container.clientWidth || 900;
  const availableHeight = container.clientHeight || HEIGHT;
  const svgWidth = availableWidth;
  const svgHeight = availableHeight;

  const minRateo = d3.min(points, (p) => p.rateo) ?? 0;
  const maxRateo = d3.max(points, (p) => p.rateo) ?? 1;
  const yMin = Number.isFinite(minRateo) ? minRateo : 0;
  const yMax = Number.isFinite(maxRateo) ? maxRateo : 1;

  const xScale = d3
    .scalePoint()
    .domain(timesteps)
    .range([MARGIN.left, svgWidth - MARGIN.right])
    .padding(0.4);

  const yScale = d3
    .scaleLinear()
    .domain([yMin, yMax])
    .nice()
    .range([svgHeight - MARGIN.bottom, MARGIN.top]);

  container.innerHTML = "";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`);

  const xAxis = d3.axisBottom(xScale).tickValues(timesteps);
  const yAxis = d3.axisLeft(yScale).ticks(4).tickFormat((d) => truncate3(Number(d)).toFixed(3));

  svg
    .append("g")
    .attr("transform", `translate(0,${svgHeight - MARGIN.bottom})`)
    .call(xAxis)
    .call((g) => g.selectAll("text").attr("fill", "#425466"))
    .call((g) => g.selectAll("line").attr("stroke", "#6b7a90"))
    .call((g) => g.selectAll("path").attr("stroke", "#6b7a90"));

  svg
    .append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(yAxis)
    .call((g) => g.selectAll("text").attr("fill", "#425466"))
    .call((g) => g.selectAll("line").attr("stroke", "#6b7a90"))
    .call((g) => g.selectAll("path").attr("stroke", "#6b7a90"));

  svg
    .append("text")
    .attr("x", svgWidth / 2)
    .attr("y", svgHeight - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#425466")
    .text("timestep");

  svg
    .append("text")
    .attr("x", 14)
    .attr("y", svgHeight / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#425466")
    .attr("transform", `rotate(-90 14 ${svgHeight / 2})`)
    .text("rateo");

  const line = d3
    .line()
    .x((d) => xScale(d.timestep))
    .y((d) => yScale(d.rateo));

  svg
    .append("path")
    .datum(points)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#1f6feb")
    .attr("stroke-width", 2);

  const pointGroup = svg
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => xScale(d.timestep))
    .attr("cy", (d) => yScale(d.rateo))
    .attr("r", 3.5)
    .attr("fill", "#1f6feb")
    .attr("opacity", 0.7)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      const targetId = getTarget();
      window.__lineSelectedId = d.id;
      window.__lineSelectedTimestep = d.timestep;
      window.__starSelections = window.__starSelections || {};
      window.__starSelectionsId = window.__starSelectionsId || {};
      if (targetId) {
        window.__starSelections[targetId] = d.timestep;
        window.__starSelectionsId[targetId] = d.id;
        renderStarGraph(d.weights, targetId, d.rateo);
      }
      applyPointStyles();
    });

  const applyPointStyles = () => {
    const selections = window.__starSelections || {};
    const left = selections["star-graph-1"];
    const right = selections["star-graph-2"];
    const hasTarget = Boolean(getTarget());
    const lineSel = window.__lineSelectedTimestep;
    pointGroup
      .attr("r", (d) =>
        d.timestep === left || d.timestep === right || (!hasTarget && d.timestep === lineSel) ? 5 : 3.5
      )
      .attr("opacity", (d) =>
        d.timestep === left || d.timestep === right || (!hasTarget && d.timestep === lineSel) ? 1 : 0.7
      )
      .attr("fill", (d) => {
        if (!hasTarget && d.timestep === lineSel) {
          if (d.timestep === left && d.timestep === right) return "#f59e0b";
          if (d.timestep === left) return "#22c55e";
          if (d.timestep === right) return "#ef4444";
          return "#1f6feb";
        }
        if (d.timestep === left && d.timestep === right) return "#f59e0b";
        if (d.timestep === left) return "#22c55e";
        if (d.timestep === right) return "#ef4444";
        return "#1f6feb";
      })
      .attr("stroke", (d) => (!hasTarget && d.timestep === lineSel ? "#111827" : "none"))
      .attr("stroke-width", (d) => (!hasTarget && d.timestep === lineSel ? 2 : 0));
  };

  applyPointStyles();

  const selectedIds = new Set(points.map((p) => p.id));
  if (window.__lineSelectedId && !selectedIds.has(window.__lineSelectedId)) {
    window.__lineSelectedId = null;
    window.__lineSelectedTimestep = null;
  }

  const deleteBtn = document.getElementById("delete-config-btn");
  if (deleteBtn && !deleteBtn._deleteBound) {
    deleteBtn.addEventListener("click", async () => {
      const selectedId = window.__lineSelectedId;
      const selectedTimestep = window.__lineSelectedTimestep;
      if (!selectedId) {
        return;
      }
      try {
        await deleteConfiguration(selectedId);
        if (selectedTimestep !== null && selectedTimestep !== undefined) {
          if (window.__starSelections?.["star-graph-1"] === selectedTimestep) {
            delete window.__starSelections["star-graph-1"];
            if (window.__starSelectionsId) delete window.__starSelectionsId["star-graph-1"];
            renderStarGraph(null, "star-graph-1");
          }
          if (window.__starSelections?.["star-graph-2"] === selectedTimestep) {
            delete window.__starSelections["star-graph-2"];
            if (window.__starSelectionsId) delete window.__starSelectionsId["star-graph-2"];
            renderStarGraph(null, "star-graph-2");
          }
        }
        window.__lineSelectedId = null;
        window.__lineSelectedTimestep = null;
        renderRateoChart();
      } catch (error) {
        console.error("Delete failed", error);
      }
    });
    deleteBtn._deleteBound = true;
  }

  if (!container._rateoResizeObserver) {
    const observer = new ResizeObserver(() => {
      renderRateoChart();
    });
    observer.observe(container);
    container._rateoResizeObserver = observer;
  }
}
