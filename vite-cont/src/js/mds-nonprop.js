import { parseJsonResponse, requestNonPropMds } from "./api";
import { getCurrentContext } from "./app-context";
import {
  assignConfigurationToStar,
  getActiveSilhouetteView,
  getStarTarget,
  setDisplayedConfiguration,
} from "./config-selection";
import { getNextTimestep, saveConfiguration } from "./config-store";
import { loadKMeans, renderKMeansFromSaved, renderKMeansResult } from "./kmeans-view";
import { configureCentroidToggle, configureLegendToggle, createSelectionState, renderMdsPlot } from "./mds-shared";
import { renderSilhouetteChart } from "./silhouette-chart";
import { renderStarGraph } from "./star-graph";
import { getWeightsFromPanel } from "./weights-panel";

let resizeObserver;
let lastPoints = [];
const nonPropSelectionState = createSelectionState();

async function loadLabelBasedMds(weights, dataset, clusterAttr) {
  const payload = await parseJsonResponse(await requestNonPropMds(weights, dataset, clusterAttr));

  return {
    points: payload.points || [],
    silhouetteScore: Number.isFinite(Number(payload.silhouette_score))
      ? Number(payload.silhouette_score)
      : 0,
  };
}

async function persistConfiguration(labelBased, kmeans, weights, dataset, clusterAttr) {
  const context = getCurrentContext();
  const resolvedDataset = dataset ?? context.dataset;
  const resolvedClusterAttr = clusterAttr ?? context.clusterAttr;
  const timestep = await getNextTimestep({
    dataset: resolvedDataset,
    clusterAttr: resolvedClusterAttr,
  });

  const savedConfig = await saveConfiguration({
    timestep,
    dataset: resolvedDataset,
    clusterAttr: resolvedClusterAttr,
    weights,
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
  });

  return { savedConfig, timestep };
}

function observeResize(container) {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  resizeObserver = new ResizeObserver(() => {
    if (lastPoints.length) {
      drawNonPropMds(container, lastPoints, container.dataset.showCentroids === "true");
    }
  });
  resizeObserver.observe(container);
}

function drawNonPropMds(container, points, showCentroids) {
  renderMdsPlot({
    container,
    points,
    showCentroids,
    clearContainer: (node) => {
      node.classList.remove("plot-placeholder");
      node.innerHTML = "";
    },
    selectionState: nonPropSelectionState,
  });
}

export function renderNonPropFromSaved(config) {
  const container = document.getElementById("mds-non-proportional-container");
  const points = config?.views?.labelBased?.points || config?.points;

  if (!container || !Array.isArray(points) || !points.length) {
    return;
  }

  lastPoints = points;
  drawNonPropMds(container, points, container.dataset.showCentroids === "true");

  renderKMeansFromSaved(config);
}

export function resetNonPropMds() {
  const container = document.getElementById("mds-non-proportional-container");
  const status = document.getElementById("nonprop-status");

  lastPoints = [];
  nonPropSelectionState.clear();

  if (container) {
    container.classList.add("plot-placeholder");
    container.textContent = "Adjust the weights and run MDS.";
  }

  if (status) {
    status.textContent = "";
  }

}

export function initNonPropMds() {
  const container = document.getElementById("mds-non-proportional-container");
  const runButton = document.getElementById("run-nonprop-btn");
  const status = document.getElementById("nonprop-status");
  const toggleButton = document.getElementById("toggle-centroids-nonprop");
  const legendButton = document.getElementById("toggle-legend-nonprop");

  if (!container || !runButton || !status) {
    return;
  }

  configureCentroidToggle(container, toggleButton);
  configureLegendToggle(container, legendButton);

  resetNonPropMds();

  if (runButton.dataset.bound === "true") {
    return;
  }

  runButton.addEventListener("click", async () => {
    const { dataset, clusterAttr } = getCurrentContext();
    const weights = getWeightsFromPanel();
    if (!dataset || !clusterAttr) {
      status.textContent = "Select a dataset and cluster attribute first.";
      return;
    }
    if (!Object.keys(weights).length) {
      status.textContent = "No weights available.";
      return;
    }

    runButton.disabled = true;
    status.textContent = "Computing...";

    try {
      const [labelBased, kmeans] = await Promise.all([
        loadLabelBasedMds(weights, dataset, clusterAttr),
        loadKMeans(dataset, clusterAttr, weights),
      ]);

      if (!labelBased.points.length || !kmeans.points.length) {
        throw new Error("No points returned.");
      }

      lastPoints = labelBased.points;
      drawNonPropMds(container, labelBased.points, container.dataset.showCentroids === "true");
      renderKMeansResult(kmeans);

      const targetId = getStarTarget();
      try {
        const { savedConfig, timestep } = await persistConfiguration(
          labelBased,
          kmeans,
          weights,
          dataset,
          clusterAttr
        );
        status.textContent = `Configuration saved (t=${timestep}).`;
        setDisplayedConfiguration(savedConfig);
        if (targetId) {
          assignConfigurationToStar(targetId, savedConfig);
          const activeScore =
            getActiveSilhouetteView() === "kmeans"
              ? kmeans.silhouetteScore
              : labelBased.silhouetteScore;
          renderStarGraph(weights, targetId, activeScore);
        }
        renderSilhouetteChart();
      } catch (error) {
        status.textContent = `Save failed: ${error.message}`;
      }

      observeResize(container);
    } catch (error) {
      status.textContent = `Errore: ${error.message}`;
    } finally {
      runButton.disabled = false;
    }
  });

  runButton.dataset.bound = "true";
}
