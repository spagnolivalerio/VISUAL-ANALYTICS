import { clearCurrentContext, getCurrentContext } from "./app-context";
import {
  clearContinuousPreviewConfiguration,
  resetContinuousViewState,
} from "./continuous-view-state";
import { resetConfigurationSelectionState } from "./config-selection";
import { resetConfigurations } from "./config-store";
import { initConfigurationSync } from "./configuration-sync";
import { initKMeansView, resetKMeansView } from "./kmeans-view";
import { initNonPropMds, resetNonPropMds } from "./mds-nonprop";
import { renderSavedScatterPlots } from "./saved-scatter-plots";
import { renderSilhouetteChart } from "./silhouette-chart";
import { initSidebar } from "./sidebar";
import { setSelectedStarTarget, setupStarSelection } from "./star-selection";
import { renderWeightsPanel, resetWeightsPanel } from "./weights-panel";

const DATASET_BADGE_ID = "topbar-dataset";
const ATTRIBUTE_BADGE_ID = "topbar-attribute";
const STATUS_TEXT_ID = "topbar-status";
const REFRESH_BUTTON_ID = "refresh-dashboard-btn";
const RESET_BUTTON_ID = "reset-weights-btn";

let initialized = false;

function getBadgeElement(id) {
  return document.getElementById(id);
}

function updateBadge(id, value, emptyLabel) {
  const element = getBadgeElement(id);
  if (!element) {
    return;
  }

  element.textContent = value || emptyLabel;
  element.dataset.empty = value ? "false" : "true";
}

function setTopBarStatus(message) {
  const status = document.getElementById(STATUS_TEXT_ID);
  if (status) {
    status.textContent = message;
  }
}

function updateTopBarContext() {
  const { dataset, clusterAttr } = getCurrentContext();
  updateBadge(DATASET_BADGE_ID, dataset, "No dataset");
  updateBadge(ATTRIBUTE_BADGE_ID, clusterAttr, "No attribute");

  if (!dataset) {
    setTopBarStatus("Select a dataset to start.");
    return;
  }

  if (!clusterAttr) {
    setTopBarStatus("Select a cluster attribute to enable clustering views.");
    return;
  }

  setTopBarStatus("Dashboard synchronized with the current dataset context.");
}

function bindRefreshButton() {
  const refreshButton = document.getElementById(REFRESH_BUTTON_ID);
  if (!refreshButton || refreshButton.dataset.bound === "true") {
    return;
  }

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    try {
      await resetApplication();
    } finally {
      refreshButton.disabled = false;
    }
  });

  refreshButton.dataset.bound = "true";
}

async function resetApplication() {
  setTopBarStatus("Resetting application...");
  window.dispatchEvent(new CustomEvent("mds:reset"));
  resetConfigurations();
  resetConfigurationSelectionState();
  resetContinuousViewState();
  clearCurrentContext();
  setSelectedStarTarget(null);
  resetKMeansView();
  resetNonPropMds();
  await initSidebar({ onContextChange: refreshDashboard });
  await refreshDashboard();
}

function bindResetButton() {
  const resetButton = document.getElementById(RESET_BUTTON_ID);
  if (!resetButton || resetButton.dataset.bound === "true") {
    return;
  }

  resetButton.addEventListener("click", () => {
    resetWeightsPanel();
  });

  resetButton.dataset.bound = "true";
}

function initializeModules() {
  if (initialized) {
    return;
  }

  initKMeansView();
  initNonPropMds();
  setupStarSelection();
  initConfigurationSync();
  bindRefreshButton();
  bindResetButton();
  initialized = true;
}

export async function refreshDashboard() {
  const { dataset, clusterAttr } = getCurrentContext();
  updateTopBarContext();
  window.dispatchEvent(new CustomEvent("mds:reset"));
  clearContinuousPreviewConfiguration();
  resetKMeansView();
  resetNonPropMds();

  if (!dataset) {
    setTopBarStatus("No dataset available.");
    await renderWeightsPanel(null, null, null);
    await renderSilhouetteChart();
    return;
  }

  await Promise.all([renderWeightsPanel(null, dataset, clusterAttr), renderSilhouetteChart()]);
  renderSavedScatterPlots();

  updateTopBarContext();
}

async function boot() {
  initializeModules();
  await initSidebar({ onContextChange: refreshDashboard });
  await refreshDashboard();
}

boot();
