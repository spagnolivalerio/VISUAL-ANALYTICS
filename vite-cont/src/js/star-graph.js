import embed from "vega-embed";

const DEFAULT_SIZE = 220;
const LABEL_OFFSET = 10;
const LABEL_CLAMP = 8;

//Building the vega sgv path string from the series points
function buildPath(points) {
  if (!points.length) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;
}

export async function renderStarGraph(weights, targetId = "star-graph") {
  const container = document.getElementById(targetId);
  if (!container) return;

  container.innerHTML = "";

  if (!weights || !Object.keys(weights).length) {
    container.textContent = "No configuration selected.";
    return;
  }

  const entries = Object.entries(weights);
  const labels = entries.map(([key]) => key);
  const values = entries.map(([, value]) => Number(value));

  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width) || DEFAULT_SIZE);
  const height = Math.max(1, Math.round(rect.height) || DEFAULT_SIZE);

  const maxLabelLength = labels.reduce((max, label) => Math.max(max, String(label).length), 0);
  const minDim = Math.min(width, height);
  const estimatedLabelPx = maxLabelLength * 5 + LABEL_OFFSET;
  const labelSpace = Math.min(minDim * 0.10, estimatedLabelPx);
  const radius = Math.max(0, minDim / 2 - labelSpace);
  const centerX = width / 2;
  const centerY = height / 2;

  const n = labels.length || 1;

  const axes = labels.map((label, i) => {
    const angle = (i / n) * Math.PI * 2;
    const x2 = centerX + Math.cos(angle) * radius;
    const y2 = centerY + Math.sin(angle) * radius;
    const lx = centerX + Math.cos(angle) * (radius + LABEL_OFFSET);
    const ly = centerY + Math.sin(angle) * (radius + LABEL_OFFSET);
    const labelText = String(label);
    const textWidth = labelText.length * 6;
    const textHeight = 10;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const align = cos > 0.15 ? "left" : cos < -0.15 ? "right" : "center";
    const baseline = sin > 0.15 ? "top" : sin < -0.15 ? "bottom" : "middle";
    let clampedX = lx;
    let clampedY = ly;
    if (align === "left") {
      clampedX = Math.min(width - LABEL_CLAMP - textWidth, clampedX);
    } else if (align === "right") {
      clampedX = Math.max(LABEL_CLAMP + textWidth, clampedX);
    } else {
      clampedX = Math.min(width - LABEL_CLAMP - textWidth / 2, Math.max(LABEL_CLAMP + textWidth / 2, clampedX));
    }
    if (baseline === "top") {
      clampedY = Math.min(height - LABEL_CLAMP - textHeight, clampedY);
    } else if (baseline === "bottom") {
      clampedY = Math.max(LABEL_CLAMP + textHeight, clampedY);
    } else {
      clampedY = Math.min(height - LABEL_CLAMP - textHeight / 2, Math.max(LABEL_CLAMP + textHeight / 2, clampedY));
    }
    return { label, x1: centerX, y1: centerY, x2, y2, lx: clampedX, ly: clampedY, align, baseline };
  });

  const series = labels.map((label, i) => {
    const angle = (i / n) * Math.PI * 2;
    const value = Number(values[i]) || 0;
    const r = Math.max(0, Math.min(1, value)) * radius;
    return { label, value, x: centerX + Math.cos(angle) * r, y: centerY + Math.sin(angle) * r };
  });

  const spec = {
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

  await embed(container, spec, { actions: false, renderer: "svg" });
}
