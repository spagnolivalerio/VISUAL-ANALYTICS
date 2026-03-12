import embed from "vega-embed";

const DEFAULT_SIZE = 220;
const LABEL_OFFSET = 10;
const LABEL_CLAMP = 8;
const LABEL_CHAR_WIDTH = 6;
const LABEL_LINE_HEIGHT = 12;

function buildPath(points) {
  if (!points.length) {
    return "";
  }

  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")} Z`;
}

function formatRateo(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  return Number(value).toFixed(3);
}

function appendRateoBadge(container, rateo) {
  const rateoText = formatRateo(rateo);
  if (rateoText === null) {
    return;
  }

  const badge = document.createElement("div");
  badge.className = "star-rateo";
  badge.textContent = `ratio: ${rateoText}`;
  container.appendChild(badge);
}

function createEmbedTarget(container) {
  const embedTarget = document.createElement("div");
  embedTarget.className = "star-graph-embed";
  container.appendChild(embedTarget);
  return embedTarget;
}

function getDimensions(container) {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width) || DEFAULT_SIZE),
    height: Math.max(1, Math.round(rect.height) || DEFAULT_SIZE),
  };
}

function getChartGeometry(labels, width, height) {
  const maxLabelLength = labels.reduce((max, label) => Math.max(max, String(label).length), 0);
  const minDim = Math.min(width, height);
  const estimatedLabelPx = maxLabelLength * 5 + LABEL_OFFSET;
  const labelSpace = Math.min(minDim * 0.10, estimatedLabelPx);

  return {
    radius: Math.max(0, minDim / 2 - labelSpace),
    centerX: width / 2,
    centerY: height / 2,
    totalAxes: labels.length || 1,
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
  const normalizedMax = Math.max(4, maxCharsPerLine);
  const tokens = splitLabelTokens(label);
  if (!tokens.length) {
    return { text: String(label), lineCount: 1, maxLineLength: String(label).length };
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

  const text = lines.join("\n");
  const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return { text, lineCount: lines.length, maxLineLength };
}

function getMaxCharsPerLine(geometry) {
  const estimatedLabelWidth = Math.max(42, Math.min(geometry.radius * 0.85, geometry.centerX * 0.9));
  return Math.floor(estimatedLabelWidth / LABEL_CHAR_WIDTH);
}

function clampLabelPosition(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getLabelAlignment(cos, sin) {
  return {
    align: cos > 0.15 ? "left" : cos < -0.15 ? "right" : "center",
    baseline: sin > 0.15 ? "top" : sin < -0.15 ? "bottom" : "middle",
  };
}

function getClampedLabelCoordinates({ width, height, x, y, textWidth, textHeight, align, baseline }) {
  return {
    x:
      align === "left"
        ? clampLabelPosition(x, x, width - LABEL_CLAMP - textWidth)
        : align === "right"
          ? clampLabelPosition(x, LABEL_CLAMP + textWidth, x)
          : clampLabelPosition(x, LABEL_CLAMP + textWidth / 2, width - LABEL_CLAMP - textWidth / 2),
    y:
      baseline === "top"
        ? clampLabelPosition(y, y, height - LABEL_CLAMP - textHeight)
        : baseline === "bottom"
          ? clampLabelPosition(y, LABEL_CLAMP + textHeight, y)
          : clampLabelPosition(
              y,
              LABEL_CLAMP + textHeight / 2,
              height - LABEL_CLAMP - textHeight / 2
            ),
  };
}

function buildAxes(labels, geometry, width, height) {
  const maxCharsPerLine = getMaxCharsPerLine(geometry);

  return labels.map((label, index) => {
    const angle = (index / geometry.totalAxes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x2 = geometry.centerX + cos * geometry.radius;
    const y2 = geometry.centerY + sin * geometry.radius;
    const labelX = geometry.centerX + cos * (geometry.radius + LABEL_OFFSET);
    const labelY = geometry.centerY + sin * (geometry.radius + LABEL_OFFSET);
    const wrappedLabel = wrapLabelText(label, maxCharsPerLine);
    const textWidth = wrappedLabel.maxLineLength * LABEL_CHAR_WIDTH;
    const { align, baseline } = getLabelAlignment(cos, sin);
    const clamped = getClampedLabelCoordinates({
      width,
      height,
      x: labelX,
      y: labelY,
      textWidth,
      textHeight: wrappedLabel.lineCount * LABEL_LINE_HEIGHT,
      align,
      baseline,
    });

    return {
      label: wrappedLabel.text,
      x1: geometry.centerX,
      y1: geometry.centerY,
      x2,
      y2,
      lx: clamped.x,
      ly: clamped.y,
      align,
      baseline,
    };
  });
}

function buildSeries(labels, values, geometry) {
  return labels.map((label, index) => {
    const angle = (index / geometry.totalAxes) * Math.PI * 2;
    const value = Number(values[index]) || 0;
    const radius = Math.max(0, Math.min(1, value)) * geometry.radius;

    return {
      label,
      value,
      x: geometry.centerX + Math.cos(angle) * radius,
      y: geometry.centerY + Math.sin(angle) * radius,
    };
  });
}

function buildStarGraphSpec(width, height, axes, series) {
  return {
    $schema: "https://vega.github.io/schema/vega/v5.json",
    width,
    height,
    padding: 0,
    autosize: "none",
    data: [
      { name: "axes", values: axes },
      { name: "series", values: series },
      { name: "polygon", values: [{ path: buildPath(series) }] },
    ],
    marks: [
      {
        type: "rule",
        from: { data: "axes" },
        encode: {
          update: {
            x: { field: "x1" },
            y: { field: "y1" },
            x2: { field: "x2" },
            y2: { field: "y2" },
            stroke: { value: "#c7d0db" },
          },
        },
      },
      {
        type: "text",
        from: { data: "axes" },
        encode: {
          update: {
            x: { field: "lx" },
            y: { field: "ly" },
            text: { field: "label" },
            lineBreak: { value: "\n" },
            lineHeight: { value: LABEL_LINE_HEIGHT },
            align: { field: "align" },
            baseline: { field: "baseline" },
            fontSize: { value: 10 },
            fill: { value: "#425466" },
          },
        },
      },
      {
        type: "path",
        from: { data: "polygon" },
        encode: {
          update: {
            path: { field: "path" },
            fill: { value: "rgba(31,111,235,0.18)" },
            stroke: { value: "#1f6feb" },
            strokeWidth: { value: 1.5 },
          },
        },
      },
      {
        type: "symbol",
        from: { data: "series" },
        encode: {
          update: {
            x: { field: "x" },
            y: { field: "y" },
            size: { value: 20 },
            fill: { value: "#1f6feb" },
          },
        },
      },
    ],
  };
}

export async function renderStarGraph(weights, targetId, rateo = null) {
  const container = document.getElementById(targetId);
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!weights || !Object.keys(weights).length) {
    container.textContent = "No configuration selected.";
    return;
  }

  appendRateoBadge(container, rateo);
  const embedTarget = createEmbedTarget(container);

  const entries = Object.entries(weights);
  const labels = entries.map(([key]) => key);
  const values = entries.map(([, value]) => Number(value));
  const { width, height } = getDimensions(container);
  const geometry = getChartGeometry(labels, width, height);
  const axes = buildAxes(labels, geometry, width, height);
  const series = buildSeries(labels, values, geometry);
  const spec = buildStarGraphSpec(width, height, axes, series);

  await embed(embedTarget, spec, { actions: false, renderer: "svg" });
}
