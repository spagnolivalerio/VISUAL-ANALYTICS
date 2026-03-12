import { requestClassicMds } from "./api";
import { configureCentroidToggle, configureLegendToggle, parseMdsJsonResponse, renderMdsPlot } from "./mds-shared";

let resizeObserver;

async function loadClassicPoints(dataset, clusterAttr) {
  const response = await requestClassicMds(dataset, clusterAttr);
  const payload = await parseMdsJsonResponse(response);
  return payload.points || [];
}

function observeResize(container, points) {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  resizeObserver = new ResizeObserver(() =>
    drawClassicMds(container, points, container.dataset.showCentroids === "true")
  );
  resizeObserver.observe(container);
}

function drawClassicMds(container, points, showCentroids) {
  renderMdsPlot({ container, points, showCentroids });
}

export async function renderClassicMds(dataset, cluster_attr) {
  const container = document.getElementById("mds-classic-container");
  const toggleButton = document.getElementById("toggle-centroids-classic");
  const legendButton = document.getElementById("toggle-legend-classic");
  if (!container) {
    return;
  }

  configureCentroidToggle(container, toggleButton);
  configureLegendToggle(container, legendButton);

  container.textContent = "Loading MDS classic points...";

  try {
    const points = await loadClassicPoints(dataset, cluster_attr);
    if (!points.length) {
      container.textContent = "No points returned.";
      return;
    }

    drawClassicMds(container, points, container.dataset.showCentroids === "true");
    observeResize(container, points);
  } catch (error) {
    container.textContent = `Classic MDS request failed: ${error.message}`;
  }
}
