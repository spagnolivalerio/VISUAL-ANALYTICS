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

function drawClassicMds(container, points) {
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

export async function renderClassicMds() {
  const container = document.getElementById("mds-classic-container");
  if (!container) {
    return;
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

    drawClassicMds(container, points);

    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    resizeObserver = new ResizeObserver(() => drawClassicMds(container, points));
    resizeObserver.observe(container);
  } catch (error) {
    container.textContent = `Classic MDS request failed: ${error.message}`;
  }
}
