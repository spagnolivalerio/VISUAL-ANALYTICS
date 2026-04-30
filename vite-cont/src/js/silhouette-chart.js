import * as d3 from "d3";
import { getCurrentContext } from "./app-context";
import {
  assignConfigurationToStar,
  clearAssignmentsIfMissing,
  clearAssignedConfiguration,
  clearInvalidAssignments,
  clearSelectionIfMissing,
  getActiveSilhouetteView,
  getAssignedConfiguration,
  getAssignedConfigurationId,
  getDisplayedConfigurationId,
  getLineSelectionId,
  getStarTarget,
  setLineSelection,
  setActiveSilhouetteView,
} from "./config-selection";
import { deleteConfiguration, getConfigurationsForContext } from "./config-store";
import { renderStarGraph } from "./star-graph";

const HEIGHT = 220;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const DEFAULT_POINT_RADIUS = 5;
const HIGHLIGHTED_POINT_RADIUS = 7;
const SELECTION_RING_RADIUS = 11;
const DEFAULT_POINT_OPACITY = 0.7;
const HIGHLIGHTED_POINT_OPACITY = 1;
const STAR_GRAPH_IDS = ["star-graph-1", "star-graph-2"];
const MIN_SILHOUETTE_SPAN = 0.001;

function truncate3(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue * 1000) / 1000 : null;
}

function distance(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function meanDistance(point, clusterPoints) {
  if (!clusterPoints.length) {
    return 0;
  }

  const total = clusterPoints.reduce((sum, otherPoint) => sum + distance(point, otherPoint), 0);
  return total / clusterPoints.length;
}

function computeSilhouetteScore(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const clusters = d3.group(points, (point) => point.class_label);
  if (clusters.size < 2 || clusters.size >= points.length) {
    return null;
  }

  const scores = points.map((point) => {
    const sameCluster = (clusters.get(point.class_label) || []).filter(
      (otherPoint) => otherPoint.id !== point.id
    );
    if (!sameCluster.length) {
      return 0;
    }

    const cohesion = meanDistance(point, sameCluster);
    let nearestSeparation = Infinity;

    clusters.forEach((clusterPoints, label) => {
      if (label === point.class_label) {
        return;
      }
      nearestSeparation = Math.min(nearestSeparation, meanDistance(point, clusterPoints));
    });

    const denominator = Math.max(cohesion, nearestSeparation);
    return denominator > 0 && Number.isFinite(denominator)
      ? (nearestSeparation - cohesion) / denominator
      : 0;
  });

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function getViewPoints(item, view = getActiveSilhouetteView()) {
  if (view === "kmeans") {
    return item.views?.kmeans?.points || [];
  }

  return item.views?.labelBased?.points || item.points || [];
}

function resolveSilhouetteScore(item, view = getActiveSilhouetteView()) {
  const storedScore = Number(item.silhouetteScores?.[view]);
  if (Number.isFinite(storedScore)) {
    return storedScore;
  }

  const legacyScore = view === "labelBased" ? Number(item.silhouetteScore) : NaN;
  if (Number.isFinite(legacyScore)) {
    return legacyScore;
  }

  const viewScore = Number(item.views?.[view]?.silhouetteScore);
  if (Number.isFinite(viewScore)) {
    return viewScore;
  }

  return computeSilhouetteScore(getViewPoints(item, view));
}

function normalizeConfigurations(items, view = getActiveSilhouetteView()) {
  return items
    .map((item) => ({
      ...item,
      activeSilhouetteView: view,
      silhouetteScore: truncate3(resolveSilhouetteScore(item, view)),
      timestep: Number(item.timestep),
    }))
    .filter((item) => Number.isFinite(item.silhouetteScore));
}

function syncSelectionState(points, context) {
  clearInvalidAssignments(context);

  const validIds = new Set(points.map((point) => point.id));
  clearSelectionIfMissing(validIds);
  clearAssignmentsIfMissing(validIds);
}

function refreshStarGraphs() {
  const view = getActiveSilhouetteView();
  STAR_GRAPH_IDS.forEach((targetId) => {
    const config = getAssignedConfiguration(targetId, view);
    const silhouetteScore = config ? truncate3(resolveSilhouetteScore(config, view)) : null;
    renderStarGraph(config?.weights || null, targetId, silhouetteScore);
  });
}

function buildScales(points, width, height) {
  const timesteps = points.map((point) => point.timestep);
  const minSilhouette = d3.min(points, (point) => point.silhouetteScore) ?? 0;
  const maxSilhouette = d3.max(points, (point) => point.silhouetteScore) ?? 0;
  const needsPadding = Math.abs(maxSilhouette - minSilhouette) < MIN_SILHOUETTE_SPAN;
  const yMin = needsPadding ? minSilhouette - MIN_SILHOUETTE_SPAN : minSilhouette;
  const yMax = needsPadding ? maxSilhouette + MIN_SILHOUETTE_SPAN : maxSilhouette;

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
    .text("history");

  svg
    .append("text")
    .attr("x", 14)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#425466")
    .attr("transform", `rotate(-90 14 ${height / 2})`)
    .text("silhouette");
}

function renderSilhouetteLine(svg, points, xScale, yScale) {
  const line = d3
    .line()
    .x((point) => xScale(point.timestep))
    .y((point) => yScale(point.silhouetteScore));

  svg
    .append("path")
    .datum(points)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#1f6feb")
    .attr("stroke-width", 2);
}

function getHighlightColor(point, leftId, rightId, lineSelectionId) {
  if (point.id === leftId && point.id === rightId) return "#f59e0b";
  if (point.id === leftId) return "#22c55e";
  if (point.id === rightId) return "#ef4444";
  return "#1f6feb";
}

function isHighlightedPoint(point, leftId, rightId, lineSelectionId) {
  return point.id === leftId || point.id === rightId || point.id === lineSelectionId;
}

function applyPointStyles(pointGroup, ringGroup = null) {
  const leftId = getAssignedConfigurationId("star-graph-1");
  const rightId = getAssignedConfigurationId("star-graph-2");
  const lineSelectionId = getLineSelectionId();
  const displayedId = getDisplayedConfigurationId();

  pointGroup
    .attr("r", (point) =>
      isHighlightedPoint(point, leftId, rightId, lineSelectionId)
        ? HIGHLIGHTED_POINT_RADIUS
        : DEFAULT_POINT_RADIUS
    )
    .attr("opacity", (point) =>
      isHighlightedPoint(point, leftId, rightId, lineSelectionId)
        ? HIGHLIGHTED_POINT_OPACITY
        : DEFAULT_POINT_OPACITY
    )
    .attr("fill", (point) => getHighlightColor(point, leftId, rightId, lineSelectionId))
    .attr("stroke", (point) => (point.id === lineSelectionId ? "#111827" : "none"))
    .attr("stroke-width", (point) => (point.id === lineSelectionId ? 2 : 0));

  if (!ringGroup) {
    return;
  }

  ringGroup
    .attr("r", SELECTION_RING_RADIUS)
    .attr("fill", "none")
    .attr("stroke", "#111827")
    .attr("stroke-width", (point) => (point.id === displayedId ? 2.6 : 0))
    .attr("opacity", (point) => (point.id === displayedId ? 1 : 0));
}

function handlePointSelection(point, pointGroup, ringGroup) {
  const targetId = getStarTarget();

  setLineSelection(point);
  if (targetId) {
    assignConfigurationToStar(targetId, point);
    renderStarGraph(point.weights, targetId, point.silhouetteScore);
  }

  applyPointStyles(pointGroup, ringGroup);
}

function bindViewSelector() {
  const selector = document.getElementById("silhouette-view-select");
  if (!selector) {
    return;
  }

  selector.value = getActiveSilhouetteView();
  if (selector.dataset.bound === "true") {
    return;
  }

  selector.addEventListener("change", async () => {
    setActiveSilhouetteView(selector.value);
    await renderSilhouetteChart();
  });
  selector.dataset.bound = "true";
}

function renderPoints(svg, points, xScale, yScale) {
  const ringGroup = svg
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (point) => xScale(point.timestep))
    .attr("cy", (point) => yScale(point.silhouetteScore))
    .style("pointer-events", "none");

  const pointGroup = svg
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (point) => xScale(point.timestep))
    .attr("cy", (point) => yScale(point.silhouetteScore))
    .style("cursor", "pointer")
    .on("click", (_, point) => handlePointSelection(point, pointGroup, ringGroup));

  applyPointStyles(pointGroup, ringGroup);
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
  const deleteBtn = document.getElementById("delete-config-btn");
  if (!deleteBtn || deleteBtn.dataset.bound === "true") {
    return;
  }

  deleteBtn.addEventListener("click", async () => {
    try {
      await deleteSelectedConfiguration();
      await renderSilhouetteChart();
    } catch (error) {
      console.error("Delete failed", error);
    }
  });

  deleteBtn.dataset.bound = "true";
}

function bindResizeObserver(container) {
  if (container._silhouetteResizeObserver) {
    return;
  }

  const resizeTarget = container.parentElement || container;
  const observer = new ResizeObserver(() => {
    renderSilhouetteChart();
  });

  observer.observe(resizeTarget);
  container._silhouetteResizeObserver = observer;
}

function renderSilhouetteSvg(container, points) {
  const parentWidth = container.parentElement?.clientWidth || container.clientWidth || 900;
  const width = Math.max(parentWidth - 20, points.length * 54 + MARGIN.left + MARGIN.right);
  const height = container.clientHeight || HEIGHT;
  container.style.width = `${width}px`;
  const { timesteps, xScale, yScale } = buildScales(points, width, height);
  const svg = createSvg(container, width, height);

  renderAxes(svg, xScale, yScale, timesteps, width, height);
  renderAxisLabels(svg, width, height);
  renderSilhouetteLine(svg, points, xScale, yScale);
  renderPoints(svg, points, xScale, yScale);
}

export async function renderSilhouetteChart() {
  const container = document.getElementById("silhouette-chart");
  if (!container) {
    return;
  }

  const context = getCurrentContext();
  const view = getActiveSilhouetteView();
  bindViewSelector();

  try {
    const points = normalizeConfigurations(await getConfigurationsForContext(context), view);
    syncSelectionState(points, context);

    if (!points.length) {
      container.style.width = "100%";
      container.textContent = "No configurations saved yet.";
      refreshStarGraphs();
      return;
    }

    renderSilhouetteSvg(container, points);
    refreshStarGraphs();
    bindDeleteButton();
    bindResizeObserver(container);
  } catch (error) {
    container.style.width = "100%";
    container.textContent = `Unable to load configurations: ${error.message}`;
  }
}
