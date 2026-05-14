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
import {
  activateProjectionView,
  getProjectionDataset,
  initProjectionView,
  resetProjectionView,
} from "./projection-view";
import { renderSavedScatterPlots } from "./saved-scatter-plots";
import { renderSilhouetteChart } from "./silhouette-chart";
import { initSidebar } from "./sidebar";
import { setSelectedStarTarget, setupStarSelection } from "./star-selection";
import { renderWeightsPanel, resetWeightsPanel } from "./weights-panel";

const DATASET_BADGE_ID = "topbar-dataset";
const ATTRIBUTE_BADGE_ID = "topbar-attribute";
const TITLE_ID = "topbar-title";
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

function getActiveView() {
  return document.querySelector(".view-tab-btn[aria-selected='true']")?.dataset.tabTarget || "cluster-view";
}

function setElementHidden(id, hidden) {
  const element = document.getElementById(id);
  if (element) {
    element.hidden = hidden;
  }
}

function updateTopBarContext() {
  const title = document.getElementById(TITLE_ID);
  const activeView = getActiveView();
  if (activeView === "projection-view") {
    const dataset = getProjectionDataset();
    if (title) {
      title.textContent = "Interactive view";
    }
    updateBadge(DATASET_BADGE_ID, dataset, "No dataset");
    setElementHidden("topbar-attribute-label", true);
    setElementHidden(ATTRIBUTE_BADGE_ID, true);
    setElementHidden("topbar-actions", true);
    return;
  }

  if (title) {
    title.textContent = "Cluster view";
  }
  setElementHidden("topbar-attribute-label", false);
  setElementHidden(ATTRIBUTE_BADGE_ID, false);
  setElementHidden("topbar-actions", false);

  const { dataset, clusterAttr } = getCurrentContext();
  updateBadge(DATASET_BADGE_ID, dataset, "No dataset");
  updateBadge(ATTRIBUTE_BADGE_ID, clusterAttr, "No attribute");

  if (!dataset) {
    return;
  }

  if (!clusterAttr) {
    return;
  }
}

async function switchView(targetId) {
  document.querySelectorAll(".view-tab-btn[data-tab-target]").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.tabTarget === targetId ? "true" : "false");
    if (button.dataset.tabTarget === targetId) {
      button.focus();
    }
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== targetId;
  });

  await initSidebar({ onContextChange: refreshDashboard });
  updateTopBarContext();
  if (targetId === "projection-view") {
    await activateProjectionView();
  }
}

function bindViewTabs() {
  document.querySelectorAll(".view-tab-btn[data-tab-target]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.addEventListener("click", () => {
      void switchView(button.dataset.tabTarget);
    });
    button.dataset.bound = "true";
  });

  window.addEventListener("projection:context", updateTopBarContext);
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
  window.dispatchEvent(new CustomEvent("mds:reset"));
  resetConfigurations();
  resetConfigurationSelectionState();
  resetContinuousViewState();
  clearCurrentContext();
  resetProjectionView();
  setSelectedStarTarget(null);
  resetKMeansView();
  resetNonPropMds();
  await initSidebar({ onContextChange: refreshDashboard, preserveEmptyContext: true });
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
  void initProjectionView();
  bindViewTabs();
  setupStarSelection();
  initConfigurationSync();
  bindRefreshButton();
  bindResetButton();
  initialized = true;
}

export async function refreshDashboard() {
  if (getActiveView() === "projection-view") {
    updateTopBarContext();
    return;
  }

  const { dataset, clusterAttr } = getCurrentContext();
  updateTopBarContext();
  window.dispatchEvent(new CustomEvent("mds:reset"));
  clearContinuousPreviewConfiguration();
  resetKMeansView();
  resetNonPropMds();

  if (!dataset) {
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
