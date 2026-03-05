import * as d3 from "d3";

const MARGIN = { top: 20, right: 20, bottom: 40, left: 46 };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 420;

let resizeObserver;
let lastPoints = [];

function getPlotSize(container) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(MIN_WIDTH, Math.floor(rect.width));
  const height = Math.max(MIN_HEIGHT, Math.floor(rect.height));
  return { width, height };
}

function collectWeights() {
  const sliders = Array.from(document.querySelectorAll("#weights-list input[type='range'][data-attribute]"));
  const weights = {};
  for (const slider of sliders) {
    weights[slider.dataset.attribute] = Number(slider.value);
  }
  return weights;
}

function drawNonPropMds(container, points) {
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

  g.append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.y))
    .attr("r", 3.5)
    .attr("fill", (d) => color(d.class_label))
    .attr("opacity", 0.85)
    .append("title")
    .text((d) => `id: ${d.id}, class: ${d.class_label}`);
}

export function initNonPropMds() {
  const container = document.getElementById("mds-non-proportional-container");
  const runButton = document.getElementById("run-nonprop-btn");
  const status = document.getElementById("nonprop-status");

  if (!container || !runButton || !status) {
    return;
  }

  container.textContent = "Seleziona i pesi e premi il pulsante per calcolare l'MDS non proporzionale.";

  runButton.addEventListener("click", async () => {
    const weights = collectWeights();
    if (!Object.keys(weights).length) {
      status.textContent = "Pesi non disponibili.";
      return;
    }

    runButton.disabled = true;
    status.textContent = "Calcolo in corso...";

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
      if (!points.length) {
        throw new Error("No points returned.");
      }

      lastPoints = points;
      drawNonPropMds(container, points);
      status.textContent = `OK. Stress: ${Number(payload.stress).toFixed(3)}`;

      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeObserver = new ResizeObserver(() => {
        if (lastPoints.length) {
          drawNonPropMds(container, lastPoints);
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
