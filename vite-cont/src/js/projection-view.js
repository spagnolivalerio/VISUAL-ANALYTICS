import {
  parseJsonResponse,
  requestDatasets,
  requestMdsProjection,
  requestProjectionNumericAttributes,
} from "./api";
import {
  animatePlainMdsPlotInterpolation,
  configurePointSizeSlider,
  computeMdsScaleDomain,
  renderPlainMdsPlot,
} from "./mds-shared";
import { clearPlotContainer, replaceResizeObserver, setPlotPlaceholder } from "./plot-utils";

const DEFAULT_WEIGHT = 1;
const WEIGHT_MIN = "0";
const WEIGHT_MAX = "1";
const WEIGHT_STEP = "0.01";
const LIVE_UPDATE_DEBOUNCE_MS = 90;
const INTERPOLATION_STEPS = 8;
const DEFAULT_SELECTION_HUE = 24;

let initialized = false;
let activeDataset = null;
let attributes = [];
let lastBaseResult = null;
let lastWeightedResult = null;
let baseResizeObserver = null;
let weightedResizeObserver = null;
let projectionRunVersion = 0;
let liveUpdateTimer = null;
let selectionCounter = 1;
let activeSelectionHue = DEFAULT_SELECTION_HUE;
let activeSelectionColor = hueToColor(DEFAULT_SELECTION_HUE);
let activeSelectionId = null;
const selections = [];

function getElement(id) {
  return document.getElementById(id);
}

function getBaseContainer() {
  return getElement("projection-base-container");
}

function getWeightedContainer() {
  return getElement("projection-weighted-container");
}

function getWeightsList() {
  return getElement("projection-weights-list");
}

function getStatusElement() {
  return getElement("projection-status");
}

function getSelectionsList() {
  return getElement("projection-selections-list");
}

function setStatus(message) {
  const status = getStatusElement();
  if (status) {
    status.textContent = message;
  }
}

function isProjectionVisible() {
  return !getElement("projection-view")?.hidden;
}

function notifyProjectionContextChange() {
  window.dispatchEvent(
    new CustomEvent("projection:context", {
      detail: {
        dataset: activeDataset,
      },
    })
  );
}

function formatWeight(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function normalizeWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : DEFAULT_WEIGHT;
}

function getWeights() {
  return Array.from(getWeightsList()?.querySelectorAll("input[data-attribute]") || []).reduce(
    (weights, slider) => {
      weights[slider.dataset.attribute] = Number(slider.value);
      return weights;
    },
    {}
  );
}

function invalidateLiveUpdate() {
  projectionRunVersion += 1;
  if (liveUpdateTimer !== null) {
    clearTimeout(liveUpdateTimer);
    liveUpdateTimer = null;
  }
}

function computeSharedDomain(...results) {
  const domains = results
    .filter((result) => result?.points?.length)
    .map((result) => computeMdsScaleDomain(result.points));

  if (!domains.length) {
    return null;
  }

  return {
    x: [
      Math.min(...domains.map((domain) => domain.x[0])),
      Math.max(...domains.map((domain) => domain.x[1])),
    ],
    y: [
      Math.min(...domains.map((domain) => domain.y[0])),
      Math.max(...domains.map((domain) => domain.y[1])),
    ],
  };
}

function getPointKey(pointId) {
  return String(pointId);
}

function hueToColor(hue) {
  return `hsl(${Math.round(Number(hue) || 0)} 88% 52%)`;
}

function setActiveSelectionHue(hue) {
  activeSelectionHue = Math.max(0, Math.min(360, Number(hue) || 0));
  activeSelectionColor = hueToColor(activeSelectionHue);
  const swatch = getElement("projection-selection-current-color");
  const marker = document.querySelector(".selection-color-wheel-marker");
  if (swatch) {
    swatch.style.background = activeSelectionColor;
  }
  if (marker) {
    const angle = ((activeSelectionHue - 90) * Math.PI) / 180;
    const radius = 41;
    marker.style.left = `${50 + Math.cos(angle) * radius}%`;
    marker.style.top = `${50 + Math.sin(angle) * radius}%`;
    marker.style.background = activeSelectionColor;
  }
}

function setColorPopoverOpen(open) {
  const button = getElement("projection-selection-color-btn");
  const popover = getElement("projection-selection-color-popover");
  if (!button || !popover) {
    return;
  }
  button.setAttribute("aria-expanded", open ? "true" : "false");
  popover.hidden = !open;
}

function updateColorFromWheelEvent(event) {
  const wheel = getElement("projection-selection-color-wheel");
  if (!wheel) {
    return;
  }
  activeSelectionId = null;
  const rect = wheel.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const hue = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  setActiveSelectionHue((hue + 360) % 360);
  renderSelectionList();
}

function getSelectedPointColorMap() {
  const colorByPointId = new Map();
  selections.forEach((selection) => {
    selection.pointIds.forEach((pointId) => {
      colorByPointId.set(pointId, selection.color);
    });
  });
  return colorByPointId;
}

function createSelection(pointIds) {
  const uniquePointIds = Array.from(new Set(pointIds.map(getPointKey)));
  if (!uniquePointIds.length) {
    return;
  }
  const uniquePointIdSet = new Set(uniquePointIds);
  const activeSelection = selections.find((selection) => selection.id === activeSelectionId);
  for (let index = selections.length - 1; index >= 0; index -= 1) {
    const selection = selections[index];
    if (selection === activeSelection) {
      continue;
    }
    uniquePointIdSet.forEach((pointId) => selection.pointIds.delete(pointId));
    if (!selection.pointIds.size) {
      selections.splice(index, 1);
    }
  }
  if (activeSelection) {
    uniquePointIds.forEach((pointId) => activeSelection.pointIds.add(pointId));
    renderSelectionList();
    renderResults();
    return;
  }
  const id = `selection-${Date.now()}-${selectionCounter}`;
  selections.push({
    id,
    name: `Selection ${selectionCounter}`,
    color: activeSelectionColor,
    hue: activeSelectionHue,
    pointIds: new Set(uniquePointIds),
  });
  selectionCounter += 1;
  renderSelectionList();
  renderResults();
}

function activateSelection(selectionId) {
  const selection = selections.find((item) => item.id === selectionId);
  if (!selection) {
    return;
  }
  activeSelectionId = selection.id;
  setActiveSelectionHue(selection.hue ?? activeSelectionHue);
  renderSelectionList();
}

function toggleSelectedPoint(pointId) {
  const key = getPointKey(pointId);
  const containingSelection = [...selections]
    .reverse()
    .find((selection) => selection.pointIds.has(key));
  if (containingSelection) {
    containingSelection.pointIds.delete(key);
    if (!containingSelection.pointIds.size) {
      selections.splice(selections.indexOf(containingSelection), 1);
      if (activeSelectionId === containingSelection.id) {
        activeSelectionId = null;
      }
    }
  } else {
    createSelection([key]);
    return;
  }
  renderSelectionList();
  renderResults();
}

function addSelectedPoints(pointIds) {
  createSelection(pointIds);
}

function deleteSelection(selectionId) {
  const index = selections.findIndex((selection) => selection.id === selectionId);
  if (index < 0) {
    return;
  }
  if (activeSelectionId === selectionId) {
    activeSelectionId = null;
  }
  selections.splice(index, 1);
  renderSelectionList();
  renderResults();
}

function clearSelections() {
  selections.splice(0, selections.length);
  selectionCounter = 1;
  activeSelectionId = null;
  renderSelectionList();
}

function renderSelectionList() {
  const list = getSelectionsList();
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!selections.length) {
    return;
  }
  selections.forEach((selection) => {
    const row = document.createElement("div");
    const swatch = document.createElement("button");
    const nameInput = document.createElement("input");
    const deleteButton = document.createElement("button");

    row.className = "projection-selection-row";
    if (selection.id === activeSelectionId) {
      row.classList.add("is-active");
    }
    swatch.className = "projection-selection-swatch";
    swatch.type = "button";
    swatch.style.background = selection.color;
    swatch.setAttribute("aria-label", `Use ${selection.name} color`);
    swatch.title = "Use this selection color";
    swatch.addEventListener("click", () => activateSelection(selection.id));
    nameInput.className = "projection-selection-name";
    nameInput.type = "text";
    nameInput.value = selection.name;
    nameInput.setAttribute("aria-label", "Selection name");
    nameInput.addEventListener("input", () => {
      selection.name = nameInput.value.trim() || selection.name;
    });
    deleteButton.className = "projection-selection-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${selection.name}`);
    deleteButton.title = "Delete selection";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteSelection(selection.id));

    row.append(swatch, nameInput, deleteButton);
    list.appendChild(row);
  });
}

function buildWeightRow(attribute, initialValue = DEFAULT_WEIGHT) {
  const safeId = attribute.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const row = document.createElement("div");
  const label = document.createElement("label");
  const value = document.createElement("span");
  const slider = document.createElement("input");
  row.className = "weight-row";
  label.setAttribute("for", `projection-weight-${safeId}`);
  label.textContent = attribute;
  value.className = "weight-value";
  value.textContent = formatWeight(initialValue);
  slider.type = "range";
  slider.min = WEIGHT_MIN;
  slider.max = WEIGHT_MAX;
  slider.step = WEIGHT_STEP;
  slider.value = String(normalizeWeight(initialValue));
  slider.id = `projection-weight-${safeId}`;
  slider.className = "weight-slider";
  slider.dataset.attribute = attribute;
  slider.addEventListener("input", () => {
    value.textContent = formatWeight(slider.value);
    scheduleWeightedProjectionUpdate();
  });
  row.append(label, value, slider);
  return row;
}

function renderWeights() {
  const list = getWeightsList();
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!attributes.length) {
    list.textContent = "No numeric attributes found.";
    return;
  }
  attributes.forEach((attribute) => {
    list.appendChild(buildWeightRow(attribute));
  });
}

function resetWeights() {
  getWeightsList()
    ?.querySelectorAll("input[data-attribute]")
    .forEach((slider) => {
      slider.value = String(DEFAULT_WEIGHT);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function normalizeProjection(payload) {
  return {
    points: Array.isArray(payload.points) ? payload.points : [],
    stress: Number.isFinite(Number(payload.stress)) ? Number(payload.stress) : null,
  };
}

function drawProjection(container, result, scaleDomain = null) {
  if (!container || !result?.points?.length) {
    return;
  }
  renderPlainMdsPlot({
    container,
    points: result.points,
    clearContainer: clearPlotContainer,
    scaleDomain,
    useNice: false,
    selectedPointIds: getSelectedPointColorMap(),
    onPointToggle: toggleSelectedPoint,
    onLassoSelect: addSelectedPoints,
    lassoColor: activeSelectionColor,
  });
}

function renderResults() {
  if (!isProjectionVisible()) {
    return;
  }
  const baseContainer = getBaseContainer();
  const weightedContainer = getWeightedContainer();
  const sharedDomain = computeSharedDomain(lastBaseResult, lastWeightedResult);

  drawProjection(baseContainer, lastBaseResult, sharedDomain);
  drawProjection(weightedContainer, lastWeightedResult, sharedDomain);
}

function bindResizeObservers() {
  const baseContainer = getBaseContainer();
  const weightedContainer = getWeightedContainer();
  if (baseContainer) {
    baseResizeObserver = replaceResizeObserver(baseResizeObserver, baseContainer, renderResults);
  }
  if (weightedContainer) {
    weightedResizeObserver = replaceResizeObserver(
      weightedResizeObserver,
      weightedContainer,
      renderResults
    );
  }
}

async function loadDatasets() {
  const payload = await parseJsonResponse(await requestDatasets());
  const datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
  activeDataset = activeDataset && datasets.includes(activeDataset) ? activeDataset : datasets[0] || null;
  notifyProjectionContextChange();
}

async function loadAttributes() {
  if (!activeDataset) {
    attributes = [];
    renderWeights();
    return;
  }
  const payload = await parseJsonResponse(await requestProjectionNumericAttributes(activeDataset));
  attributes = Array.isArray(payload.numeric_attributes) ? payload.numeric_attributes : [];
  renderWeights();
}

async function runProjection() {
  if (!activeDataset) {
    setStatus("Select a dataset first.");
    return;
  }
  const currentVersion = ++projectionRunVersion;
  setStatus("Computing projection...");

  try {
    const weights = getWeights();
    const [baseResponse, weightedResponse] = await Promise.all([
      requestMdsProjection(activeDataset),
      requestMdsProjection(activeDataset, weights),
    ]);
    const [basePayload, weightedPayload] = await Promise.all([
      parseJsonResponse(baseResponse),
      parseJsonResponse(weightedResponse),
    ]);
    if (currentVersion !== projectionRunVersion) {
      return;
    }
    lastBaseResult = normalizeProjection(basePayload);
    lastWeightedResult = normalizeProjection(weightedPayload);
    renderResults();
    setStatus("Projection updated.");
  } catch (error) {
    if (currentVersion === projectionRunVersion) {
      setStatus(`Projection failed: ${error.message}`);
    }
  }
}

async function updateWeightedProjection(currentVersion = ++projectionRunVersion) {
  if (!activeDataset || !attributes.length) {
    return;
  }

  const previousWeightedResult = lastWeightedResult;
  const weights = getWeights();
  setStatus("Updating projection...");

  try {
    const payload = normalizeProjection(
      await parseJsonResponse(await requestMdsProjection(activeDataset, weights))
    );
    if (currentVersion !== projectionRunVersion) {
      return;
    }

    const baseContainer = getBaseContainer();
    const weightedContainer = getWeightedContainer();
    const fromDomain = computeSharedDomain(lastBaseResult, previousWeightedResult);
    const toDomain = computeSharedDomain(lastBaseResult, payload);

    if (
      previousWeightedResult?.points?.length &&
      weightedContainer &&
      isProjectionVisible()
    ) {
      const shouldContinue = () => currentVersion === projectionRunVersion;
      await Promise.all([
        lastBaseResult?.points?.length && baseContainer
          ? animatePlainMdsPlotInterpolation({
              container: baseContainer,
              fromPoints: lastBaseResult.points,
              toPoints: lastBaseResult.points,
              clearContainer: clearPlotContainer,
              fromScaleDomain: fromDomain,
              toScaleDomain: toDomain,
              useNice: false,
              selectedPointIds: getSelectedPointColorMap(),
              interpolationSteps: INTERPOLATION_STEPS,
              shouldContinue,
            })
          : Promise.resolve(false),
        animatePlainMdsPlotInterpolation({
          container: weightedContainer,
          fromPoints: previousWeightedResult.points,
          toPoints: payload.points,
          clearContainer: clearPlotContainer,
          fromScaleDomain: fromDomain,
          toScaleDomain: toDomain,
          useNice: false,
          selectedPointIds: getSelectedPointColorMap(),
          interpolationSteps: INTERPOLATION_STEPS,
          shouldContinue,
        }),
      ]);
      if (currentVersion !== projectionRunVersion) {
        return;
      }
    }

    lastWeightedResult = payload;
    renderResults();
    setStatus("Projection updated.");
  } catch (error) {
    if (currentVersion === projectionRunVersion) {
      setStatus(`Projection update failed: ${error.message}`);
    }
  }
}

function scheduleWeightedProjectionUpdate() {
  if (!activeDataset || !attributes.length) {
    return;
  }

  const scheduledVersion = ++projectionRunVersion;
  if (liveUpdateTimer !== null) {
    clearTimeout(liveUpdateTimer);
  }

  liveUpdateTimer = window.setTimeout(() => {
    liveUpdateTimer = null;
    void updateWeightedProjection(scheduledVersion);
  }, LIVE_UPDATE_DEBOUNCE_MS);
}

export async function setProjectionDataset(dataset, { run = true } = {}) {
  invalidateLiveUpdate();
  activeDataset = dataset || null;
  lastBaseResult = null;
  lastWeightedResult = null;
  clearSelections();
  setPlotPlaceholder(getBaseContainer(), "Computing the unweighted projection.");
  setPlotPlaceholder(getWeightedContainer(), "Computing the weighted projection.");
  notifyProjectionContextChange();
  setStatus("Loading attributes...");
  try {
    await loadAttributes();
    setStatus("Attributes loaded.");
    if (run) {
      await runProjection();
    }
  } catch (error) {
    setStatus(`Unable to load dataset: ${error.message}`);
  }
}

export function resetProjectionView() {
  invalidateLiveUpdate();
  activeDataset = null;
  attributes = [];
  lastBaseResult = null;
  lastWeightedResult = null;
  clearSelections();
  renderWeights();
  setPlotPlaceholder(getBaseContainer(), "Choose a dataset to render MDS.");
  setPlotPlaceholder(getWeightedContainer(), "Choose a dataset to render MDS.");
  setStatus("");
  notifyProjectionContextChange();
}

export function getProjectionDataset() {
  return activeDataset;
}

export async function activateProjectionView() {
  renderResults();
  if (!lastBaseResult && activeDataset) {
    await runProjection();
  }
}

function bindControls() {
  getElement("reset-projection-weights-btn")?.addEventListener("click", resetWeights);
  getElement("projection-selection-color-btn")?.addEventListener("click", () => {
    const popover = getElement("projection-selection-color-popover");
    setColorPopoverOpen(Boolean(popover?.hidden));
  });
  getElement("projection-selection-color-wheel")?.addEventListener("click", updateColorFromWheelEvent);
  document.addEventListener("click", (event) => {
    const control = document.querySelector(".selection-color-control");
    if (control && !control.contains(event.target)) {
      setColorPopoverOpen(false);
    }
  });
  setActiveSelectionHue(activeSelectionHue);
  renderSelectionList();
  configurePointSizeSlider(getBaseContainer(), getElement("point-size-projection-global"));
  configurePointSizeSlider(getWeightedContainer(), getElement("point-size-projection-global"));
}

export async function initProjectionView() {
  if (initialized) {
    return;
  }
  initialized = true;
  bindControls();
  bindResizeObservers();
  setPlotPlaceholder(getBaseContainer(), "Choose a dataset to render MDS.");
  setPlotPlaceholder(getWeightedContainer(), "Choose a dataset to render MDS.");

  try {
    await loadDatasets();
    await loadAttributes();
    setStatus(activeDataset ? "Ready." : "No datasets available.");
  } catch (error) {
    setStatus(`Unable to initialize projection view: ${error.message}`);
  }
}
