import * as d3 from "d3";
import { getAllConfigurations, getCurrentSessionId } from "./config-store";
import { renderStarGraph } from "./star-graph";

const HEIGHT = 220;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };

function truncate3(value) {
  return Math.trunc(value * 1000) / 1000;
}

export async function renderRateoChart() {
  const container = document.getElementById("rateo-chart");
  if (!container) {
    return;
  }
  const getTarget = () => window.__starTarget || "star-graph";

  const sessionId = getCurrentSessionId();
  const all = await getAllConfigurations();
  const points = all
    .filter((item) => item.sessionId === sessionId)
    .map((item) => ({
      timestep: Number(item.timestep),
      rateo: truncate3(Number(item.rateo)),
      weights: item.weights || {},
    }))
    .filter((item) => Number.isFinite(item.timestep) && Number.isFinite(item.rateo))
    .sort((a, b) => a.timestep - b.timestep);

  if (!points.length) {
    container.textContent = "No configurations saved yet.";
    return;
  }

  const timesteps = points.map((p) => p.timestep);
  const availableWidth = container.clientWidth || 900;
  const availableHeight = container.clientHeight || HEIGHT;
  const svgWidth = availableWidth;
  const svgHeight = availableHeight;

  const minRateo = d3.min(points, (p) => p.rateo) ?? 0;
  const maxRateo = d3.max(points, (p) => p.rateo) ?? 1;
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
  const yAxis = d3.axisLeft(yScale).ticks(4).tickFormat((d) => truncate3(Number(d)).toFixed(3));

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
    .x((d) => xScale(d.timestep))
    .y((d) => yScale(d.rateo));

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
    .attr("cx", (d) => xScale(d.timestep))
    .attr("cy", (d) => yScale(d.rateo))
    .attr("r", 3.5)
    .attr("fill", "#1f6feb")
    .attr("opacity", 0.9)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      pointGroup.attr("r", 3.5).attr("opacity", 0.6);
      d3.select(event.currentTarget).attr("r", 5).attr("opacity", 1);
      const targetId = getTarget();
      renderStarGraph(d.weights, targetId);
    });

  if (points.length) {
    pointGroup.attr("r", 3.5).attr("opacity", 0.6);
    pointGroup.filter((d, i) => i === points.length - 1).attr("r", 5).attr("opacity", 1);
    const targetId = getTarget();
    renderStarGraph(points[points.length - 1].weights, targetId);
  }

  if (!container._rateoResizeObserver) {
    const observer = new ResizeObserver(() => {
      renderRateoChart();
    });
    observer.observe(container);
    container._rateoResizeObserver = observer;
  }
}
