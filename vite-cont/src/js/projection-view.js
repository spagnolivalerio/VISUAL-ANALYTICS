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

let initialized = false;
let activeDataset = null;
let attributes = [];
let lastBaseResult = null;
let lastWeightedResult = null;
let baseResizeObserver = null;
let weightedResizeObserver = null;
let projectionRunVersion = 0;
let liveUpdateTimer = null;

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
  configurePointSizeSlider(getBaseContainer(), getElement("point-size-projection-base"));
  configurePointSizeSlider(getWeightedContainer(), getElement("point-size-projection-weighted"));
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
