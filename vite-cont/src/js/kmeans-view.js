import { parseJsonResponse, requestKMeans } from "./api";
import { getCurrentContext } from "./app-context";
import {
  configureCentroidToggle,
  configureLegendToggle,
  configurePointSizeSlider,
  createSelectionState,
  renderMdsPlot,
} from "./mds-shared";
import {
  clearPlotContainer,
  isShowingCentroids,
  replaceResizeObserver,
  setPlotPlaceholder,
} from "./plot-utils";

let resizeObserver;
let lastResult = null;
let lastScaleDomain = null;
let lastUseNice = true;
export const kmeansSelectionState = createSelectionState();

function getContainer() {
  return document.getElementById("kmeans-container");
}

function getKValueElement() {
  return document.getElementById("kmeans-k-value");
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

export function buildKMeansLegendItems(result) {
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

function drawKMeans(container, result, scaleDomain = null, useNice = true) {
  renderMdsPlot({
    container,
    points: result.points,
    showCentroids: isShowingCentroids(container),
    clearContainer: clearPlotContainer,
    scaleDomain,
    useNice,
    legendLabels: result.legendLabels,
    colorDomain: result.colorDomain,
    legendItems: buildKMeansLegendItems(result),
    selectionState: kmeansSelectionState,
  });
}

function observeResize(container) {
  resizeObserver = replaceResizeObserver(resizeObserver, container, () => {
    if (lastResult?.points?.length) {
      drawKMeans(container, lastResult, lastScaleDomain, lastUseNice);
    }
  });
}

export function renderKMeansResult(result, scaleDomain = null, useNice = true) {
  const container = getContainer();
  if (!container || !result?.points?.length) {
    return;
  }

  lastResult = result;
  lastScaleDomain = scaleDomain;
  lastUseNice = useNice;
  drawKMeans(container, result, scaleDomain, useNice);
  observeResize(container);
  setKValue(result.k);
}

export function renderKMeansFromSaved(config, scaleDomain = null, useNice = true) {
  const result = config?.views?.kmeans;
  if (!result?.points?.length) {
    return;
  }

  renderKMeansResult(result, scaleDomain, useNice);
}

export function resetKMeansView() {
  const container = getContainer();

  resizeObserver?.disconnect();
  resizeObserver = null;
  lastResult = null;
  lastScaleDomain = null;
  lastUseNice = true;
  kmeansSelectionState.clear();
  setKValue(null);

  if (!container) {
    return;
  }

  setPlotPlaceholder(container, resolveIdleMessage());
}

export function initKMeansView() {
  const container = getContainer();
  const toggleButton = document.getElementById("toggle-centroids-kmeans");
  const legendButton = document.getElementById("toggle-legend-kmeans");
  const sizeSlider = document.getElementById("point-size-cluster-global");

  if (!container || !toggleButton || !legendButton) {
    return;
  }

  configureCentroidToggle(container, toggleButton);
  configureLegendToggle(container, legendButton);
  configurePointSizeSlider(container, sizeSlider);
  resetKMeansView();

}
