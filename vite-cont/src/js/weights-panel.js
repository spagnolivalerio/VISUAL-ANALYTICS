import { requestNumericAttributes } from "./api";
import { getCurrentContext } from "./app-context";

const DEFAULT_WEIGHT = 1;
const WEIGHT_STEP = "0.25";
const WEIGHT_MIN = "0";
const WEIGHT_MAX = "1";
const LOADING_MESSAGE = "Loading attributes...";
const NO_ATTRIBUTES_MESSAGE = "No numeric attributes found.";

function formatWeight(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function normalizeWeightValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_WEIGHT;
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
  slider.value = String(normalizeWeightValue(nextValue));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

function createSliderLabel(attributeName, safeId) {
  const label = document.createElement("label");
  label.setAttribute("for", `weight-${safeId}`);
  label.textContent = attributeName;
  return label;
}

function createSliderValue(initialValue) {
  const value = document.createElement("span");
  value.className = "weight-value";
  value.textContent = formatWeight(initialValue);
  return value;
}

function createWeightSlider(attributeName, safeId, initialValue, valueElement) {
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = WEIGHT_MIN;
  slider.max = WEIGHT_MAX;
  slider.step = WEIGHT_STEP;
  slider.value = String(normalizeWeightValue(initialValue));
  slider.id = `weight-${safeId}`;
  slider.className = "weight-slider";
  slider.dataset.attribute = attributeName;

  slider.addEventListener("input", () => {
    valueElement.textContent = formatWeight(slider.value);
  });

  return slider;
}

function buildWeightRow(attributeName, initialValue = DEFAULT_WEIGHT) {
  const safeId = attributeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const row = document.createElement("div");
  row.className = "weight-row";

  const label = createSliderLabel(attributeName, safeId);
  const value = createSliderValue(initialValue);
  const slider = createWeightSlider(attributeName, safeId, initialValue, value);

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(slider);
  return row;
}

function getResolvedContext(datasetArg, clusterAttrArg) {
  const context = getCurrentContext();
  return {
    dataset: datasetArg ?? context.dataset,
    clusterAttr: clusterAttrArg ?? context.clusterAttr,
  };
}

function setPanelMessage(message) {
  const list = getWeightsList();
  if (!list) {
    return;
  }

  list.textContent = message;
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

function parsePanelAttributes(rawAttributes) {
  try {
    return JSON.parse(rawAttributes || "[]");
  } catch (error) {
    return [];
  }
}

async function loadNumericAttributes(dataset, clusterAttr) {
  const response = await requestNumericAttributes(dataset, clusterAttr);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(`Expected JSON, got: ${body.slice(0, 120)}`);
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return Array.isArray(payload.numeric_attributes) ? payload.numeric_attributes : [];
}

function getInitialWeight(weights, attributeName) {
  if (!weights || !Object.prototype.hasOwnProperty.call(weights, attributeName)) {
    return DEFAULT_WEIGHT;
  }

  return weights[attributeName];
}

function renderWeightRows(attributes, weights) {
  const list = getWeightsList();
  if (!list) {
    return;
  }

  list.innerHTML = "";
  attributes.forEach((attributeName) => {
    list.appendChild(buildWeightRow(attributeName, getInitialWeight(weights, attributeName)));
  });
}

function hasAllWeights(weights, attributes) {
  return attributes.every((attribute) => Object.prototype.hasOwnProperty.call(weights, attribute));
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

export function getWeightsFromPanel() {
  return getSliderElements().reduce((weights, slider) => {
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
  if (!hasAllWeights(weights, attributes)) {
    return false;
  }

  sliders.forEach((slider) => {
    setSliderValue(slider, weights[slider.dataset.attribute]);
  });
  return true;
}

export function resetWeightsPanel() {
  getSliderElements().forEach((slider) => {
    setSliderValue(slider, DEFAULT_WEIGHT);
  });
}

export function getRenderedPanelContext() {
  const list = getWeightsList();
  if (!list) {
    return null;
  }

  return {
    dataset: list.dataset.dataset || null,
    clusterAttr: list.dataset.clusterAttr || null,
    attributes: parsePanelAttributes(list.dataset.attributes),
  };
}

export async function renderWeightsPanel(weights = null, datasetArg, clusterAttrArg) {
  const list = getWeightsList();
  if (!list) {
    return;
  }

  const { dataset, clusterAttr } = getResolvedContext(datasetArg, clusterAttrArg);
  setPanelMessage(LOADING_MESSAGE);

  try {
    const attributes = await loadNumericAttributes(dataset, clusterAttr);
    if (!attributes.length) {
      setPanelMessage(NO_ATTRIBUTES_MESSAGE);
      setPanelContext(dataset, clusterAttr, []);
      return;
    }

    renderWeightRows(attributes, weights);
    setPanelContext(dataset, clusterAttr, attributes);
    bindResetButton();
  } catch (error) {
    setPanelMessage(`Unable to load attributes: ${error.message}`);
    setPanelContext(dataset, clusterAttr, []);
  }
}
