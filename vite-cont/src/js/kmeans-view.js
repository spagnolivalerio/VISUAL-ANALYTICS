import { parseJsonResponse, requestKMeans } from "./api";
import { getCurrentContext } from "./app-context";
import { configureCentroidToggle, configureLegendToggle, createSelectionState, renderMdsPlot } from "./mds-shared";

let resizeObserver;
let lastResult = null;
const kmeansSelectionState = createSelectionState();
const DEFAULT_K = 3;
const MIN_K = 2;

function getContainer() {
  return document.getElementById("kmeans-container");
}

function getStatusElement() {
  return document.getElementById("kmeans-status");
}

function getRunButton() {
  return document.getElementById("run-kmeans-btn");
}

function getKInput() {
  return document.getElementById("kmeans-k-input");
}

function setStatus(message) {
  const status = getStatusElement();
  if (status) {
    status.textContent = message;
  }
}

function setPlaceholder(container, message) {
  container.classList.add("plot-placeholder");
  container.textContent = message;
}

function resolveIdleMessage() {
  const { dataset, clusterAttr } = getCurrentContext();
  if (!dataset) {
    return "Select a dataset to enable KMeans.";
  }
  if (!clusterAttr) {
    return "Select a cluster attribute before running KMeans.";
  }
  return "Enter a value for k and run KMeans.";
}

function normalizeKValue(rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_K;
  }

  return Math.max(MIN_K, Math.round(numeric));
}

function syncKInputValue() {
  const input = getKInput();
  if (!input) {
    return DEFAULT_K;
  }

  const nextValue = normalizeKValue(input.valueAsNumber);
  input.value = String(nextValue);
  return nextValue;
}

async function loadKMeans(kValue, dataset, clusterAttr) {
  const payload = await parseJsonResponse(await requestKMeans(kValue, dataset, clusterAttr));

  return {
    k: Number(payload.k),
    legendLabels: Array.isArray(payload.legend_labels) ? payload.legend_labels : [],
    colorDomain: Array.isArray(payload.color_domain) ? payload.color_domain : [],
    clusterLabelMapping: Array.isArray(payload.cluster_label_mapping)
      ? payload.cluster_label_mapping
      : [],
    points: Array.isArray(payload.points) ? payload.points : [],
  };
}

function buildLegendItems(result) {
  const mappingByCluster = new Map(
    result.clusterLabelMapping.map((item) => [item.kmeans_label, item])
  );

  return result.legendLabels.map((label) => {
    const mapping = mappingByCluster.get(label);
    if (!mapping) {
      return { label, colorLabel: label };
    }

    const jaccard = Number(mapping.jaccard);
    return {
      label: mapping.matched
        ? `${mapping.kmeans_label} -> ${mapping.matched_label}`
        : `${mapping.kmeans_label} (extra)`,
      colorLabel: mapping.color_key,
      title: mapping.matched && Number.isFinite(jaccard)
        ? `Jaccard: ${jaccard.toFixed(3)}`
        : "Extra KMeans cluster without a matched source label",
    };
  });
}

function drawKMeans(container, result) {
  renderMdsPlot({
    container,
    points: result.points,
    showCentroids: container.dataset.showCentroids === "true",
    clearContainer: (node) => {
      node.classList.remove("plot-placeholder");
      node.innerHTML = "";
    },
    legendLabels: result.legendLabels,
    colorDomain: result.colorDomain,
    legendItems: buildLegendItems(result),
    selectionState: kmeansSelectionState,
  });
}

function observeResize(container) {
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => {
    if (lastResult?.points?.length) {
      drawKMeans(container, lastResult);
    }
  });
  resizeObserver.observe(container);
}

async function runKMeans() {
  const container = getContainer();
  const input = getKInput();
  const runButton = getRunButton();
  const { dataset, clusterAttr } = getCurrentContext();

  if (!container || !input || !runButton) {
    return;
  }
  if (!dataset || !clusterAttr) {
    setStatus("Select a dataset and cluster attribute first.");
    if (!lastResult) {
      setPlaceholder(container, resolveIdleMessage());
    }
    return;
  }

  const kValue = syncKInputValue();

  runButton.disabled = true;
  setStatus("Computing KMeans...");
  if (!lastResult) {
    setPlaceholder(container, "Computing KMeans clusters...");
  }

  try {
    const result = await loadKMeans(kValue, dataset, clusterAttr);
    if (!result.points.length) {
      throw new Error("No points returned.");
    }

    lastResult = result;
    drawKMeans(container, result);
    observeResize(container);
    setStatus(`KMeans ready with k=${result.k}.`);
  } catch (error) {
    if (!lastResult) {
      setPlaceholder(container, `KMeans request failed: ${error.message}`);
    }
    setStatus(`KMeans request failed: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
}

export function resetKMeansView() {
  const container = getContainer();
  const input = getKInput();
  const runButton = getRunButton();
  const { dataset, clusterAttr } = getCurrentContext();

  resizeObserver?.disconnect();
  resizeObserver = null;
  lastResult = null;
  kmeansSelectionState.clear();
  setStatus("");

  if (input) {
    input.disabled = !dataset || !clusterAttr;
    input.value = String(normalizeKValue(input.valueAsNumber));
  }
  if (runButton) {
    runButton.disabled = !dataset || !clusterAttr;
  }

  if (!container) {
    return;
  }

  setPlaceholder(container, resolveIdleMessage());
}

export function initKMeansView() {
  const container = getContainer();
  const toggleButton = document.getElementById("toggle-centroids-kmeans");
  const legendButton = document.getElementById("toggle-legend-kmeans");
  const runButton = getRunButton();
  const input = getKInput();

  if (!container || !toggleButton || !legendButton || !runButton || !input) {
    return;
  }

  configureCentroidToggle(container, toggleButton);
  configureLegendToggle(container, legendButton);
  resetKMeansView();

  if (runButton.dataset.bound !== "true") {
    runButton.addEventListener("click", runKMeans);
    runButton.dataset.bound = "true";
  }

  if (input.dataset.bound !== "true") {
    input.addEventListener("change", syncKInputValue);
    input.addEventListener("blur", syncKInputValue);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runKMeans();
      }
    });
    input.dataset.bound = "true";
  }
}
