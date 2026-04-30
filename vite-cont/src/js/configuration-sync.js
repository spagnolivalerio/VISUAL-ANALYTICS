import { getCurrentContext } from "./app-context";
import { getAssignedConfiguration, setDisplayedConfiguration } from "./config-selection";
import { configurationMatchesContext } from "./config-store";
import { renderNonPropFromSaved } from "./mds-nonprop";
import { renderSilhouetteChart } from "./silhouette-chart";
import { applyWeightsToPanel, renderWeightsPanel } from "./weights-panel";

function getStatusElement() {
  return document.getElementById("nonprop-status");
}

function setStatus(message) {
  const status = getStatusElement();
  if (status) {
    status.textContent = message;
  }
}

async function syncConfigurationToPanel(targetId) {
  const config = getAssignedConfiguration(targetId);
  if (!config) {
    setStatus("No configuration associated with this star graph.");
    return;
  }

  const context = getCurrentContext();
  if (!configurationMatchesContext(config, context)) {
    setStatus("The selected configuration belongs to a different dataset or cluster attribute.");
    return;
  }

  renderNonPropFromSaved(config);
  setDisplayedConfiguration(config);

  const applied = applyWeightsToPanel(config.weights);
  if (!applied) {
    await renderWeightsPanel(config.weights, config.dataset, config.clusterAttr);
  }

  setStatus(`Configuration t=${config.timestep} synchronized.`);
  await renderSilhouetteChart();
}

export function initConfigurationSync() {
  const buttons = document.querySelectorAll(".sync-btn[data-target]");
  buttons.forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await syncConfigurationToPanel(button.dataset.target);
      } catch (error) {
        setStatus(`Sync failed: ${error.message}`);
      }
    });

    button.dataset.bound = "true";
  });
}
