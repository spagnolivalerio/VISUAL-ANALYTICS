import embed from "vega-embed";

const DEFAULT_SIZE = 220;
const LABEL_OFFSET = 10;
const LABEL_CLAMP = 8;
const LABEL_CHAR_WIDTH = 6;
const LABEL_HEIGHT = 10;

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

function getContainer(targetId) {
  return document.getElementById(targetId);
}

function clearContainer(container) {
  container.innerHTML = "";
}

function renderEmptyState(container) {
  container.textContent = "No configuration selected.";
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

function getWeightEntries(weights) {
  return Object.entries(weights);
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
  let clampedX = x;
  let clampedY = y;

  if (align === "left") {
    clampedX = clampLabelPosition(clampedX, clampedX, width - LABEL_CLAMP - textWidth);
  } else if (align === "right") {
    clampedX = clampLabelPosition(clampedX, LABEL_CLAMP + textWidth, clampedX);
  } else {
    clampedX = clampLabelPosition(
      clampedX,
      LABEL_CLAMP + textWidth / 2,
      width - LABEL_CLAMP - textWidth / 2
    );
  }

  if (baseline === "top") {
    clampedY = clampLabelPosition(clampedY, clampedY, height - LABEL_CLAMP - textHeight);
  } else if (baseline === "bottom") {
    clampedY = clampLabelPosition(clampedY, LABEL_CLAMP + textHeight, clampedY);
  } else {
    clampedY = clampLabelPosition(
      clampedY,
      LABEL_CLAMP + textHeight / 2,
      height - LABEL_CLAMP - textHeight / 2
    );
  }

  return { x: clampedX, y: clampedY };
}

function buildAxes(labels, geometry, width, height) {
  return labels.map((label, index) => {
    const angle = (index / geometry.totalAxes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x2 = geometry.centerX + cos * geometry.radius;
    const y2 = geometry.centerY + sin * geometry.radius;
    const labelX = geometry.centerX + cos * (geometry.radius + LABEL_OFFSET);
    const labelY = geometry.centerY + sin * (geometry.radius + LABEL_OFFSET);
    const textWidth = String(label).length * LABEL_CHAR_WIDTH;
    const { align, baseline } = getLabelAlignment(cos, sin);
    const clamped = getClampedLabelCoordinates({
      width,
      height,
      x: labelX,
      y: labelY,
      textWidth,
      textHeight: LABEL_HEIGHT,
      align,
      baseline,
    });

    return {
      label,
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
  const container = getContainer(targetId);
  if (!container) {
    return;
  }

  clearContainer(container);

  if (!weights || !Object.keys(weights).length) {
    renderEmptyState(container);
    return;
  }

  appendRateoBadge(container, rateo);
  const embedTarget = createEmbedTarget(container);

  const entries = getWeightEntries(weights);
  const labels = entries.map(([key]) => key);
  const values = entries.map(([, value]) => Number(value));
  const { width, height } = getDimensions(container);
  const geometry = getChartGeometry(labels, width, height);
  const axes = buildAxes(labels, geometry, width, height);
  const series = buildSeries(labels, values, geometry);
  const spec = buildStarGraphSpec(width, height, axes, series);

  await embed(embedTarget, spec, { actions: false, renderer: "svg" });
}
