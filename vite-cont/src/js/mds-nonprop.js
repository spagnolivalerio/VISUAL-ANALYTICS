import * as d3 from "d3";
import { saveConfiguration } from "./config-store";
import { renderRateoChart } from "./rateo-chart";
import { renderStarGraph } from "./star-graph";

const MARGIN = { top: 20, right: 20, bottom: 40, left: 46 };

let resizeObserver;
let lastPoints = [];
let sessionTimestep = 0;

export function renderNonPropFromSaved(points, timestep) {
  const container = document.getElementById("mds-non-proportional-container");
  const timestepLabel = document.getElementById("nonprop-timestep");
  if (!container || !Array.isArray(points) || !points.length) {
    return;
  }
  lastPoints = points;
  drawNonPropMds(container, points, container.dataset.showCentroids === "true");
  if (timestepLabel) {
    timestepLabel.textContent = timestep === undefined ? "(saved)" : `(t=${timestep})`;
  }
}

function collectWeights() {
  const sliders = Array.from(document.querySelectorAll("#weights-list input[type='range'][data-attribute]"));
  const weights = {};
  for (const slider of sliders) {
    weights[slider.dataset.attribute] = Number(slider.value);
  }
  return weights;
}

function drawNonPropMds(container, points, showCentroids) {
  container.classList.remove("plot-placeholder");
  container.innerHTML = "";

  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const xDomain = d3.extent(points, (d) => d.x);
  const yDomain = d3.extent(points, (d) => d.y);
  const x = d3.scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
  const y = d3.scaleLinear().domain(yDomain).nice().range([innerHeight, 0]);

  const color = d3.scaleOrdinal(d3.schemeTableau10);
  color.domain([...new Set(points.map((d) => d.class_label))]);

  g.append("g").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x));
  g.append("g").call(d3.axisLeft(y));

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 34)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("MDS X");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -34)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("MDS Y");

  const pointsLayer = g.append("g").attr("class", "cluster-points");
  const centroidLayer = g.append("g").attr("class", "cluster-centroids");
  const linksLayer = g.append("g").attr("class", "cluster-links");

  const circles = pointsLayer
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", 3.5)
    .attr("fill", (d) => color(d.class_label))
    .attr("opacity", 0.85);

  circles.append("title").text((d) => `id: ${d.id}, class: ${d.class_label}`);

  const clusters = d3.group(points, (d) => d.class_label);
  const centroids = Array.from(clusters, ([label, items]) => ({
    label,
    x: d3.mean(items, (d) => d.x),
    y: d3.mean(items, (d) => d.y),
  }));

  const centroidCircles = centroidLayer
    .selectAll("circle")
    .data(centroids)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", 7)
    .attr("fill", (d) => color(d.label))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 0.95)
    .style("cursor", "pointer");

  centroidCircles.append("title").text((d) => `centroid: ${d.label}`);
  centroidLayer
    .attr("display", showCentroids ? null : "none")
    .style("pointer-events", showCentroids ? "auto" : "none");

  let currentSelection = null;

  function resetHighlight() {
    linksLayer.selectAll("line").remove();
    circles.attr("opacity", 0.85);
    centroidCircles.attr("opacity", 0.95);
    currentSelection = null;
  }

  function highlightCluster(label) {
    linksLayer.selectAll("line").remove();
    const cluster = clusters.get(label) || [];

    circles.attr("opacity", 0.12);
    circles
      .filter((p) => p.class_label === label)
      .attr("opacity", 0.9);

    centroidCircles.attr("opacity", 0.25);
    centroidCircles
      .filter((c) => c.label === label)
      .attr("opacity", 1);

    const centroid = centroids.find((c) => c.label === label);
    if (!centroid) {
      return;
    }

    const lines = linksLayer.selectAll("line").data(cluster, (p) => p.id);
    lines
      .join(
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
    currentSelection = { type: "centroid", key: label };
  }

  function highlightPoint(pointId) {
    linksLayer.selectAll("line").remove();
    const selected = points.find((p) => p.id === pointId);
    if (!selected) {
      return;
    }
    const centroid = centroids.find((c) => c.label === selected.class_label);
    if (!centroid) {
      return;
    }

    circles.attr("opacity", 0.12);
    circles
      .filter((p) => p.class_label === selected.class_label)
      .attr("opacity", 0.9);
    circles
      .filter((p) => p.id === selected.id)
      .attr("opacity", 1)
      .attr("r", 4.6);

    centroidCircles.attr("opacity", 0.25);
    centroidCircles
      .filter((c) => c.label === selected.class_label)
      .attr("opacity", 1);

    linksLayer.selectAll("line").remove();
    linksLayer
      .append("line")
      .attr("x1", x(centroid.x))
      .attr("y1", y(centroid.y))
      .attr("x2", x(selected.x))
      .attr("y2", y(selected.y))
      .attr("stroke", "#6b7a90")
      .attr("stroke-width", 1)
      .attr("opacity", 0.7);
    currentSelection = { type: "point", key: selected.id };
  }

  centroidCircles.on("click", (event, d) => {
    event.stopPropagation();
    if (currentSelection?.type === "centroid" && currentSelection.key === d.label) {
      resetHighlight();
      window.__mdsSelection = null;
      window.dispatchEvent(new CustomEvent("mds:reset"));
      return;
    }
    if (currentSelection?.type === "point") {
      resetHighlight();
    }
    highlightCluster(d.label);
    window.__mdsSelection = { type: "centroid", key: d.label };
    window.dispatchEvent(new CustomEvent("mds:centroid", { detail: { label: d.label } }));
  });

  svg.on("click", () => {
    resetHighlight();
    window.__mdsSelection = null;
    window.dispatchEvent(new CustomEvent("mds:reset"));
  });

  circles.on("click", (event, d) => {
    event.stopPropagation();
    if (currentSelection?.type === "point" && currentSelection.key === d.id) {
      resetHighlight();
      window.__mdsSelection = null;
      window.dispatchEvent(new CustomEvent("mds:reset"));
      return;
    }
    if (currentSelection?.type === "centroid") {
      resetHighlight();
    }
    highlightPoint(d.id);
    window.__mdsSelection = { type: "point", key: d.id };
    window.dispatchEvent(new CustomEvent("mds:point", { detail: { id: d.id } }));
  });

  function onCentroid(event) {
    if (currentSelection?.type === "point") {
      resetHighlight();
    }
    if (currentSelection?.type === "centroid" && currentSelection.key === event.detail.label) {
      return;
    }
    highlightCluster(event.detail.label);
  }

  function onPoint(event) {
    if (currentSelection?.type === "centroid") {
      resetHighlight();
    }
    if (currentSelection?.type === "point" && currentSelection.key === event.detail.id) {
      return;
    }
    highlightPoint(event.detail.id);
  }

  function onReset() {
    resetHighlight();
  }

  if (container._mdsCentroidHandler) {
    window.removeEventListener("mds:centroid", container._mdsCentroidHandler);
  }
  if (container._mdsResetHandler) {
    window.removeEventListener("mds:reset", container._mdsResetHandler);
  }
  if (container._mdsPointHandler) {
    window.removeEventListener("mds:point", container._mdsPointHandler);
  }
  container._mdsCentroidHandler = onCentroid;
  container._mdsResetHandler = onReset;
  container._mdsPointHandler = onPoint;
  window.addEventListener("mds:centroid", onCentroid);
  window.addEventListener("mds:reset", onReset);
  window.addEventListener("mds:point", onPoint);

  if (window.__mdsSelection?.type === "centroid") {
    const label = window.__mdsSelection.key;
    if (clusters.has(label)) {
      window.dispatchEvent(new CustomEvent("mds:centroid", { detail: { label } }));
    } else {
      window.__mdsSelection = null;
    }
  }
  if (window.__mdsSelection?.type === "point") {
    const id = window.__mdsSelection.key;
    if (points.find((p) => p.id === id)) {
      window.dispatchEvent(new CustomEvent("mds:point", { detail: { id } }));
    } else {
      window.__mdsSelection = null;
    }
  }
}

export function initNonPropMds() {
  const container = document.getElementById("mds-non-proportional-container");
  const runButton = document.getElementById("run-nonprop-btn");
  const status = document.getElementById("nonprop-status");
  const toggleButton = document.getElementById("toggle-centroids-nonprop");
  const timestepLabel = document.getElementById("nonprop-timestep");

  if (!container || !runButton || !status) {
    return;
  }

  if (!container.dataset.showCentroids) {
    container.dataset.showCentroids = "true";
  }
  if (toggleButton) {
    toggleButton.setAttribute("aria-pressed", container.dataset.showCentroids);
    if (!toggleButton._centroidToggleBound) {
      toggleButton.addEventListener("click", () => {
        const next = container.dataset.showCentroids !== "true";
        container.dataset.showCentroids = next ? "true" : "false";
        toggleButton.setAttribute("aria-pressed", container.dataset.showCentroids);
        d3.select(container)
          .select(".cluster-centroids")
          .attr("display", next ? null : "none")
          .style("pointer-events", next ? "auto" : "none");
      });
      toggleButton._centroidToggleBound = true;
    }
  }

  container.textContent = "Choose appropriate weights and click 'Run' to compute MDS.";
  container.classList.add("plot-placeholder");

  runButton.addEventListener("click", async () => {
    const weights = collectWeights();
    if (!Object.keys(weights).length) {
      status.textContent = "No weights available.";
      return;
    }

    runButton.disabled = true;
    status.textContent = "Computing...";

    let ratioValue = null;
    try {
      const response = await fetch("/api/mds-nonprop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const body = await response.text();
        throw new Error(`Expected JSON, got: ${body.slice(0, 120)}`);
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const points = payload.points || [];
      ratioValue = Number.isFinite(Number(payload.ratio)) ? Number(payload.ratio) : 0;
      if (!points.length) {
        throw new Error("No points returned.");
      }

      lastPoints = points;
      drawNonPropMds(container, points, container.dataset.showCentroids === "true");
      const timestep = sessionTimestep;
      const targetId = window.__starTarget || null;
      try {
        await saveConfiguration({ timestep, weights, rateo: ratioValue, points });
        sessionTimestep += 1;
        status.textContent = `Configuration saved (t=${timestep}).`;
        if (timestepLabel) {
          timestepLabel.textContent = `(t=${timestep})`;
        }
        window.__starSelections = window.__starSelections || {};
        if (targetId) {
          window.__starSelections[targetId] = timestep;
          window.__starSelectionsId = window.__starSelectionsId || {};
          window.__starSelectionsId[targetId] = undefined;
        }
        renderRateoChart();
        if (targetId) {
          renderStarGraph(weights, targetId, ratioValue);
        }
      } catch (error) {
        status.textContent = `Save failed: ${error.message}`;
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeObserver = new ResizeObserver(() => {
        if (lastPoints.length) {
          drawNonPropMds(container, lastPoints, container.dataset.showCentroids === "true");
        }
      });
      resizeObserver.observe(container);
    } catch (error) {
      status.textContent = `Errore: ${error.message}`;
    } finally {
      runButton.disabled = false;
    }
  });
}
