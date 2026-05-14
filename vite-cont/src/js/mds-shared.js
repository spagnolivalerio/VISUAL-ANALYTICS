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
const POINT_SIZE_DEFAULT = 1;
const POINT_SIZE_MIN = 0.6;
const POINT_SIZE_MAX = 3;
const POINT_SIZE_STEP = 0.1;
const DEFAULT_ANIMATION_FRAME_DURATION = 44;

export function createSelectionState() {
  let selection = null;
  return {
    get: () => selection,
    set: (nextSelection) => (selection = nextSelection),
    clear: () => (selection = null),
  };
}

function getSharedPointSelection() {
  return Number.isInteger(window.__mdsSharedPointSelection) ? window.__mdsSharedPointSelection : null;
}

function getSharedCentroidSelection() {
  return window.__mdsSharedCentroidSelection || null;
}

function setSharedPointSelection(pointId) {
  window.__mdsSharedPointSelection = Number.isInteger(pointId) ? pointId : null;
}

function setSharedCentroidSelection(selection) {
  window.__mdsSharedCentroidSelection = selection || null;
}

function clearSharedPointSelection() {
  window.__mdsSharedPointSelection = null;
}

function clearSharedCentroidSelection() {
  window.__mdsSharedCentroidSelection = null;
}

function getContainerSize(container) {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  };
}

function resolvePointSizeScale(container) {
  const sizeScale = Number(container.dataset.pointSizeScale);
  return Number.isFinite(sizeScale)
    ? Math.max(POINT_SIZE_MIN, Math.min(POINT_SIZE_MAX, sizeScale))
    : POINT_SIZE_DEFAULT;
}

function applyCircleRadius(circles, baseRadius, sizeScale) {
  return circles
    .attr("data-base-radius", baseRadius)
    .attr("r", baseRadius * sizeScale);
}

function updatePlotPointSizes(container) {
  const sizeScale = resolvePointSizeScale(container);
  d3.select(container)
    .selectAll("[data-base-radius]")
    .attr("r", function () {
      return Number(this.dataset.baseRadius) * sizeScale;
    });
  d3.select(container)
    .selectAll(".cluster-centroids circle")
    .attr("stroke-width", 1.5 * sizeScale);
}

export function configurePointSizeSlider(container, slider, resetButton = null) {
  container.dataset.pointSizeScale = String(resolvePointSizeScale(container));
  if (!slider) {
    return;
  }
  const resolvedResetButton = resetButton ?? slider.closest(".plot-size-control")?.querySelector(".point-size-reset-btn");
  slider.type = "range";
  slider.min = String(POINT_SIZE_MIN);
  slider.max = String(POINT_SIZE_MAX);
  slider.step = String(POINT_SIZE_STEP);
  slider.value = container.dataset.pointSizeScale;
  if (slider._pointSizeBound) {
    return;
  }
  slider.addEventListener("input", () => {
    container.dataset.pointSizeScale = slider.value;
    updatePlotPointSizes(container);
  });
  slider._pointSizeBound = true;

  if (!resolvedResetButton || resolvedResetButton._pointSizeResetBound) {
    return;
  }
  resolvedResetButton.addEventListener("click", (event) => {
    event.preventDefault();
    slider.value = String(POINT_SIZE_DEFAULT);
    container.dataset.pointSizeScale = slider.value;
    updatePlotPointSizes(container);
  });
  resolvedResetButton._pointSizeResetBound = true;
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

function normalizeDomainRange(domainRange, fallbackExtent) {
  const [fallbackMin, fallbackMax] = fallbackExtent;
  const rawMin = Number(domainRange?.[0]);
  const rawMax = Number(domainRange?.[1]);
  const minValue = Number.isFinite(rawMin) ? rawMin : fallbackMin;
  const maxValue = Number.isFinite(rawMax) ? rawMax : fallbackMax;

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return [-1, 1];
  }

  if (minValue === maxValue) {
    const delta = Math.max(Math.abs(minValue) * 0.1, 1);
    return [minValue - delta, maxValue + delta];
  }

  return [Math.min(minValue, maxValue), Math.max(minValue, maxValue)];
}

function buildScales(points, innerWidth, innerHeight, scaleDomain = null, useNice = true) {
  const fallbackXExtent = d3.extent(points, (d) => d.x);
  const fallbackYExtent = d3.extent(points, (d) => d.y);
  const xDomain = normalizeDomainRange(scaleDomain?.x, fallbackXExtent);
  const yDomain = normalizeDomainRange(scaleDomain?.y, fallbackYExtent);
  const xPadding = (xDomain[1] - xDomain[0]) * 0.03;
  const yPadding = (yDomain[1] - yDomain[0]) * 0.08;

  xDomain[0] -= xPadding;
  xDomain[1] += xPadding;
  yDomain[0] -= yPadding;
  yDomain[1] += yPadding;
  const xScale = d3.scaleLinear().domain(xDomain).range([0, innerWidth]);
  const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

  if (useNice) {
    xScale.nice();
    yScale.nice();
  }

  return {
    x: xScale,
    y: yScale,
  };
}

function buildMergedScales(pointGroups, innerWidth, innerHeight, scaleDomain = null, useNice = true) {
  const mergedPoints = pointGroups.flat().filter(Boolean);
  return buildScales(mergedPoints, innerWidth, innerHeight, scaleDomain, useNice);
}

function buildPalette(size) {
  return Array.from({ length: size }, (_, index) => {
    if (index < d3.schemeTableau10.length) {
      return d3.schemeTableau10[index];
    }

    return d3.interpolateSinebow(((index - d3.schemeTableau10.length) * 0.61803398875) % 1);
  });
}

function getPointColorLabel(point) {
  return point.color_label ?? point.class_label;
}

function buildColorScale(points, colorDomain = null) {
  const labels =
    Array.isArray(colorDomain) && colorDomain.length
      ? [...colorDomain]
      : [...new Set(points.map((d) => getPointColorLabel(d)))];

  return d3.scaleOrdinal().domain(labels).range(buildPalette(labels.length));
}

function renderAxes(g, x, y, innerWidth, innerHeight) {
  const xAxisGroup = g.append("g").attr("transform", `translate(0,${innerHeight})`);
  const yAxisGroup = g.append("g");

  xAxisGroup.call(d3.axisBottom(x));
  yAxisGroup.call(d3.axisLeft(y));

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

  return { xAxisGroup, yAxisGroup };
}

function resolvePointExtent(points, accessor) {
  return normalizeDomainRange(d3.extent(points, accessor), d3.extent(points, accessor));
}

export function computeMdsScaleDomain(points) {
  return {
    x: resolvePointExtent(points, (point) => point.x),
    y: resolvePointExtent(points, (point) => point.y),
  };
}

function interpolateDomainRange(fromRange, toRange, ratio) {
  return [
    fromRange[0] + (toRange[0] - fromRange[0]) * ratio,
    fromRange[1] + (toRange[1] - fromRange[1]) * ratio,
  ];
}

function interpolateScaleDomain(fromDomain, toDomain, ratio) {
  return {
    x: interpolateDomainRange(fromDomain.x, toDomain.x, ratio),
    y: interpolateDomainRange(fromDomain.y, toDomain.y, ratio),
  };
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
    colorLabel: getPointColorLabel(items[0]),
    selectionKey: getPointColorLabel(items[0]),
    x: d3.mean(items, (d) => d.x),
    y: d3.mean(items, (d) => d.y),
  }));

  return { clusters, centroids };
}

function getCentroidSelectionKey(centroid) {
  return centroid?.selectionKey ?? centroid?.colorLabel ?? centroid?.label ?? null;
}

function renderPoints(pointsLayer, points, x, y, color, sizeScale) {
  const circles = pointsLayer
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("fill", (d) => color(getPointColorLabel(d)))
    .attr("opacity", DEFAULT_POINT_OPACITY);

  applyCircleRadius(circles, POINT_RADIUS, sizeScale);
  circles.append("title").text((d) => `id: ${d.id}, cluster: ${d.class_label}`);
  return circles;
}

function renderCentroids(centroidLayer, centroids, x, y, color, sizeScale) {
  const centroidCircles = centroidLayer
    .selectAll("circle")
    .data(centroids)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("fill", (d) => color(d.colorLabel))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5 * sizeScale)
    .attr("opacity", DEFAULT_CENTROID_OPACITY)
    .style("cursor", "pointer");

  applyCircleRadius(centroidCircles, CENTROID_RADIUS, sizeScale);
  centroidCircles.append("title").text((d) => `centroid: ${d.label}`);
  return centroidCircles;
}

function applyCentroidVisibility(centroidLayer, showCentroids) {
  centroidLayer
    .attr("display", showCentroids ? null : "none")
    .style("pointer-events", showCentroids ? "auto" : "none");
}

function normalizeLegendItems(labels, legendItems = null) {
  if (Array.isArray(legendItems) && legendItems.length) {
    return legendItems.map((item) => ({
      label: item.label,
      colorLabel: item.colorLabel ?? item.label,
      title: item.title,
    }));
  }

  return labels.map((label) => ({ label, colorLabel: label }));
}

function renderLegend(container, labels, color, showLegend, legendItems = null) {
  const legend = document.createElement("div");
  const list = document.createElement("div");
  const resolvedItems = normalizeLegendItems(labels, legendItems);
  legend.className = "plot-legend";
  legend.hidden = !showLegend;
  list.className = "plot-legend-list";

  resolvedItems.forEach(({ label, colorLabel, title }) => {
    const item = document.createElement("div");
    const swatch = document.createElement("span");
    const text = document.createElement("span");
    item.className = "plot-legend-item";
    if (title) {
      item.title = title;
    }
    swatch.className = "plot-legend-swatch";
    swatch.style.backgroundColor = color(colorLabel);
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

function getSelectionFromState(selectionState) {
  const savedSelection = selectionState?.get?.();
  if (savedSelection) {
    return savedSelection;
  }

  const sharedPointSelection = getSharedPointSelection();
  if (sharedPointSelection !== null) {
    return { type: "point", key: sharedPointSelection };
  }

  const sharedCentroidSelection = getSharedCentroidSelection();
  if (sharedCentroidSelection) {
    return {
      type: "centroid",
      key:
        sharedCentroidSelection.selectionKey ??
        sharedCentroidSelection.colorLabel ??
        sharedCentroidSelection.label,
    };
  }

  return null;
}

function resolveFrameSelection(points, centroids, selectionState) {
  const selection = getSelectionFromState(selectionState);
  if (!selection) {
    return null;
  }

  if (selection.type === "point") {
    const selectedPoint = points.find((point) => point.id === selection.key);
    const centroid = selectedPoint
      ? centroids.find((item) => item.label === selectedPoint.class_label)
      : null;

    if (!selectedPoint || !centroid) {
      return null;
    }

    return {
      type: "point",
      centroid,
      selectedPoint,
      clusterPoints: points.filter((point) => point.class_label === selectedPoint.class_label),
    };
  }

  if (selection.type === "centroid") {
    const selectionKey =
      selection.selectionKey ?? selection.key ?? selection.colorLabel ?? selection.label ?? null;
    const centroid = centroids.find((item) => getCentroidSelectionKey(item) === selectionKey);
    if (!centroid) {
      return null;
    }

    return {
      type: "centroid",
      centroid,
      clusterPoints: points.filter((point) => point.class_label === centroid.label),
    };
  }

  return null;
}

function applyAnimatedSelectionStyles(circles, centroidCircles, frameSelection, sizeScale) {
  if (!frameSelection) {
    return;
  }

  const selectedClusterLabel = frameSelection.centroid.label;
  circles.attr("opacity", DIMMED_POINT_OPACITY);
  applyCircleRadius(circles, POINT_RADIUS, sizeScale);
  circles
    .filter((point) => point.class_label === selectedClusterLabel)
    .attr("opacity", ACTIVE_POINT_OPACITY);

  if (frameSelection.type === "point") {
    circles
      .filter((point) => point.id === frameSelection.selectedPoint.id)
      .attr("opacity", ACTIVE_CENTROID_OPACITY);
    applyCircleRadius(
      circles.filter((point) => point.id === frameSelection.selectedPoint.id),
      ACTIVE_POINT_RADIUS,
      sizeScale
    );
  }

  centroidCircles.attr("opacity", DIMMED_CENTROID_OPACITY);
  centroidCircles
    .filter((centroid) => centroid.label === selectedClusterLabel)
    .attr("opacity", ACTIVE_CENTROID_OPACITY);
}

function renderSelectionLinks(
  linksLayer,
  frameSelection,
  x,
  y,
  frameDuration = 0
) {
  if (!frameSelection) {
    linksLayer.selectAll("line").remove();
    return null;
  }

  const centroid = frameSelection.centroid;
  const linkPoints =
    frameSelection.type === "point" ? [frameSelection.selectedPoint] : frameSelection.clusterPoints;

  const lines = linksLayer
    .selectAll("line")
    .data(linkPoints, (point) => point.id)
    .join(
      (enter) =>
        enter
          .append("line")
          .attr("x1", x(centroid.x))
          .attr("y1", y(centroid.y))
          .attr("x2", (point) => x(point.x))
          .attr("y2", (point) => y(point.y))
          .attr("stroke", "#6b7a90")
          .attr("stroke-width", 1)
          .attr("opacity", frameSelection.type === "point" ? 0.7 : 0.6),
      (update) => update,
      (exit) => exit.remove()
    );
  lines
    .attr("stroke", "#6b7a90")
    .attr("stroke-width", 1)
    .attr("opacity", frameSelection.type === "point" ? 0.7 : 0.6);

  if (!frameDuration) {
    lines
      .attr("x1", x(centroid.x))
      .attr("y1", y(centroid.y))
      .attr("x2", (point) => x(point.x))
      .attr("y2", (point) => y(point.y));
    return null;
  }

  return lines
    .transition()
    .duration(frameDuration)
    .ease(d3.easeLinear)
    .attr("x1", x(centroid.x))
    .attr("y1", y(centroid.y))
    .attr("x2", (point) => x(point.x))
    .attr("y2", (point) => y(point.y));
}

function createSelectionController(
  points,
  clusters,
  centroids,
  circles,
  centroidCircles,
  linksLayer,
  x,
  y,
  container
) {
  let currentSelection = null;
  const resetHighlight = () => {
    linksLayer.selectAll("line").remove();
    circles.attr("opacity", DEFAULT_POINT_OPACITY);
    applyCircleRadius(circles, POINT_RADIUS, resolvePointSizeScale(container));
    centroidCircles.attr("opacity", DEFAULT_CENTROID_OPACITY);
    currentSelection = null;
  };

  function highlightCluster(label) {
    const cluster = clusters.get(label) || [];
    const centroid = centroids.find((c) => c.label === label);
    if (!centroid) {
      return false;
    }
    resetHighlight();
    circles.attr("opacity", DIMMED_POINT_OPACITY);
    circles.filter((p) => p.class_label === label).attr("opacity", ACTIVE_POINT_OPACITY);
    centroidCircles.attr("opacity", DIMMED_CENTROID_OPACITY);
    centroidCircles.filter((c) => c.label === label).attr("opacity", ACTIVE_CENTROID_OPACITY);
    drawClusterLinks(linksLayer, cluster, centroid, x, y);
    currentSelection = {
      type: "centroid",
      key: getCentroidSelectionKey(centroid),
      label,
    };
    return true;
  }

  function resolveRelatedCentroid(selection) {
    if (!selection) {
      return null;
    }

    const selectionKey = selection.selectionKey ?? selection.colorLabel ?? selection.label ?? null;
    if (selectionKey !== null) {
      const match = centroids.find(
        (centroid) => getCentroidSelectionKey(centroid) === selectionKey
      );
      if (match) {
        return match;
      }
    }

    return (
      centroids.find((centroid) => centroid.label === selection.label) ||
      null
    );
  }

  function highlightRelatedCluster(selection) {
    const centroid = resolveRelatedCentroid(selection);
    if (!centroid || !highlightCluster(centroid.label)) {
      return null;
    }

    return getCentroidSelectionKey(centroid);
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
      .attr("opacity", ACTIVE_CENTROID_OPACITY);
    applyCircleRadius(
      circles.filter((p) => p.id === selected.id),
      ACTIVE_POINT_RADIUS,
      resolvePointSizeScale(container)
    );
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
    highlightRelatedCluster,
    highlightPoint,
  };
}

function bindSelectionEvents(svg, circles, centroidCircles, selectionController, selectionState) {
  const resetSelection = () => {
    selectionController.resetHighlight();
    selectionState?.clear?.();
    clearSharedPointSelection();
    clearSharedCentroidSelection();
    window.dispatchEvent(new CustomEvent("mds:reset"));
  };

  centroidCircles.on("click", (event, d) => {
    event.stopPropagation();
    const currentSelection = selectionController.getCurrentSelection();
    const selectionKey = getCentroidSelectionKey(d);
    if (currentSelection?.type === "centroid" && currentSelection.key === selectionKey) {
      resetSelection();
      return;
    }
    clearSharedPointSelection();
    clearSharedCentroidSelection();
    window.dispatchEvent(new CustomEvent("mds:reset"));
    if (currentSelection?.type === "point") {
      selectionController.resetHighlight();
    }
    selectionController.highlightCluster(d.label);
    selectionState?.set?.({ type: "centroid", key: selectionKey });
    const detail = { label: d.label, colorLabel: d.colorLabel, selectionKey };
    setSharedCentroidSelection(detail);
    window.dispatchEvent(new CustomEvent("mds:centroid", { detail }));
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
    clearSharedCentroidSelection();
    selectionController.highlightPoint(d.id);
    selectionState?.set?.({ type: "point", key: d.id });
    setSharedPointSelection(d.id);
    window.dispatchEvent(new CustomEvent("mds:point", { detail: { id: d.id } }));
  });
}

function bindGlobalSelectionSync(container, selectionController, selectionState) {
  const handlers = {
    centroid: (event) => {
      const currentSelection = selectionController.getCurrentSelection();
      if (currentSelection?.type === "point") selectionController.resetHighlight();
      const localSelectionKey = selectionController.highlightRelatedCluster(event.detail);
      if (localSelectionKey !== null) {
        setSharedCentroidSelection(event.detail);
        selectionState?.set?.({ type: "centroid", key: localSelectionKey });
      }
    },
    point: (event) => {
      const currentSelection = selectionController.getCurrentSelection();
      if (currentSelection?.type === "centroid") selectionController.resetHighlight();
      if (currentSelection?.type !== "point" || currentSelection.key !== event.detail.id) {
        selectionController.highlightPoint(event.detail.id);
      }
      clearSharedCentroidSelection();
      setSharedPointSelection(event.detail.id);
      selectionState?.set?.({ type: "point", key: event.detail.id });
    },
    reset: () => {
      clearSharedPointSelection();
      clearSharedCentroidSelection();
      selectionController.resetHighlight();
      selectionState?.clear?.();
    },
  };

  [
    ["mds:reset", "_mdsResetHandler", handlers.reset],
    ["mds:centroid", "_mdsCentroidHandler", handlers.centroid],
    ["mds:point", "_mdsPointHandler", handlers.point],
  ].forEach(([eventName, key, handler]) => {
    if (container[key]) {
      window.removeEventListener(eventName, container[key]);
    }
    container[key] = handler;
    window.addEventListener(eventName, handler);
  });
}

function restoreSelection(points, clusters, centroids, selectionState, selectionController) {
  const savedSelection = selectionState?.get?.();
  const sharedPointSelection = getSharedPointSelection();
  const sharedCentroidSelection = getSharedCentroidSelection();
  const valid =
    savedSelection?.type === "centroid"
      ? centroids.some((centroid) => getCentroidSelectionKey(centroid) === savedSelection.key)
      : savedSelection?.type === "point"
        ? points.some((p) => p.id === savedSelection.key)
        : false;

  if (!savedSelection) {
    if (sharedPointSelection !== null && points.some((point) => point.id === sharedPointSelection)) {
      selectionState?.set?.({ type: "point", key: sharedPointSelection });
      selectionController.highlightPoint(sharedPointSelection);
      return;
    }
    const localSelectionKey = selectionController.highlightRelatedCluster(sharedCentroidSelection);
    if (localSelectionKey !== null) {
      selectionState?.set?.({ type: "centroid", key: localSelectionKey });
    }
    return;
  }

  if (!valid) {
    selectionState?.clear?.();
    if (sharedPointSelection !== null && points.some((point) => point.id === sharedPointSelection)) {
      selectionState?.set?.({ type: "point", key: sharedPointSelection });
      selectionController.highlightPoint(sharedPointSelection);
      return;
    }
    const localSelectionKey = selectionController.highlightRelatedCluster(sharedCentroidSelection);
    if (localSelectionKey !== null) {
      selectionState?.set?.({ type: "centroid", key: localSelectionKey });
    }
    return;
  }

  if (savedSelection.type === "centroid") {
    selectionController.highlightRelatedCluster({ selectionKey: savedSelection.key });
    return;
  }

  selectionController.highlightPoint(savedSelection.key);
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

export function renderMdsPlot({
  container,
  points,
  showCentroids,
  clearContainer = (node) => (node.innerHTML = ""),
  scaleDomain = null,
  useNice = true,
  legendLabels = null,
  colorDomain = null,
  legendItems = null,
  selectionState = null,
}) {
  const { svg, g, innerWidth, innerHeight } = buildChart(container, clearContainer);
  const sizeScale = resolvePointSizeScale(container);
  const { x, y } = buildScales(points, innerWidth, innerHeight, scaleDomain, useNice);
  const color = buildColorScale(points, colorDomain);
  const { pointsLayer, centroidLayer, linksLayer } = createLayers(g);
  const { clusters, centroids } = buildClusterData(points);
  const resolvedLegendLabels =
    Array.isArray(legendLabels) && legendLabels.length ? legendLabels : color.domain();

  renderAxes(g, x, y, innerWidth, innerHeight);

  const circles = renderPoints(pointsLayer, points, x, y, color, sizeScale);
  const centroidCircles = renderCentroids(centroidLayer, centroids, x, y, color, sizeScale);
  applyCentroidVisibility(centroidLayer, showCentroids);
  renderLegend(
    container,
    resolvedLegendLabels,
    color,
    container.dataset.showLegend === "true",
    legendItems
  );

  const selectionController = createSelectionController(
    points,
    clusters,
    centroids,
    circles,
    centroidCircles,
    linksLayer,
    x,
    y,
    container
  );

  bindSelectionEvents(svg, circles, centroidCircles, selectionController, selectionState);
  bindGlobalSelectionSync(container, selectionController, selectionState);
  restoreSelection(points, clusters, centroids, selectionState, selectionController);
}

function interpolatePoints(fromPoints, toPoints, ratio) {
  const fromPointById = new Map((fromPoints || []).map((point) => [point.id, point]));
  return toPoints.map((toPoint) => {
    const fromPoint = fromPointById.get(toPoint.id) || toPoint;
    return {
      ...toPoint,
      x: fromPoint.x + (toPoint.x - fromPoint.x) * ratio,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * ratio,
    };
  });
}

export async function animateMdsPlotInterpolation({
  container,
  fromPoints,
  toPoints,
  showCentroids,
  clearContainer = (node) => (node.innerHTML = ""),
  fromScaleDomain = null,
  toScaleDomain = null,
  useNice = false,
  legendLabels = null,
  colorDomain = null,
  legendItems = null,
  interpolationSteps = 4,
  frameDuration = DEFAULT_ANIMATION_FRAME_DURATION,
  shouldContinue = null,
  selectionState = null,
}) {
  if (!container || !Array.isArray(fromPoints) || !Array.isArray(toPoints) || !toPoints.length) {
    return false;
  }

  const stepCount = Math.max(1, Number(interpolationSteps) || 1);
  const initialPoints = interpolatePoints(fromPoints, toPoints, 0);
  const { svg, g, innerWidth, innerHeight } = buildChart(container, clearContainer);
  const sizeScale = resolvePointSizeScale(container);
  const resolvedFromScaleDomain = fromScaleDomain ?? computeMdsScaleDomain(fromPoints);
  const resolvedToScaleDomain = toScaleDomain ?? computeMdsScaleDomain(toPoints);
  const { x, y } = buildScales(
    initialPoints,
    innerWidth,
    innerHeight,
    resolvedFromScaleDomain,
    useNice
  );
  const color = buildColorScale(toPoints, colorDomain);
  const { pointsLayer, centroidLayer, linksLayer } = createLayers(g);
  const resolvedLegendLabels =
    Array.isArray(legendLabels) && legendLabels.length ? legendLabels : color.domain();

  const { xAxisGroup, yAxisGroup } = renderAxes(g, x, y, innerWidth, innerHeight);
  renderLegend(
    container,
    resolvedLegendLabels,
    color,
    container.dataset.showLegend === "true",
    legendItems
  );

  const pointGroup = pointsLayer.append("g");
  let circles = pointGroup
    .selectAll("circle")
    .data(initialPoints, (point) => point.id)
    .join("circle")
    .attr("cx", (point) => x(point.x))
    .attr("cy", (point) => y(point.y))
    .attr("fill", (point) => color(getPointColorLabel(point)))
    .attr("opacity", DEFAULT_POINT_OPACITY);
  applyCircleRadius(circles, POINT_RADIUS, sizeScale);
  circles.append("title").text((point) => `id: ${point.id}, cluster: ${point.class_label}`);

  const initialCentroids = buildClusterData(initialPoints).centroids;
  let centroidCircles = centroidLayer
    .selectAll("circle")
    .data(initialCentroids, (centroid) => centroid.label)
    .join("circle")
    .attr("cx", (centroid) => x(centroid.x))
    .attr("cy", (centroid) => y(centroid.y))
    .attr("fill", (centroid) => color(centroid.colorLabel))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5 * sizeScale)
    .attr("opacity", DEFAULT_CENTROID_OPACITY);
  applyCircleRadius(centroidCircles, CENTROID_RADIUS, sizeScale);

  applyCentroidVisibility(centroidLayer, showCentroids);
  let frameSelection = resolveFrameSelection(initialPoints, initialCentroids, selectionState);
  applyAnimatedSelectionStyles(circles, centroidCircles, frameSelection, sizeScale);
  renderSelectionLinks(linksLayer, frameSelection, x, y);

  for (let stepIndex = 1; stepIndex <= stepCount; stepIndex += 1) {
    if (typeof shouldContinue === "function" && !shouldContinue()) {
      return false;
    }

    const ratio = stepIndex / stepCount;
    const framePoints = interpolatePoints(fromPoints, toPoints, ratio);
    const frameCentroids = buildClusterData(framePoints).centroids;
    const frameScaleDomain = interpolateScaleDomain(
      resolvedFromScaleDomain,
      resolvedToScaleDomain,
      ratio
    );
    const frameScales = buildScales(
      framePoints,
      innerWidth,
      innerHeight,
      frameScaleDomain,
      useNice
    );

    const frameSizeScale = resolvePointSizeScale(container);
    circles = pointGroup
      .selectAll("circle")
      .data(framePoints, (point) => point.id)
      .join("circle")
      .attr("fill", (point) => color(getPointColorLabel(point)))
      .attr("opacity", DEFAULT_POINT_OPACITY);
    applyCircleRadius(circles, POINT_RADIUS, frameSizeScale);
    circles.select("title").text((point) => `id: ${point.id}, cluster: ${point.class_label}`);

    centroidCircles = centroidLayer
      .selectAll("circle")
      .data(frameCentroids, (centroid) => centroid.label)
      .join("circle")
      .attr("fill", (centroid) => color(centroid.colorLabel))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5 * frameSizeScale)
      .attr("opacity", DEFAULT_CENTROID_OPACITY);
    applyCircleRadius(centroidCircles, CENTROID_RADIUS, frameSizeScale);

    frameSelection = resolveFrameSelection(framePoints, frameCentroids, selectionState);
    applyAnimatedSelectionStyles(circles, centroidCircles, frameSelection, frameSizeScale);
    const linkTransition = renderSelectionLinks(
      linksLayer,
      frameSelection,
      frameScales.x,
      frameScales.y,
      frameDuration
    );

    try {
      const xAxisTransition = xAxisGroup.transition().duration(frameDuration).ease(d3.easeLinear);
      xAxisTransition.call(d3.axisBottom(frameScales.x));

      const yAxisTransition = yAxisGroup.transition().duration(frameDuration).ease(d3.easeLinear);
      yAxisTransition.call(d3.axisLeft(frameScales.y));

      await Promise.all([
        circles
          .transition()
          .duration(frameDuration)
          .ease(d3.easeLinear)
          .attr("cx", (point) => frameScales.x(point.x))
          .attr("cy", (point) => frameScales.y(point.y))
          .end(),
        centroidCircles
          .transition()
          .duration(frameDuration)
          .ease(d3.easeLinear)
          .attr("cx", (centroid) => frameScales.x(centroid.x))
          .attr("cy", (centroid) => frameScales.y(centroid.y))
          .end(),
        ...(linkTransition ? [linkTransition.end()] : []),
        xAxisTransition.end(),
        yAxisTransition.end(),
      ]);
    } catch (error) {
      return false;
    }
  }

  return true;
}
