import * as d3 from "d3";

const sampleSizeInput = document.getElementById("sample-size");
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const chartEl = document.getElementById("chart");

const margin = { top: 40, right: 40, bottom: 20, left: 40 };
const width = 1200;
const height = 520;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c62828" : "#1b2430";
}

function toNumeric(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clearChart() {
  chartEl.innerHTML = "";
}

function renderParallelCoordinates(rows) {
  clearChart();

  if (!rows.length) {
    setStatus("No rows returned.", true);
    return;
  }

  const dimensions = Object.keys(rows[0]).filter((key) => key !== "Class label");
  const numericDimensions = dimensions.filter((dimension) =>
    rows.every((row) => toNumeric(row[dimension]) !== null),
  );

  if (!numericDimensions.length) {
    setStatus("No numeric dimensions found in sample.", true);
    return;
  }

  const svg = d3
    .select(chartEl)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scalePoint().domain(numericDimensions).range([0, innerWidth]).padding(0.5);

  const yScales = {};
  for (const dimension of numericDimensions) {
    const values = rows.map((row) => toNumeric(row[dimension]));
    const domain = d3.extent(values);
    yScales[dimension] = d3.scaleLinear().domain(domain).nice().range([innerHeight, 0]);
  }

  const color = d3.scaleOrdinal(d3.schemeTableau10);
  const classLabels = [...new Set(rows.map((row) => row["Class label"]))];
  color.domain(classLabels);

  const lineGenerator = d3
    .line()
    .x(([dimension]) => xScale(dimension))
    .y(([dimension, value]) => yScales[dimension](value));

  g.append("g")
    .selectAll("path")
    .data(rows)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (row) => color(row["Class label"]))
    .attr("stroke-opacity", 0.35)
    .attr("stroke-width", 1.4)
    .attr("d", (row) =>
      lineGenerator(numericDimensions.map((dimension) => [dimension, toNumeric(row[dimension])])),
    );

  const axisGroup = g
    .selectAll(".axis")
    .data(numericDimensions)
    .join("g")
    .attr("class", "axis")
    .attr("transform", (dimension) => `translate(${xScale(dimension)},0)`);

  axisGroup.each(function drawAxis(dimension) {
    d3.select(this).call(d3.axisLeft(yScales[dimension]).ticks(6));
  });

  axisGroup
    .append("text")
    .attr("y", -12)
    .attr("text-anchor", "middle")
    .attr("fill", "#1b2430")
    .style("font-size", "12px")
    .text((dimension) => dimension);

  const legend = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${height - 6})`)
    .style("font-size", "12px");

  classLabels.forEach((label, index) => {
    const entry = legend.append("g").attr("transform", `translate(${index * 120},0)`);
    entry.append("rect").attr("width", 12).attr("height", 12).attr("fill", color(label));
    entry
      .append("text")
      .attr("x", 16)
      .attr("y", 10)
      .attr("fill", "#1b2430")
      .text(`Class ${label}`);
  });
}

async function loadSample() {
  const n = Number.parseInt(sampleSizeInput.value, 10);
  if (!Number.isInteger(n) || n <= 0) {
    setStatus("Insert a valid integer > 0.", true);
    return;
  }

  setStatus(`Loading sample with ${n} tuples...`);
  loadBtn.disabled = true;

  try {
    const response = await fetch(`/api/sample?n=${encodeURIComponent(n)}`);
    const contentType = response.headers.get("content-type") || "";
    let payload;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      const body = await response.text();
      throw new Error(`Non-JSON response (${response.status}): ${body.slice(0, 140)}`);
    }

    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    renderParallelCoordinates(payload.rows || []);
    setStatus(`Loaded ${payload.count} sampled tuples over ${payload.total_rows} rows.`);
  } catch (error) {
    clearChart();
    setStatus(`Request failed: ${error.message}`, true);
  } finally {
    loadBtn.disabled = false;
  }
}

loadBtn.addEventListener("click", loadSample);
sampleSizeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadSample();
  }
});

loadSample();
