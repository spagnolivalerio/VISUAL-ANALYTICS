import { parseJsonResponse, requestNonPropMds } from "./api";
import { getCurrentContext } from "./app-context";
import {
  clearContinuousPreviewConfiguration,
  getContinuousPreviewConfiguration,
  isContinuousViewEnabled,
  setContinuousPreviewConfiguration,
  setContinuousViewEnabled,
} from "./continuous-view-state";
import {
  assignConfigurationToStar,
  getActiveSilhouetteView,
  getStarTarget,
  setDisplayedConfiguration,
} from "./config-selection";
import { getNextTimestep, saveConfiguration } from "./config-store";
import {
  buildKMeansLegendItems,
  kmeansSelectionState,
  loadKMeans,
  renderKMeansFromSaved,
  renderKMeansResult,
} from "./kmeans-view";
import {
  animateMdsPlotInterpolation,
  computeMdsScaleDomain,
  configureCentroidToggle,
  configureLegendToggle,
  configurePointSizeSlider,
  createSelectionState,
  renderMdsPlot,
} from "./mds-shared";
import { renderSavedScatterPlot } from "./saved-scatter-plots";
import { renderSilhouetteChart } from "./silhouette-chart";
import { renderStarGraph } from "./star-graph";
import { getWeightsFromPanel } from "./weights-panel";
import {
  clearPlotContainer,
  isShowingCentroids,
  replaceResizeObserver,
  setPlotPlaceholder,
} from "./plot-utils";

const CONTINUOUS_TOGGLE_BUTTON_ID = "continuous-view-btn";
const RUN_BUTTON_ID = "run-nonprop-btn";
const STATUS_ID = "nonprop-status";
const PREVIEW_DEBOUNCE_MS = 90;
const WEIGHT_SLIDER_STEP = 0.25;
const INTERPOLATION_SEGMENTS_PER_STEP = 4;
const MAX_INTERPOLATION_STEPS = 16;

let resizeObserver;
let lastPoints = [];
let lastResolvedConfiguration = null;
let previewDebounceTimer = null;
let previewRunVersion = 0;
let weightsChangeListenerBound = false;
let lastScaleDomains = {
  labelBased: null,
  kmeans: null,
};
let lastUseNice = true;
const nonPropSelectionState = createSelectionState();

function getContainer() {
  return document.getElementById("mds-non-proportional-container");
}

function getRunButton() {
  return document.getElementById(RUN_BUTTON_ID);
}

function getKMeansContainer() {
  return document.getElementById("kmeans-container");
}

function getContinuousViewButton() {
  return document.getElementById(CONTINUOUS_TOGGLE_BUTTON_ID);
}

function getStatusElement() {
  return document.getElementById(STATUS_ID);
}

function setStatus(message) {
  const status = getStatusElement();
  if (status) {
    status.textContent = message;
  }
}

function resolveScaleDomainsForConfiguration(configuration) {
  return {
    labelBased: computeMdsScaleDomain(configuration?.views?.labelBased?.points || []),
    kmeans: computeMdsScaleDomain(configuration?.views?.kmeans?.points || []),
  };
}

function buildWeightsSignature(weights, dataset, clusterAttr) {
  return JSON.stringify({
    dataset: dataset || null,
    clusterAttr: clusterAttr || null,
    weights,
  });
}

function resolveInterpolationStepCount(fromWeights, toWeights) {
  const weightKeys = new Set([
    ...Object.keys(fromWeights || {}),
    ...Object.keys(toWeights || {}),
  ]);
  const maxWeightDelta = Array.from(weightKeys).reduce((maxDelta, key) => {
    const fromValue = Number(fromWeights?.[key] ?? 0);
    const toValue = Number(toWeights?.[key] ?? 0);
    return Math.max(maxDelta, Math.abs(toValue - fromValue));
  }, 0);

  const sliderStepCount = Math.max(1, Math.round(maxWeightDelta / WEIGHT_SLIDER_STEP) || 1);
  return Math.min(MAX_INTERPOLATION_STEPS, sliderStepCount * INTERPOLATION_SEGMENTS_PER_STEP);
}

function syncContinuousViewControls() {
  const runButton = getRunButton();
  const toggleButton = getContinuousViewButton();
  const enabled = isContinuousViewEnabled();

  if (runButton) {
    runButton.textContent = enabled ? "Save config" : "Run MDS";
  }

  if (toggleButton) {
    toggleButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggleButton.setAttribute("aria-label", enabled ? "Continous view on" : "Continous view off");
    toggleButton.title = enabled ? "Continous view on" : "Continous view off";
  }
}

function invalidatePreviewScheduling() {
  previewRunVersion += 1;
  if (previewDebounceTimer !== null) {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = null;
  }
}

async function loadLabelBasedMds(weights, dataset, clusterAttr) {
  const payload = await parseJsonResponse(await requestNonPropMds(weights, dataset, clusterAttr));

  return {
    points: payload.points || [],
    silhouetteScore: Number.isFinite(Number(payload.silhouette_score))
      ? Number(payload.silhouette_score)
      : 0,
  };
}

function buildResolvedConfiguration(labelBased, kmeans, weights, dataset, clusterAttr) {
  return {
    dataset,
    clusterAttr,
    weights,
    weightsSignature: buildWeightsSignature(weights, dataset, clusterAttr),
    silhouetteScore: labelBased.silhouetteScore,
    silhouetteScores: {
      labelBased: labelBased.silhouetteScore,
      kmeans: kmeans.silhouetteScore,
    },
    views: {
      labelBased,
      kmeans,
    },
    points: labelBased.points,
    attributes: Object.keys(weights),
    k: kmeans.k,
  };
}

async function computeResolvedConfiguration(weights, dataset, clusterAttr) {
  const [labelBased, kmeans] = await Promise.all([
    loadLabelBasedMds(weights, dataset, clusterAttr),
    loadKMeans(dataset, clusterAttr, weights),
  ]);

  if (!labelBased.points.length || !kmeans.points.length) {
    throw new Error("No points returned.");
  }

  return buildResolvedConfiguration(labelBased, kmeans, weights, dataset, clusterAttr);
}

async function persistResolvedConfiguration(configuration) {
  const context = getCurrentContext();
  const resolvedDataset = configuration.dataset ?? context.dataset;
  const resolvedClusterAttr = configuration.clusterAttr ?? context.clusterAttr;
  const timestep = await getNextTimestep({
    dataset: resolvedDataset,
    clusterAttr: resolvedClusterAttr,
  });

  const savedConfig = await saveConfiguration({
    timestep,
    dataset: resolvedDataset,
    clusterAttr: resolvedClusterAttr,
    weights: configuration.weights,
    silhouetteScore: configuration.silhouetteScore,
    silhouetteScores: configuration.silhouetteScores,
    views: configuration.views,
    points: configuration.points,
    attributes: configuration.attributes,
    k: configuration.k,
  });

  return { savedConfig, timestep };
}

function observeResize(container) {
  resizeObserver = replaceResizeObserver(resizeObserver, container, () => {
    if (lastPoints.length) {
      drawNonPropMds(
        container,
        lastPoints,
        isShowingCentroids(container),
        lastScaleDomains.labelBased,
        lastUseNice
      );
    }
  });
}

function drawNonPropMds(container, points, showCentroids, scaleDomain = null, useNice = true) {
  renderMdsPlot({
    container,
    points,
    showCentroids,
    clearContainer: clearPlotContainer,
    scaleDomain,
    useNice,
    selectionState: nonPropSelectionState,
  });
}

function applyResolvedConfiguration(
  configuration,
  container = getContainer(),
  scaleDomains = resolveScaleDomainsForConfiguration(configuration),
  useNice = true
) {
  if (!container) {
    return;
  }

  lastResolvedConfiguration = configuration;
  lastPoints = configuration.views.labelBased.points;
  lastScaleDomains = scaleDomains;
  lastUseNice = useNice;
  drawNonPropMds(
    container,
    configuration.views.labelBased.points,
    isShowingCentroids(container),
    scaleDomains.labelBased,
    useNice
  );
  renderKMeansResult(configuration.views.kmeans, scaleDomains.kmeans, useNice);
  observeResize(container);
}

async function animateResolvedConfigurationTransition(
  fromConfiguration,
  toConfiguration,
  runVersion,
  fromScaleDomains,
  toScaleDomains
) {
  const labelContainer = getContainer();
  const kmeansContainer = getKMeansContainer();
  if (
    !labelContainer ||
    !kmeansContainer ||
    !fromConfiguration?.views?.labelBased?.points?.length ||
    !fromConfiguration?.views?.kmeans?.points?.length
  ) {
    return false;
  }

  const interpolationSteps = resolveInterpolationStepCount(
    fromConfiguration.weights,
    toConfiguration.weights
  );
  const shouldContinue = () => runVersion === previewRunVersion && isContinuousViewEnabled();

  const [labelAnimated, kmeansAnimated, silhouetteAnimated] = await Promise.all([
    animateMdsPlotInterpolation({
      container: labelContainer,
      fromPoints: fromConfiguration.views.labelBased.points,
      toPoints: toConfiguration.views.labelBased.points,
      showCentroids: isShowingCentroids(labelContainer),
      clearContainer: clearPlotContainer,
      fromScaleDomain: fromScaleDomains?.labelBased ?? null,
      toScaleDomain: toScaleDomains?.labelBased ?? null,
      useNice: false,
      interpolationSteps,
      shouldContinue,
      selectionState: nonPropSelectionState,
    }),
    animateMdsPlotInterpolation({
      container: kmeansContainer,
      fromPoints: fromConfiguration.views.kmeans.points,
      toPoints: toConfiguration.views.kmeans.points,
      showCentroids: isShowingCentroids(kmeansContainer),
      clearContainer: clearPlotContainer,
      fromScaleDomain: fromScaleDomains?.kmeans ?? null,
      toScaleDomain: toScaleDomains?.kmeans ?? null,
      useNice: false,
      legendLabels: toConfiguration.views.kmeans.legendLabels,
      colorDomain: toConfiguration.views.kmeans.colorDomain,
      legendItems: buildKMeansLegendItems(toConfiguration.views.kmeans),
      interpolationSteps,
      shouldContinue,
      selectionState: kmeansSelectionState,
    }),
    renderSilhouetteChart({
      animate: true,
      interpolationSteps,
      shouldContinue,
    }),
  ]);

  return labelAnimated && kmeansAnimated && silhouetteAnimated && shouldContinue();
}

function previewMatchesCurrentWeights(dataset, clusterAttr, weights) {
  const preview = getContinuousPreviewConfiguration();
  if (!preview) {
    return false;
  }

  return preview.weightsSignature === buildWeightsSignature(weights, dataset, clusterAttr);
}

async function renderContinuousPreview(dataset, clusterAttr, weights) {
  const container = getContainer();
  if (!container) {
    return null;
  }

  const currentVersion = ++previewRunVersion;
  setStatus("Previewing...");

  try {
    const configuration = await computeResolvedConfiguration(weights, dataset, clusterAttr);
    if (currentVersion !== previewRunVersion || !isContinuousViewEnabled()) {
      return null;
    }

    const previousConfiguration = lastResolvedConfiguration;
    const nextScaleDomains = resolveScaleDomainsForConfiguration(configuration);
    const previousScaleDomains =
      previousConfiguration && lastScaleDomains.labelBased && lastScaleDomains.kmeans
        ? lastScaleDomains
        : previousConfiguration
          ? resolveScaleDomainsForConfiguration(previousConfiguration)
          : null;
    setContinuousPreviewConfiguration(configuration);
    setDisplayedConfiguration(null);
    let transitionAnimated = false;
    if (previousConfiguration) {
      transitionAnimated = await animateResolvedConfigurationTransition(
        previousConfiguration,
        configuration,
        currentVersion,
        previousScaleDomains,
        nextScaleDomains
      );
      if (currentVersion !== previewRunVersion || !isContinuousViewEnabled()) {
        return null;
      }
    }
    applyResolvedConfiguration(configuration, container, nextScaleDomains, false);
    setStatus("Continuous preview updated.");
    if (!transitionAnimated) {
      await renderSilhouetteChart();
    }
    return configuration;
  } catch (error) {
    if (currentVersion === previewRunVersion && isContinuousViewEnabled()) {
      setStatus(`Preview failed: ${error.message}`);
    }
    return null;
  }
}

function scheduleContinuousPreview() {
  if (!isContinuousViewEnabled()) {
    return;
  }

  const { dataset, clusterAttr } = getCurrentContext();
  const weights = getWeightsFromPanel();
  if (!dataset || !clusterAttr || !Object.keys(weights).length) {
    return;
  }

  if (previewDebounceTimer !== null) {
    clearTimeout(previewDebounceTimer);
  }

  previewDebounceTimer = window.setTimeout(() => {
    previewDebounceTimer = null;
    void renderContinuousPreview(dataset, clusterAttr, weights);
  }, PREVIEW_DEBOUNCE_MS);
}

function bindWeightsChangeListener() {
  if (weightsChangeListenerBound) {
    return;
  }

  window.addEventListener("weights:change", () => {
    scheduleContinuousPreview();
  });

  weightsChangeListenerBound = true;
}

function handleSavedConfiguration(savedConfig) {
  const targetId = getStarTarget();
  setDisplayedConfiguration(savedConfig);
  if (targetId) {
    assignConfigurationToStar(targetId, savedConfig);
    const activeScore =
      getActiveSilhouetteView() === "kmeans"
        ? savedConfig.silhouetteScores?.kmeans ?? savedConfig.views?.kmeans?.silhouetteScore
        : savedConfig.silhouetteScores?.labelBased ?? savedConfig.views?.labelBased?.silhouetteScore;
    renderStarGraph(savedConfig.weights, targetId, activeScore);
    renderSavedScatterPlot(targetId);
  }
}

async function saveCurrentConfiguration() {
  const { dataset, clusterAttr } = getCurrentContext();
  const weights = getWeightsFromPanel();
  if (!dataset || !clusterAttr) {
    setStatus("Select a dataset and cluster attribute first.");
    return;
  }
  if (!Object.keys(weights).length) {
    setStatus("No weights available.");
    return;
  }

  const runButton = getRunButton();
  if (runButton) {
    runButton.disabled = true;
  }

  try {
    let configuration = null;

    if (isContinuousViewEnabled() && previewMatchesCurrentWeights(dataset, clusterAttr, weights)) {
      configuration = getContinuousPreviewConfiguration();
    } else {
      invalidatePreviewScheduling();
      setStatus("Computing...");
      configuration = await computeResolvedConfiguration(weights, dataset, clusterAttr);
      applyResolvedConfiguration(configuration);
    }

    if (!configuration) {
      throw new Error("No configuration available.");
    }

    const { savedConfig, timestep } = await persistResolvedConfiguration(configuration);
    clearContinuousPreviewConfiguration();
    handleSavedConfiguration(savedConfig);
    setStatus(`Configuration saved (t=${timestep}).`);
    await renderSilhouetteChart();
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    if (runButton) {
      runButton.disabled = false;
    }
  }
}

function bindContinuousToggleButton() {
  const toggleButton = getContinuousViewButton();
  if (!toggleButton || toggleButton.dataset.bound === "true") {
    syncContinuousViewControls();
    return;
  }

  toggleButton.addEventListener("click", async () => {
    const nextEnabled = !isContinuousViewEnabled();
    invalidatePreviewScheduling();
    setContinuousViewEnabled(nextEnabled);

    if (!nextEnabled) {
      clearContinuousPreviewConfiguration();
      syncContinuousViewControls();
      await renderSilhouetteChart();
      setStatus("Continuous view disabled.");
      return;
    }

    syncContinuousViewControls();
    setStatus("Continuous view enabled.");
    scheduleContinuousPreview();
  });

  toggleButton.dataset.bound = "true";
  syncContinuousViewControls();
}

export function renderNonPropFromSaved(config) {
  const container = getContainer();
  const points = config?.views?.labelBased?.points || config?.points;

  if (!container || !Array.isArray(points) || !points.length) {
    return;
  }

  lastPoints = points;
  lastResolvedConfiguration = config;
  const scaleDomains = resolveScaleDomainsForConfiguration(config);
  lastScaleDomains = scaleDomains;
  lastUseNice = true;
  drawNonPropMds(
    container,
    points,
    isShowingCentroids(container),
    scaleDomains.labelBased,
    true
  );

  renderKMeansFromSaved(config, scaleDomains.kmeans, true);
}

export function resetNonPropMds() {
  const container = getContainer();

  invalidatePreviewScheduling();
  lastPoints = [];
  lastResolvedConfiguration = null;
  nonPropSelectionState.clear();
  lastScaleDomains = {
    labelBased: null,
    kmeans: null,
  };
  lastUseNice = true;
  syncContinuousViewControls();

  if (container) {
    setPlotPlaceholder(
      container,
      isContinuousViewEnabled()
        ? "Adjust the weights to preview the current configuration."
        : "Adjust the weights and run MDS."
    );
  }

  setStatus("");
}

export function initNonPropMds() {
  const container = getContainer();
  const runButton = getRunButton();
  const toggleButton = document.getElementById("toggle-centroids-nonprop");
  const legendButton = document.getElementById("toggle-legend-nonprop");
  const sizeSlider = document.getElementById("point-size-nonprop");

  if (!container || !runButton) {
    return;
  }

  configureCentroidToggle(container, toggleButton);
  configureLegendToggle(container, legendButton);
  configurePointSizeSlider(container, sizeSlider);
  bindContinuousToggleButton();
  bindWeightsChangeListener();
  resetNonPropMds();

  if (runButton.dataset.bound === "true") {
    syncContinuousViewControls();
    return;
  }

  runButton.addEventListener("click", async () => {
    await saveCurrentConfiguration();
  });

  runButton.dataset.bound = "true";
  syncContinuousViewControls();
}
