import * as d3 from "d3";
import { getCurrentContext } from "./app-context";
import {
  assignConfigurationToStar,
  clearAssignmentsIfMissing,
  clearAssignedConfiguration,
  clearInvalidAssignments,
  clearSelectionIfMissing,
  getAssignedConfiguration,
  getAssignedTimestep,
  getLineSelectionId,
  getStarTarget,
  setLineSelection,
} from "./config-selection";
import { deleteConfiguration, getConfigurationsForContext } from "./config-store";
import { renderStarGraph } from "./star-graph";

const HEIGHT = 220;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

function truncate3(value) {
  return Math.trunc(value * 1000) / 1000;
}

function getDeleteButton() {
  return document.getElementById("delete-config-btn");
}

function refreshStarGraphs() {
  const left = getAssignedConfiguration("star-graph-1");
  const right = getAssignedConfiguration("star-graph-2");
  renderStarGraph(left?.weights || null, "star-graph-1", left?.rateo ?? null);
  renderStarGraph(right?.weights || null, "star-graph-2", right?.rateo ?? null);
}

export async function renderRateoChart() {
  const container = document.getElementById("rateo-chart");
  if (!container) {
    return;
  }

  const context = getCurrentContext();
  let points = [];

  try {
    points = (await getConfigurationsForContext(context)).map((item) => ({
      ...item,
      rateo: truncate3(Number(item.rateo)),
      timestep: Number(item.timestep),
    }));
  } catch (error) {
    container.textContent = `Unable to load configurations: ${error.message}`;
    return;
  }

  clearInvalidAssignments(context);
  const validIds = new Set(points.map((point) => point.id));
  clearSelectionIfMissing(validIds);
  clearAssignmentsIfMissing(validIds);

  if (!points.length) {
    container.textContent = "No configurations saved yet.";
    refreshStarGraphs();
    return;
  }

  const timesteps = points.map((point) => point.timestep);
  const availableWidth = container.clientWidth || 900;
  const availableHeight = container.clientHeight || HEIGHT;
  const svgWidth = availableWidth;
  const svgHeight = availableHeight;

  const minRateo = d3.min(points, (point) => point.rateo) ?? 0;
  const maxRateo = d3.max(points, (point) => point.rateo) ?? 1;
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
  const yAxis = d3.axisLeft(yScale).ticks(4).tickFormat((value) => truncate3(Number(value)).toFixed(3));

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
    .x((point) => xScale(point.timestep))
    .y((point) => yScale(point.rateo));

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
    .attr("cx", (point) => xScale(point.timestep))
    .attr("cy", (point) => yScale(point.rateo))
    .attr("r", 3.5)
    .attr("fill", "#1f6feb")
    .attr("opacity", 0.7)
    .style("cursor", "pointer")
    .on("click", (event, point) => {
      const targetId = getStarTarget();
      setLineSelection(point);
      if (targetId) {
        assignConfigurationToStar(targetId, point);
        renderStarGraph(point.weights, targetId, point.rateo);
      }
      applyPointStyles();
    });

  const applyPointStyles = () => {
    const left = getAssignedTimestep("star-graph-1");
    const right = getAssignedTimestep("star-graph-2");
    const lineSelectionId = getLineSelectionId();
    pointGroup
      .attr("r", (point) => (point.timestep === left || point.timestep === right || point.id === lineSelectionId ? 5 : 3.5))
      .attr("opacity", (point) =>
        point.timestep === left || point.timestep === right || point.id === lineSelectionId ? 1 : 0.7
      )
      .attr("fill", (point) => {
        if (point.timestep === left && point.timestep === right) return "#f59e0b";
        if (point.timestep === left) return "#22c55e";
        if (point.timestep === right) return "#ef4444";
        return "#1f6feb";
      })
      .attr("stroke", (point) => (point.id === lineSelectionId ? "#111827" : "none"))
      .attr("stroke-width", (point) => (point.id === lineSelectionId ? 2 : 0));
  };

  applyPointStyles();
  refreshStarGraphs();

  const deleteBtn = getDeleteButton();
  if (deleteBtn && deleteBtn.dataset.bound !== "true") {
    deleteBtn.addEventListener("click", async () => {
      const selectedId = getLineSelectionId();
      if (!selectedId) {
        return;
      }

      try {
        await deleteConfiguration(selectedId);
        if (getAssignedConfiguration("star-graph-1")?.id === selectedId) {
          clearAssignedConfiguration("star-graph-1");
        }
        if (getAssignedConfiguration("star-graph-2")?.id === selectedId) {
          clearAssignedConfiguration("star-graph-2");
        }
        setLineSelection(null);
        await renderRateoChart();
      } catch (error) {
        console.error("Delete failed", error);
      }
    });
    deleteBtn.dataset.bound = "true";
  }

  if (!container._rateoResizeObserver) {
    const observer = new ResizeObserver(() => {
      renderRateoChart();
    });
    observer.observe(container);
    container._rateoResizeObserver = observer;
  }
}
