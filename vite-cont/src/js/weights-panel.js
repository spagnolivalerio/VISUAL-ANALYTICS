import { getCurrentContext } from "./app-context";

function formatWeight(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function normalizeWeightValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(0, Math.min(1, numeric));
}

function getWeightsList() {
  return document.getElementById("weights-list");
}

function getResetButton() {
  return document.getElementById("reset-weights-btn");
}

function getSliderElements() {
  const list = getWeightsList();
  if (!list) {
    return [];
  }
  return Array.from(list.querySelectorAll("input[type='range'][data-attribute]"));
}

function setSliderValue(slider, nextValue) {
  const normalized = normalizeWeightValue(nextValue);
  slider.value = String(normalized);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

function buildWeightRow(attributeName, initialValue = 1) {
  const safeId = attributeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const row = document.createElement("div");
  row.className = "weight-row";

  const label = document.createElement("label");
  label.setAttribute("for", `weight-${safeId}`);
  label.textContent = attributeName;

  const value = document.createElement("span");
  value.className = "weight-value";
  value.textContent = formatWeight(initialValue);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "1";
  slider.step = "0.25";
  slider.value = String(normalizeWeightValue(initialValue));
  slider.id = `weight-${safeId}`;
  slider.className = "weight-slider";
  slider.dataset.attribute = attributeName;

  slider.addEventListener("input", () => {
    value.textContent = formatWeight(slider.value);
  });

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(slider);
  return row;
}

async function restRequest(dataset, clusterAttr) {
  const payload = {};
  if (dataset) payload.dataset = dataset;
  if (clusterAttr) payload.cluster_attr = clusterAttr;

  return fetch("/api/numeric-attributes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getWeightsFromPanel() {
  const sliders = getSliderElements();
  return sliders.reduce((weights, slider) => {
    weights[slider.dataset.attribute] = Number(slider.value);
    return weights;
  }, {});
}

export function applyWeightsToPanel(weights) {
  if (!weights || typeof weights !== "object") {
    return false;
  }

  const sliders = getSliderElements();
  if (!sliders.length) {
    return false;
  }

  const attributes = sliders.map((slider) => slider.dataset.attribute);
  const hasAllAttributes = attributes.every((attribute) => Object.prototype.hasOwnProperty.call(weights, attribute));
  if (!hasAllAttributes) {
    return false;
  }

  sliders.forEach((slider) => {
    setSliderValue(slider, weights[slider.dataset.attribute]);
  });
  return true;
}

export function resetWeightsPanel() {
  getSliderElements().forEach((slider) => {
    setSliderValue(slider, 1);
  });
}

function bindResetButton() {
  const resetButton = getResetButton();
  if (!resetButton || resetButton.dataset.bound === "true") {
    return;
  }

  resetButton.addEventListener("click", () => {
    resetWeightsPanel();
  });
  resetButton.dataset.bound = "true";
}

function setPanelContext(dataset, clusterAttr, attributes) {
  const list = getWeightsList();
  if (!list) {
    return;
  }

  list.dataset.dataset = dataset || "";
  list.dataset.clusterAttr = clusterAttr || "";
  list.dataset.attributes = JSON.stringify(attributes || []);
}

export function getRenderedPanelContext() {
  const list = getWeightsList();
  if (!list) {
    return null;
  }

  let attributes = [];
  try {
    attributes = JSON.parse(list.dataset.attributes || "[]");
  } catch (error) {
    attributes = [];
  }

  return {
    dataset: list.dataset.dataset || null,
    clusterAttr: list.dataset.clusterAttr || null,
    attributes,
  };
}

export async function renderWeightsPanel(weights = null, datasetArg, clusterAttrArg) {
  const list = getWeightsList();
  if (!list) {
    return;
  }

  const context = getCurrentContext();
  const dataset = datasetArg ?? context.dataset;
  const clusterAttr = clusterAttrArg ?? context.clusterAttr;

  list.textContent = "Loading attributes...";

  try {
    const response = await restRequest(dataset, clusterAttr);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const body = await response.text();
      throw new Error(`Expected JSON, got: ${body.slice(0, 120)}`);
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const attributes = Array.isArray(payload.numeric_attributes) ? payload.numeric_attributes : [];
    if (!attributes.length) {
      list.textContent = "No numeric attributes found.";
      setPanelContext(dataset, clusterAttr, []);
      return;
    }

    list.innerHTML = "";
    attributes.forEach((attributeName) => {
      const initialValue = weights && Object.prototype.hasOwnProperty.call(weights, attributeName) ? weights[attributeName] : 1;
      list.appendChild(buildWeightRow(attributeName, initialValue));
    });
    setPanelContext(dataset, clusterAttr, attributes);
    bindResetButton();
  } catch (error) {
    list.textContent = `Unable to load attributes: ${error.message}`;
    setPanelContext(dataset, clusterAttr, []);
  }
}
