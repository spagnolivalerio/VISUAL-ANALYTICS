import { getCurrentContext } from "./app-context";
import { initConfigurationSync } from "./configuration-sync";
import { renderClassicMds } from "./mds-classic";
import { initNonPropMds, resetNonPropMds } from "./mds-nonprop";
import { renderRateoChart } from "./rateo-chart";
import { initSidebar } from "./sidebar";
import { setupStarSelection } from "./star-selection";
import { renderWeightsPanel } from "./weights-panel";

const DATASET_BADGE_ID = "topbar-dataset";
const ATTRIBUTE_BADGE_ID = "topbar-attribute";
const STATUS_TEXT_ID = "topbar-status";
const REFRESH_BUTTON_ID = "refresh-dashboard-btn";

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
    setTopBarStatus("Select a cluster attribute to compute MDS.");
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
    setTopBarStatus("Refreshing dashboard...");
    try {
      await refreshDashboard();
    } finally {
      refreshButton.disabled = false;
    }
  });

  refreshButton.dataset.bound = "true";
}

function initializeModules() {
  if (initialized) {
    return;
  }

  initNonPropMds();
  setupStarSelection();
  initConfigurationSync();
  bindRefreshButton();
  initialized = true;
}

export async function refreshDashboard() {
  const { dataset, clusterAttr } = getCurrentContext();
  updateTopBarContext();
  resetNonPropMds();

  if (!dataset) {
    setTopBarStatus("No dataset available.");
    await renderWeightsPanel(null, null, null);
    await renderRateoChart();
    return;
  }

  await Promise.all([
    renderClassicMds(dataset, clusterAttr),
    renderWeightsPanel(null, dataset, clusterAttr),
    renderRateoChart(),
  ]);

  updateTopBarContext();
}

async function boot() {
  initializeModules();
  await initSidebar({ onContextChange: refreshDashboard });
  await refreshDashboard();
}

boot();
