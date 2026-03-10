import { renderClassicMds } from "./mds-classic";
import { initNonPropMds } from "./mds-nonprop";
import { renderWeightsPanel } from "./weights-panel";
import { renderRateoChart } from "./rateo-chart";
import { renderStarGraph } from "./star-graph";
import { setupStarSelection } from "./star-selection";
import { getConfigurationById } from "./config-store";
import { renderNonPropFromSaved } from "./mds-nonprop";

initNonPropMds();
renderClassicMds();
renderWeightsPanel(null);
renderRateoChart();
renderStarGraph(null, "star-graph-1");
renderStarGraph(null, "star-graph-2");
setupStarSelection();

const syncButtons = document.querySelectorAll(".sync-btn[data-target]");
syncButtons.forEach((btn) => {
  btn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const targetId = btn.dataset.target;
    const selections = window.__starSelections || {};
    const timestep = selections[targetId];
    if (timestep === undefined) {
      return;
    }
    const selectedId = window.__starSelectionsId?.[targetId];
    if (!selectedId) {
      return;
    }
    const config = await getConfigurationById(selectedId);
    if (config?.points?.length) {
      renderNonPropFromSaved(config.points, config.timestep);
      renderWeightsPanel(config?.weights)
    }
  });
});
