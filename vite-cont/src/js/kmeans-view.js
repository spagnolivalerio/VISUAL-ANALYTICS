import { parseJsonResponse, requestKMeans } from "./api";
import { getCurrentContext } from "./app-context";
import { configureCentroidToggle, configureLegendToggle, createSelectionState, renderMdsPlot } from "./mds-shared";

let resizeObserver;
let lastResult = null;
const kmeansSelectionState = createSelectionState();

function getContainer() {
  return document.getElementById("kmeans-container");
}

function getKValueElement() {
  return document.getElementById("kmeans-k-value");
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
  return "Adjust weights and run MDS.";
}

function setKValue(value) {
  const element = getKValueElement();
  if (!element) {
    return;
  }

  element.textContent = Number.isFinite(Number(value)) ? String(Number(value)) : "-";
}

export async function loadKMeans(dataset, clusterAttr, weights = null) {
  const payload = await parseJsonResponse(await requestKMeans(dataset, clusterAttr, weights));

  return {
    k: Number(payload.k),
    silhouetteScore: Number.isFinite(Number(payload.silhouette_score))
      ? Number(payload.silhouette_score)
      : 0,
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

export function renderKMeansResult(result) {
  const container = getContainer();
  if (!container || !result?.points?.length) {
    return;
  }

  lastResult = result;
  drawKMeans(container, result);
  observeResize(container);
  setKValue(result.k);
}

export function renderKMeansFromSaved(config) {
  const result = config?.views?.kmeans;
  if (!result?.points?.length) {
    return;
  }

  renderKMeansResult(result);
}

export function resetKMeansView() {
  const container = getContainer();

  resizeObserver?.disconnect();
  resizeObserver = null;
  lastResult = null;
  kmeansSelectionState.clear();
  setKValue(null);

  if (!container) {
    return;
  }

  setPlaceholder(container, resolveIdleMessage());
}

export function initKMeansView() {
  const container = getContainer();
  const toggleButton = document.getElementById("toggle-centroids-kmeans");
  const legendButton = document.getElementById("toggle-legend-kmeans");

  if (!container || !toggleButton || !legendButton) {
    return;
  }

  configureCentroidToggle(container, toggleButton);
  configureLegendToggle(container, legendButton);
  resetKMeansView();

}
