import * as d3 from "d3";

const MARGIN = { top: 14, right: 14, bottom: 34, left: 38 };
const DEFAULT_POINT_OPACITY = 0.82;
const DIMMED_POINT_OPACITY = 0.12;
const ACTIVE_POINT_OPACITY = 0.9;
const DEFAULT_CENTROID_OPACITY = 0.92;
const DIMMED_CENTROID_OPACITY = 0.25;
const ACTIVE_CENTROID_OPACITY = 1;
const POINT_RADIUS = 3;
const ACTIVE_POINT_RADIUS = 4.2;
const CENTROID_RADIUS = 6;

function getContainerSize(container) {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  };
}

function buildChart(container, clearContainer) {
  container.classList.remove("plot-placeholder");
  clearContainer(container);
  const { width, height } = getContainerSize(container);
  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);
  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  return {
    svg,
    g,
    innerWidth: width - MARGIN.left - MARGIN.right,
    innerHeight: height - MARGIN.top - MARGIN.bottom,
  };
}

function buildScales(points, innerWidth, innerHeight) {
  return {
    x: d3.scaleLinear().domain(d3.extent(points, (d) => d.x)).nice().range([0, innerWidth]),
    y: d3.scaleLinear().domain(d3.extent(points, (d) => d.y)).nice().range([innerHeight, 0]),
  };
}

function buildColorScale(points) {
  return d3.scaleOrdinal(d3.schemeTableau10).domain([...new Set(points.map((d) => d.class_label))]);
}

function renderAxes(g, x, y, innerWidth, innerHeight) {
  g.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x));
  g.append("g").call(d3.axisLeft(y));

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 28)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .text("MDS X");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -28)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .text("MDS Y");
}

function createLayers(g) {
  return {
    pointsLayer: g.append("g").attr("class", "cluster-points"),
    centroidLayer: g.append("g").attr("class", "cluster-centroids"),
    linksLayer: g.append("g").attr("class", "cluster-links"),
  };
}

function buildClusterData(points) {
  const clusters = d3.group(points, (d) => d.class_label);
  const centroids = Array.from(clusters, ([label, items]) => ({
    label,
    x: d3.mean(items, (d) => d.x),
    y: d3.mean(items, (d) => d.y),
  }));

  return { clusters, centroids };
}

function renderPoints(pointsLayer, points, x, y, color) {
  const circles = pointsLayer
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", POINT_RADIUS)
    .attr("fill", (d) => color(d.class_label))
    .attr("opacity", DEFAULT_POINT_OPACITY);

  circles.append("title").text((d) => `id: ${d.id}, class: ${d.class_label}`);
  return circles;
}

function renderCentroids(centroidLayer, centroids, x, y, color) {
  const centroidCircles = centroidLayer
    .selectAll("circle")
    .data(centroids)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", CENTROID_RADIUS)
    .attr("fill", (d) => color(d.label))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5)
    .attr("opacity", DEFAULT_CENTROID_OPACITY)
    .style("cursor", "pointer");

  centroidCircles.append("title").text((d) => `centroid: ${d.label}`);
  return centroidCircles;
}

function applyCentroidVisibility(centroidLayer, showCentroids) {
  centroidLayer
    .attr("display", showCentroids ? null : "none")
    .style("pointer-events", showCentroids ? "auto" : "none");
}

function renderLegend(container, labels, color, showLegend) {
  const legend = document.createElement("div");
  const list = document.createElement("div");
  legend.className = "plot-legend";
  legend.hidden = !showLegend;
  list.className = "plot-legend-list";

  labels.forEach((label) => {
    const item = document.createElement("div");
    const swatch = document.createElement("span");
    const text = document.createElement("span");
    item.className = "plot-legend-item";
    swatch.className = "plot-legend-swatch";
    swatch.style.backgroundColor = color(label);
    text.className = "plot-legend-label";
    text.textContent = String(label);
    item.appendChild(swatch);
    item.appendChild(text);
    list.appendChild(item);
  });

  legend.appendChild(list);
  container.appendChild(legend);
}

function drawClusterLinks(linksLayer, cluster, centroid, x, y) {
  const lines = linksLayer.selectAll("line").data(cluster, (point) => point.id);
  lines.join(
    (enter) =>
      enter
        .append("line")
        .attr("x1", x(centroid.x))
        .attr("y1", y(centroid.y))
        .attr("x2", (d) => x(d.x))
        .attr("y2", (d) => y(d.y))
        .attr("stroke", "#6b7a90")
        .attr("stroke-width", 1)
        .attr("opacity", 0.6),
    (update) =>
      update
        .attr("x1", x(centroid.x))
        .attr("y1", y(centroid.y))
        .attr("x2", (d) => x(d.x))
        .attr("y2", (d) => y(d.y)),
    (exit) => exit.remove()
  );
}

function drawPointLink(linksLayer, selected, centroid, x, y) {
  linksLayer
    .append("line")
    .attr("x1", x(centroid.x))
    .attr("y1", y(centroid.y))
    .attr("x2", x(selected.x))
    .attr("y2", y(selected.y))
    .attr("stroke", "#6b7a90")
    .attr("stroke-width", 1)
    .attr("opacity", 0.7);
}

function createSelectionController(points, clusters, centroids, circles, centroidCircles, linksLayer, x, y) {
  let currentSelection = null;
  const resetHighlight = () => {
    linksLayer.selectAll("line").remove();
    circles.attr("opacity", DEFAULT_POINT_OPACITY).attr("r", POINT_RADIUS);
    centroidCircles.attr("opacity", DEFAULT_CENTROID_OPACITY);
    currentSelection = null;
  };

  function highlightCluster(label) {
    const cluster = clusters.get(label) || [];
    const centroid = centroids.find((c) => c.label === label);
    if (!centroid) {
      return;
    }
    resetHighlight();
    circles.attr("opacity", DIMMED_POINT_OPACITY);
    circles.filter((p) => p.class_label === label).attr("opacity", ACTIVE_POINT_OPACITY);
    centroidCircles.attr("opacity", DIMMED_CENTROID_OPACITY);
    centroidCircles.filter((c) => c.label === label).attr("opacity", ACTIVE_CENTROID_OPACITY);
    drawClusterLinks(linksLayer, cluster, centroid, x, y);
    currentSelection = { type: "centroid", key: label };
  }

  function highlightPoint(pointId) {
    const selected = points.find((p) => p.id === pointId);
    if (!selected) {
      return;
    }

    const centroid = centroids.find((c) => c.label === selected.class_label);
    if (!centroid) {
      return;
    }
    resetHighlight();
    circles.attr("opacity", DIMMED_POINT_OPACITY);
    circles.filter((p) => p.class_label === selected.class_label).attr("opacity", ACTIVE_POINT_OPACITY);
    circles
      .filter((p) => p.id === selected.id)
      .attr("opacity", ACTIVE_CENTROID_OPACITY)
      .attr("r", ACTIVE_POINT_RADIUS);
    centroidCircles.attr("opacity", DIMMED_CENTROID_OPACITY);
    centroidCircles
      .filter((c) => c.label === selected.class_label)
      .attr("opacity", ACTIVE_CENTROID_OPACITY);

    drawPointLink(linksLayer, selected, centroid, x, y);
    currentSelection = { type: "point", key: selected.id };
  }

  return {
    getCurrentSelection: () => currentSelection,
    resetHighlight,
    highlightCluster,
    highlightPoint,
  };
}

function bindSelectionEvents(svg, circles, centroidCircles, selectionController, selectionState) {
  const resetSelection = () => {
    selectionController.resetHighlight();
    selectionState?.clear?.();
    window.dispatchEvent(new CustomEvent("mds:reset"));
  };

  centroidCircles.on("click", (event, d) => {
    event.stopPropagation();
    const currentSelection = selectionController.getCurrentSelection();
    if (currentSelection?.type === "centroid" && currentSelection.key === d.label) {
      resetSelection();
      return;
    }
    if (currentSelection?.type === "point") {
      selectionController.resetHighlight();
    }
    selectionController.highlightCluster(d.label);
    selectionState?.set?.({ type: "centroid", key: d.label });
    window.dispatchEvent(new CustomEvent("mds:centroid", { detail: { label: d.label } }));
  });

  svg.on("click", resetSelection);

  circles.on("click", (event, d) => {
    event.stopPropagation();
    const currentSelection = selectionController.getCurrentSelection();
    if (currentSelection?.type === "point" && currentSelection.key === d.id) {
      resetSelection();
      return;
    }
    if (currentSelection?.type === "centroid") {
      selectionController.resetHighlight();
    }
    selectionController.highlightPoint(d.id);
    selectionState?.set?.({ type: "point", key: d.id });
    window.dispatchEvent(new CustomEvent("mds:point", { detail: { id: d.id } }));
  });
}

function bindGlobalSelectionSync(container, selectionController) {
  const handlers = {
    centroid: (event) => {
      const currentSelection = selectionController.getCurrentSelection();
      if (currentSelection?.type === "point") selectionController.resetHighlight();
      if (currentSelection?.type !== "centroid" || currentSelection.key !== event.detail.label) {
        selectionController.highlightCluster(event.detail.label);
      }
    },
    point: (event) => {
      const currentSelection = selectionController.getCurrentSelection();
      if (currentSelection?.type === "centroid") selectionController.resetHighlight();
      if (currentSelection?.type !== "point" || currentSelection.key !== event.detail.id) {
        selectionController.highlightPoint(event.detail.id);
      }
    },
    reset: () => selectionController.resetHighlight(),
  };

  [
    ["mds:centroid", "_mdsCentroidHandler", handlers.centroid],
    ["mds:reset", "_mdsResetHandler", handlers.reset],
    ["mds:point", "_mdsPointHandler", handlers.point],
  ].forEach(([eventName, key, handler]) => {
    if (container[key]) {
      window.removeEventListener(eventName, container[key]);
    }
    container[key] = handler;
    window.addEventListener(eventName, handler);
  });
}

function restoreSelection(points, clusters, selectionState) {
  const savedSelection = selectionState?.get?.();
  const valid =
    savedSelection?.type === "centroid"
      ? clusters.has(savedSelection.key)
      : savedSelection?.type === "point"
        ? points.some((p) => p.id === savedSelection.key)
        : false;

  if (!savedSelection) {
    return;
  }

  if (!valid) {
    selectionState?.clear?.();
    return;
  }

  window.dispatchEvent(
    new CustomEvent(savedSelection.type === "centroid" ? "mds:centroid" : "mds:point", {
      detail: savedSelection.type === "centroid" ? { label: savedSelection.key } : { id: savedSelection.key },
    })
  );
}

export function configureCentroidToggle(container, toggleButton) {
  container.dataset.showCentroids ||= "true";
  if (!toggleButton) {
    return;
  }
  toggleButton.setAttribute("aria-pressed", container.dataset.showCentroids);
  if (toggleButton._centroidToggleBound) {
    return;
  }
  toggleButton.addEventListener("click", () => {
    const next = container.dataset.showCentroids !== "true";
    container.dataset.showCentroids = next ? "true" : "false";
    toggleButton.setAttribute("aria-pressed", container.dataset.showCentroids);
    applyCentroidVisibility(d3.select(container).select(".cluster-centroids"), next);
  });
  toggleButton._centroidToggleBound = true;
}

export function configureLegendToggle(container, toggleButton) {
  container.dataset.showLegend ||= "false";
  if (!toggleButton) {
    return;
  }
  toggleButton.setAttribute("aria-pressed", container.dataset.showLegend);
  if (toggleButton._legendToggleBound) {
    return;
  }
  toggleButton.addEventListener("click", () => {
    const next = container.dataset.showLegend !== "true";
    container.dataset.showLegend = next ? "true" : "false";
    toggleButton.setAttribute("aria-pressed", container.dataset.showLegend);
    const legend = container.querySelector(".plot-legend");
    if (legend) legend.hidden = !next;
  });
  toggleButton._legendToggleBound = true;
}

export async function parseMdsJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(`Expected JSON, got: ${body.slice(0, 120)}`);
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

export function renderMdsPlot({
  container,
  points,
  showCentroids,
  clearContainer = (node) => (node.innerHTML = ""),
  selectionState = null,
}) {
  const { svg, g, innerWidth, innerHeight } = buildChart(container, clearContainer);
  const { x, y } = buildScales(points, innerWidth, innerHeight);
  const color = buildColorScale(points);
  const { pointsLayer, centroidLayer, linksLayer } = createLayers(g);
  const { clusters, centroids } = buildClusterData(points);

  renderAxes(g, x, y, innerWidth, innerHeight);

  const circles = renderPoints(pointsLayer, points, x, y, color);
  const centroidCircles = renderCentroids(centroidLayer, centroids, x, y, color);
  applyCentroidVisibility(centroidLayer, showCentroids);
  renderLegend(container, color.domain(), color, container.dataset.showLegend === "true");

  const selectionController = createSelectionController(
    points,
    clusters,
    centroids,
    circles,
    centroidCircles,
    linksLayer,
    x,
    y
  );

  bindSelectionEvents(svg, circles, centroidCircles, selectionController, selectionState);
  bindGlobalSelectionSync(container, selectionController);
  restoreSelection(points, clusters, selectionState);
}
