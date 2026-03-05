import * as d3 from "d3";

const MARGIN = { top: 20, right: 20, bottom: 40, left: 46 };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 420;

let resizeObserver;

function getPlotSize(container) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(MIN_WIDTH, Math.floor(rect.width));
  const height = Math.max(MIN_HEIGHT, Math.floor(rect.height));
  return { width, height };
}

function drawClassicMds(container, points, showCentroids) {
  container.innerHTML = "";

  const { width, height } = getPlotSize(container);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

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
      window.dispatchEvent(new CustomEvent("mds:reset"));
      return;
    }
    if (currentSelection?.type === "point") {
      resetHighlight();
    }
    highlightCluster(d.label);
    window.dispatchEvent(new CustomEvent("mds:centroid", { detail: { label: d.label } }));
  });

  svg.on("click", () => {
    resetHighlight();
    window.dispatchEvent(new CustomEvent("mds:reset"));
  });

  circles.on("click", (event, d) => {
    event.stopPropagation();
    if (currentSelection?.type === "point" && currentSelection.key === d.id) {
      resetHighlight();
      window.dispatchEvent(new CustomEvent("mds:reset"));
      return;
    }
    if (currentSelection?.type === "centroid") {
      resetHighlight();
    }
    highlightPoint(d.id);
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
}

export async function renderClassicMds() {
  const container = document.getElementById("mds-classic-container");
  const metricsPanel = document.getElementById("mds-classic-metrics");
  const toggleButton = document.getElementById("toggle-centroids-classic");
  if (!container) {
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

  container.textContent = "Loading MDS classic points...";

  try {
    const response = await fetch("/api/mds-classic");
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
    if (!points.length) {
      container.textContent = "No points returned.";
      return;
    }

    if (metricsPanel) {
      const plotLabels = [...new Set(points.map((p) => String(p.class_label)))];
      console.log("Plot labels:", plotLabels);
      const cohesion = payload.cluster_cohesion || {};
      const separation = payload.cluster_separation || {};
      const cohesionKeys = new Set(Object.keys(cohesion).map(String));
      const hasCohesion = Object.keys(cohesion).length > 0;
      const hasSeparation = Object.keys(separation).length > 0;
      if (!hasCohesion && !hasSeparation) {
        metricsPanel.innerHTML = `
          <p>cohesion: -</p>
          <p>separation: -</p>
          <p>ratio: 0</p>
        `;
      } else {
        const clusterLabels = plotLabels.filter((label) => cohesionKeys.has(label));
        const cohesionLabels = clusterLabels.length ? clusterLabels : Array.from(cohesionKeys);
        console.log("Cohesion labels:", cohesionLabels);
        const colorDomain = plotLabels.length ? plotLabels : Int16Array.from(cohesionLabels, Number);
        console.log("Color domain:", colorDomain);
        const palette = d3.schemeTableau10;
        console.log("Color palette:", palette);
        const colorMap = new Map(
          colorDomain.map((label, i) => [String(label), palette[i % palette.length]])
        );
        console.log("Color map:", colorMap);
        const getColor = (label) => colorMap.get(String(Math.trunc(label))) || palette[0];

        const format = (value) => Number(value).toFixed(3);
        const cohesionLines = hasCohesion
          ? cohesionLabels
              .map(
                (label) => `
                  <span class="cluster-swatch" style="background:${getColor(label)}"></span>
                  <span>${format(cohesion[label])}</span>
                `
              )
              .join(" ")
          : "-";

        const separationPairs = hasSeparation
          ? Object.keys(separation)
              .map((key) => {
                const [a, b] = key.split("-");
                const sa = String(a);
                const sb = String(b);
                return `
                  <span class="cluster-swatch" style="background:${getColor(sa)}"></span>
                  <span class="cluster-swatch" style="background:${getColor(sb)}"></span>
                  <span>${format(separation[key])}</span>
                `;
              })
              .join(" ")
          : "-";

        const cohesionValues = cohesionLabels.map((label) => Number(cohesion[label]) || 0);
        console.log("Cohesion by label:", cohesion);
        console.log("Cohesion values:", cohesionValues);
        const meanCohesion =
          cohesionValues.length
            ? cohesionValues.reduce((sum, v) => sum + v, 0) / cohesionValues.length
            : 0;

        const separationValues = Object.keys(separation).map((key) => Number(separation[key]) || 0);
        const meanSeparation =
          separationValues.length
            ? separationValues.reduce((sum, v) => sum + v, 0) / separationValues.length
            : 0;

        const ratio = meanSeparation ? meanCohesion / meanSeparation : 0;
        metricsPanel.innerHTML = `
          <div class="metric-line"><span class="metric-label">cohesion:</span> ${cohesionLines}</div>
          <div class="metric-line"><span class="metric-label">separation:</span> ${separationPairs}</div>
          <div class="metric-line"><span class="metric-label">ratio:</span> ${format(ratio)}</div>
        `;
      }
    }

    drawClassicMds(container, points, container.dataset.showCentroids === "true");

    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    resizeObserver = new ResizeObserver(() =>
      drawClassicMds(container, points, container.dataset.showCentroids === "true")
    );
    resizeObserver.observe(container);
  } catch (error) {
    container.textContent = `Classic MDS request failed: ${error.message}`;
  }
}
