import * as d3 from "d3";

const DEFAULT_SIZE = 220;
const MIN_LABEL_CHARS = 4;
const MAX_LABEL_CHARS = 12;
const LABEL_DISTANCE = 12;
const LABEL_CLAMP = 6;
const LABEL_CHAR_WIDTH = 6.4;
const LABEL_LINE_HEIGHT = 12;
const MIN_RADIUS = 30;
const GRID_LEVELS = 4;

const chartState = new Map();
const resizeObserverByTarget = new Map();
const resizeFrameByTarget = new Map();

function formatSilhouetteScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  return Number(value).toFixed(3);
}

function getSilhouetteBadge(targetId) {
  return document.getElementById(targetId.replace("star-graph", "star-silhouette"));
}

function updateSilhouetteBadge(targetId, silhouetteScore) {
  const badge = getSilhouetteBadge(targetId);
  if (!badge) {
    return;
  }

  const scoreText = formatSilhouetteScore(silhouetteScore);
  if (scoreText === null) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }

  badge.textContent = `silhouette: ${scoreText}`;
  badge.hidden = false;
}

function createChartRoot(container) {
  const frame = document.createElement("div");
  const surface = document.createElement("div");
  frame.className = "star-graph-frame";
  surface.className = "star-graph-embed";
  frame.appendChild(surface);
  container.appendChild(frame);
  return d3.select(surface);
}

function getDimensions(container) {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width) || DEFAULT_SIZE),
    height: Math.max(1, Math.round(rect.height) || DEFAULT_SIZE),
  };
}

function getAccentPalette(targetId) {
  if (targetId === "star-graph-1") {
    return {
      stroke: "#1f9d61",
      fill: "rgba(31,157,97,0.16)",
      pointFill: "#1f9d61",
      glow: "rgba(31,157,97,0.14)",
    };
  }

  return {
    stroke: "#dc4c43",
    fill: "rgba(220,76,67,0.16)",
    pointFill: "#dc4c43",
    glow: "rgba(220,76,67,0.14)",
  };
}

function splitLabelTokens(label) {
  return String(label)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function chunkToken(token, maxCharsPerLine) {
  const chunks = [];
  for (let index = 0; index < token.length; index += maxCharsPerLine) {
    chunks.push(token.slice(index, index + maxCharsPerLine));
  }
  return chunks;
}

function wrapLabelText(label, maxCharsPerLine) {
  const normalizedMax = Math.max(MIN_LABEL_CHARS, maxCharsPerLine);
  const tokens = splitLabelTokens(label);
  if (!tokens.length) {
    return { lines: [String(label)], lineCount: 1, maxLineLength: String(label).length };
  }

  const lines = [];
  let currentLine = "";

  tokens.forEach((token) => {
    const parts = token.length > normalizedMax ? chunkToken(token, normalizedMax) : [token];

    parts.forEach((part) => {
      const nextLine = currentLine ? `${currentLine} ${part}` : part;
      if (nextLine.length <= normalizedMax) {
        currentLine = nextLine;
        return;
      }

      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = part;
    });
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return {
    lines,
    lineCount: lines.length,
    maxLineLength: lines.reduce((max, line) => Math.max(max, line.length), 0),
  };
}

function getTextAnchor(cos) {
  if (cos > 0.2) {
    return "start";
  }
  if (cos < -0.2) {
    return "end";
  }
  return "middle";
}

function getLabelBounds(x, y, textWidth, textHeight, textAnchor) {
  const left =
    textAnchor === "start" ? x : textAnchor === "end" ? x - textWidth : x - textWidth / 2;
  const right =
    textAnchor === "start" ? x + textWidth : textAnchor === "end" ? x : x + textWidth / 2;

  return {
    left,
    right,
    top: y - textHeight / 2,
    bottom: y + textHeight / 2,
  };
}

function buildAxisMetadata(labels, maxCharsPerLine) {
  const totalAxes = labels.length || 1;

  return labels.map((label, index) => {
    const angle = -Math.PI / 2 + (index / totalAxes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const wrappedLabel = wrapLabelText(label, maxCharsPerLine);

    return {
      label,
      index,
      angle,
      cos,
      sin,
      textAnchor: getTextAnchor(cos),
      lines: wrappedLabel.lines,
      textWidth: wrappedLabel.maxLineLength * LABEL_CHAR_WIDTH,
      textHeight: wrappedLabel.lineCount * LABEL_LINE_HEIGHT,
    };
  });
}

function radiusFits(axisMetadata, radius, width, height, centerX, centerY) {
  return axisMetadata.every((axis) => {
    const labelX = centerX + axis.cos * (radius + LABEL_DISTANCE);
    const labelY = centerY + axis.sin * (radius + LABEL_DISTANCE);
    const bounds = getLabelBounds(labelX, labelY, axis.textWidth, axis.textHeight, axis.textAnchor);

    return (
      bounds.left >= LABEL_CLAMP &&
      bounds.right <= width - LABEL_CLAMP &&
      bounds.top >= LABEL_CLAMP &&
      bounds.bottom <= height - LABEL_CLAMP
    );
  });
}

function computeLayout(labels, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const candidateChars = Math.max(
    MIN_LABEL_CHARS,
    Math.min(MAX_LABEL_CHARS, Math.floor(Math.min(width, height) / 22))
  );

  let bestLayout = null;

  for (let chars = candidateChars; chars >= MIN_LABEL_CHARS; chars -= 1) {
    const axisMetadata = buildAxisMetadata(labels, chars);
    let radius = Math.max(0, Math.min(width, height) / 2 - LABEL_DISTANCE - LABEL_CLAMP);

    while (radius > 0 && !radiusFits(axisMetadata, radius, width, height, centerX, centerY)) {
      radius -= 2;
    }

    const layout = {
      centerX,
      centerY,
      radius,
      axisMetadata,
    };

    if (!bestLayout || radius > bestLayout.radius) {
      bestLayout = layout;
    }

    if (radius >= MIN_RADIUS) {
      return layout;
    }
  }

  return bestLayout || { centerX, centerY, radius: 0, axisMetadata: [] };
}

function toCartesian(centerX, centerY, angle, radius) {
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function buildGridPolygons(layout) {
  return d3.range(1, GRID_LEVELS + 1).map((level) => {
    const radius = (layout.radius * level) / GRID_LEVELS;
    return layout.axisMetadata.map((axis) => toCartesian(layout.centerX, layout.centerY, axis.angle, radius));
  });
}

function buildDataPolygon(values, layout) {
  return layout.axisMetadata.map((axis, index) => {
    const radius = Math.max(0, Math.min(1, Number(values[index]) || 0)) * layout.radius;
    return {
      ...toCartesian(layout.centerX, layout.centerY, axis.angle, radius),
      value: Number(values[index]) || 0,
      label: axis.label,
    };
  });
}

function drawWrappedLabels(group, axisMetadata, layout) {
  const labels = group
    .selectAll("text")
    .data(axisMetadata)
    .join("text")
    .attr("x", (axis) => layout.centerX + axis.cos * (layout.radius + LABEL_DISTANCE))
    .attr("y", (axis) => layout.centerY + axis.sin * (layout.radius + LABEL_DISTANCE))
    .attr("text-anchor", (axis) => axis.textAnchor)
    .attr("fill", "#425466")
    .attr("font-size", 10)
    .attr("font-weight", 600);

  labels
    .selectAll("tspan")
    .data((axis) =>
      axis.lines.map((line, index) => ({
        line,
        offset:
          (index - (axis.lines.length - 1) / 2) * LABEL_LINE_HEIGHT +
          LABEL_LINE_HEIGHT * 0.35,
      }))
    )
    .join("tspan")
    .attr("x", function (_, index, nodes) {
      return d3.select(nodes[index].parentNode).attr("x");
    })
    .attr("dy", 0)
    .attr("y", function (datum, index, nodes) {
      return Number(d3.select(nodes[index].parentNode).attr("y")) + datum.offset;
    })
    .text((datum) => datum.line);
}

function renderRadarChart(container, targetId, weights) {
  const labels = Object.keys(weights);
  const values = Object.values(weights);
  const root = createChartRoot(container);
  const { width, height } = getDimensions(root.node());
  const palette = getAccentPalette(targetId);
  const layout = computeLayout(labels, width, height);
  const polygonLine = d3.line().x((point) => point.x).y((point) => point.y).curve(d3.curveLinearClosed);
  const svg = root
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("filter", `drop-shadow(0 10px 18px ${palette.glow})`);

  const chartLayer = svg.append("g");
  const gridPolygons = buildGridPolygons(layout);
  const dataPolygon = buildDataPolygon(values, layout);

  chartLayer
    .append("g")
    .selectAll("path")
    .data(gridPolygons)
    .join("path")
    .attr("d", polygonLine)
    .attr("fill", "none")
    .attr("stroke", "#d9e1eb")
    .attr("stroke-width", 1);

  chartLayer
    .append("g")
    .selectAll("line")
    .data(layout.axisMetadata)
    .join("line")
    .attr("x1", layout.centerX)
    .attr("y1", layout.centerY)
    .attr("x2", (axis) => toCartesian(layout.centerX, layout.centerY, axis.angle, layout.radius).x)
    .attr("y2", (axis) => toCartesian(layout.centerX, layout.centerY, axis.angle, layout.radius).y)
    .attr("stroke", "#ccd6e3")
    .attr("stroke-width", 1);

  chartLayer
    .append("path")
    .datum(dataPolygon)
    .attr("d", polygonLine)
    .attr("fill", palette.fill)
    .attr("stroke", palette.stroke)
    .attr("stroke-width", 2);

  chartLayer
    .append("g")
    .selectAll("circle")
    .data(dataPolygon)
    .join("circle")
    .attr("cx", (point) => point.x)
    .attr("cy", (point) => point.y)
    .attr("r", 3.6)
    .attr("fill", palette.pointFill)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5);

  drawWrappedLabels(chartLayer.append("g"), layout.axisMetadata, layout);
}

function scheduleResizeRender(targetId) {
  const pendingFrame = resizeFrameByTarget.get(targetId);
  if (pendingFrame) {
    cancelAnimationFrame(pendingFrame);
  }

  const nextFrame = requestAnimationFrame(() => {
    resizeFrameByTarget.delete(targetId);
    const currentState = chartState.get(targetId);
    if (!currentState) {
      return;
    }
    renderStarGraph(currentState.weights, targetId, currentState.silhouetteScore);
  });

  resizeFrameByTarget.set(targetId, nextFrame);
}

function bindResizeObserver(targetId, container) {
  if (resizeObserverByTarget.has(targetId)) {
    return;
  }

  const observer = new ResizeObserver(() => {
    scheduleResizeRender(targetId);
  });

  observer.observe(container);
  resizeObserverByTarget.set(targetId, observer);
}

export function renderStarGraph(weights, targetId, silhouetteScore = null) {
  const container = document.getElementById(targetId);
  if (!container) {
    return;
  }

  chartState.set(targetId, { weights, silhouetteScore });
  bindResizeObserver(targetId, container);

  container.innerHTML = "";
  container.dataset.empty = "true";
  updateSilhouetteBadge(targetId, null);

  if (!weights || !Object.keys(weights).length) {
    container.textContent = "No configuration selected.";
    return;
  }

  updateSilhouetteBadge(targetId, silhouetteScore);
  renderRadarChart(container, targetId, weights);
  container.dataset.empty = "false";
}
