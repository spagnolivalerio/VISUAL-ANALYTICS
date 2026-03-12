import { requestClassicMds } from "./api";
import { configureCentroidToggle, configureLegendToggle, parseMdsJsonResponse, renderMdsPlot } from "./mds-shared";

let resizeObserver;

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
    const response = await requestClassicMds(dataset, cluster_attr);
    const payload = await parseMdsJsonResponse(response);
    const points = payload.points || [];
    if (!points.length) {
      container.textContent = "No points returned.";
      return;
    }

    const draw = () =>
      renderMdsPlot({
        container,
        points,
        showCentroids: container.dataset.showCentroids === "true",
      });

    draw();
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
  } catch (error) {
    container.textContent = `Classic MDS request failed: ${error.message}`;
  }
}
