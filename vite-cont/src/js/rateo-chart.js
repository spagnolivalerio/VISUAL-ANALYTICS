import * as d3 from "d3";
import { getCurrentContext } from "./app-context";
import {
  assignConfigurationToStar,
  clearAssignmentsIfMissing,
  clearAssignedConfiguration,
  clearInvalidAssignments,
  clearSelectionIfMissing,
  getAssignedConfiguration,
  getAssignedConfigurationId,
  getLineSelectionId,
  getStarTarget,
  setLineSelection,
} from "./config-selection";
import { deleteConfiguration, getConfigurationsForContext } from "./config-store";
import { renderStarGraph } from "./star-graph";

const HEIGHT = 220;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const DEFAULT_POINT_RADIUS = 3.5;
const HIGHLIGHTED_POINT_RADIUS = 5;
const DEFAULT_POINT_OPACITY = 0.7;
const HIGHLIGHTED_POINT_OPACITY = 1;

function truncate3(value) {
  return Math.trunc(value * 1000) / 1000;
}

function getDeleteButton() {
  return document.getElementById("delete-config-btn");
}

function getRateoContainer() {
  return document.getElementById("rateo-chart");
}

function getChartSize(container) {
  return {
    width: container.clientWidth || 900,
    height: container.clientHeight || HEIGHT,
  };
}

function normalizeConfigurations(items) {
  return items.map((item) => ({
    ...item,
    rateo: truncate3(Number(item.rateo)),
    timestep: Number(item.timestep),
  }));
}

async function loadRateoPoints(context) {
  const items = await getConfigurationsForContext(context);
  return normalizeConfigurations(items);
}

function syncSelectionState(points, context) {
  clearInvalidAssignments(context);

  const validIds = new Set(points.map((point) => point.id));
  clearSelectionIfMissing(validIds);
  clearAssignmentsIfMissing(validIds);
}

function refreshStarGraphs() {
  const left = getAssignedConfiguration("star-graph-1");
  const right = getAssignedConfiguration("star-graph-2");

  renderStarGraph(left?.weights || null, "star-graph-1", left?.rateo ?? null);
  renderStarGraph(right?.weights || null, "star-graph-2", right?.rateo ?? null);
}

function buildScales(points, width, height) {
  const timesteps = points.map((point) => point.timestep);
  const minRateo = d3.min(points, (point) => point.rateo) ?? 0;
  const maxRateo = d3.max(points, (point) => point.rateo) ?? 1;
  const yMin = Number.isFinite(minRateo) ? minRateo : 0;
  const yMax = Number.isFinite(maxRateo) ? maxRateo : 1;

  return {
    timesteps,
    xScale: d3
      .scalePoint()
      .domain(timesteps)
      .range([MARGIN.left, width - MARGIN.right])
      .padding(0.4),
    yScale: d3
      .scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([height - MARGIN.bottom, MARGIN.top]),
  };
}

function createSvg(container, width, height) {
  container.innerHTML = "";

  return d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`);
}

function styleAxis(group) {
  group.selectAll("text").attr("fill", "#425466");
  group.selectAll("line").attr("stroke", "#6b7a90");
  group.selectAll("path").attr("stroke", "#6b7a90");
}

function renderAxes(svg, xScale, yScale, timesteps, width, height) {
  const xAxis = d3.axisBottom(xScale).tickValues(timesteps);
  const yAxis = d3.axisLeft(yScale).ticks(4).tickFormat((value) => truncate3(Number(value)).toFixed(3));

  styleAxis(
    svg
      .append("g")
      .attr("transform", `translate(0,${height - MARGIN.bottom})`)
      .call(xAxis)
  );

  styleAxis(
    svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left},0)`)
      .call(yAxis)
  );
}

function renderAxisLabels(svg, width, height) {
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#425466")
    .text("timestep");

  svg
    .append("text")
    .attr("x", 14)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#425466")
    .attr("transform", `rotate(-90 14 ${height / 2})`)
    .text("rateo");
}

function renderRateoLine(svg, points, xScale, yScale) {
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
}

function applyPointStyles(pointGroup) {
  const leftId = getAssignedConfigurationId("star-graph-1");
  const rightId = getAssignedConfigurationId("star-graph-2");
  const lineSelectionId = getLineSelectionId();

  pointGroup
    .attr("r", (point) =>
      point.id === leftId || point.id === rightId || point.id === lineSelectionId
        ? HIGHLIGHTED_POINT_RADIUS
        : DEFAULT_POINT_RADIUS
    )
    .attr("opacity", (point) =>
      point.id === leftId || point.id === rightId || point.id === lineSelectionId
        ? HIGHLIGHTED_POINT_OPACITY
        : DEFAULT_POINT_OPACITY
    )
    .attr("fill", (point) => {
      if (point.id === leftId && point.id === rightId) return "#f59e0b";
      if (point.id === leftId) return "#22c55e";
      if (point.id === rightId) return "#ef4444";
      return "#1f6feb";
    })
    .attr("stroke", (point) => (point.id === lineSelectionId ? "#111827" : "none"))
    .attr("stroke-width", (point) => (point.id === lineSelectionId ? 2 : 0));
}

function handlePointSelection(point, pointGroup) {
  const targetId = getStarTarget();

  setLineSelection(point);
  if (targetId) {
    assignConfigurationToStar(targetId, point);
    renderStarGraph(point.weights, targetId, point.rateo);
  }

  applyPointStyles(pointGroup);
}

function renderPoints(svg, points, xScale, yScale) {
  const pointGroup = svg
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (point) => xScale(point.timestep))
    .attr("cy", (point) => yScale(point.rateo))
    .style("cursor", "pointer")
    .on("click", (event, point) => {
      handlePointSelection(point, pointGroup);
    });

  applyPointStyles(pointGroup);
  return pointGroup;
}

async function deleteSelectedConfiguration() {
  const selectedId = getLineSelectionId();
  if (!selectedId) {
    return;
  }

  await deleteConfiguration(selectedId);

  if (getAssignedConfigurationId("star-graph-1") === selectedId) {
    clearAssignedConfiguration("star-graph-1");
  }
  if (getAssignedConfigurationId("star-graph-2") === selectedId) {
    clearAssignedConfiguration("star-graph-2");
  }

  setLineSelection(null);
}

function bindDeleteButton() {
  const deleteBtn = getDeleteButton();
  if (!deleteBtn || deleteBtn.dataset.bound === "true") {
    return;
  }

  deleteBtn.addEventListener("click", async () => {
    try {
      await deleteSelectedConfiguration();
      await renderRateoChart();
    } catch (error) {
      console.error("Delete failed", error);
    }
  });

  deleteBtn.dataset.bound = "true";
}

function bindResizeObserver(container) {
  if (container._rateoResizeObserver) {
    return;
  }

  const observer = new ResizeObserver(() => {
    renderRateoChart();
  });

  observer.observe(container);
  container._rateoResizeObserver = observer;
}

function renderEmptyState(container) {
  container.textContent = "No configurations saved yet.";
  refreshStarGraphs();
}

function renderRateoSvg(container, points) {
  const { width, height } = getChartSize(container);
  const { timesteps, xScale, yScale } = buildScales(points, width, height);
  const svg = createSvg(container, width, height);

  renderAxes(svg, xScale, yScale, timesteps, width, height);
  renderAxisLabels(svg, width, height);
  renderRateoLine(svg, points, xScale, yScale);
  renderPoints(svg, points, xScale, yScale);
}

export async function renderRateoChart() {
  const container = getRateoContainer();
  if (!container) {
    return;
  }

  const context = getCurrentContext();
  let points = [];

  try {
    points = await loadRateoPoints(context);
  } catch (error) {
    container.textContent = `Unable to load configurations: ${error.message}`;
    return;
  }

  syncSelectionState(points, context);

  if (!points.length) {
    renderEmptyState(container);
    return;
  }

  renderRateoSvg(container, points);
  refreshStarGraphs();
  bindDeleteButton();
  bindResizeObserver(container);
}
