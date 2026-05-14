import { parseJsonResponse, requestAllAttributes, requestDatasets } from "./api";
import { getCurrentContext, setCurrentContext } from "./app-context";
import { getProjectionDataset, setProjectionDataset } from "./projection-view";

const sidebar = document.getElementById("app-sidebar");
const toggle = document.querySelector(".sidebar-toggle");
const closeBtn = document.querySelector(".sidebar-close");
const backdrop = document.querySelector(".sidebar-backdrop");
const datasetsList = document.getElementById("datasets-list");
const attributesList = document.getElementById("attributes-list");
const attributesSection = document.getElementById("sidebar-attributes-section");

const ATTRIBUTES_LOADING_LABEL = "Loading attributes...";
const ATTRIBUTES_ERROR_LABEL = "Unable to load attributes";
const NO_ATTRIBUTES_LABEL = "No attributes";
const DATASETS_LOADING_LABEL = "Loading datasets...";
const NO_DATASETS_LABEL = "No datasets";
const DATASETS_ERROR_LABEL = "Unable to load datasets";

let availableDatasets = [];
let availableAttributes = [];
let onContextChangeHandler = null;

function getActiveView() {
  return document.querySelector(".view-tab-btn[aria-selected='true']")?.dataset.tabTarget || "cluster-view";
}

function isProjectionViewActive() {
  return getActiveView() === "projection-view";
}

function syncSidebarMode() {
  const projectionMode = isProjectionViewActive();
  if (attributesSection) {
    attributesSection.hidden = projectionMode;
  }
  if (projectionMode && attributesList) {
    attributesList.innerHTML = "";
  }
}

function createListItem({ label, onClick = null, isSelected = false, disabled = false }) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sidebar-list-button";
  button.textContent = label;
  button.dataset.selected = isSelected ? "true" : "false";
  button.disabled = disabled || !onClick;
  if (onClick && !disabled) {
    button.addEventListener("click", onClick);
  }
  li.appendChild(button);
  return li;
}

function renderList(listElement, items, emptyLabel, getItemConfig) {
  if (!listElement) {
    return;
  }

  listElement.innerHTML = "";
  if (!items.length) {
    listElement.appendChild(createListItem({ label: emptyLabel, disabled: true }));
    return;
  }

  items.forEach((item) => {
    listElement.appendChild(createListItem(getItemConfig(item)));
  });
}

function renderDatasets(
  items,
  selectedDataset = isProjectionViewActive() ? getProjectionDataset() : getCurrentContext().dataset,
  disabled = false
) {
  renderList(datasetsList, items, NO_DATASETS_LABEL, (name) => ({
    label: name,
    onClick: () => handleDatasetSelection(name),
    isSelected: name === selectedDataset,
    disabled,
  }));
}

function renderAttributes(items, selectedClusterAttr = getCurrentContext().clusterAttr, disabled = false) {
  renderList(attributesList, items, NO_ATTRIBUTES_LABEL, (name) => ({
    label: name,
    onClick: () => handleAttributeSelection(name),
    isSelected: name === selectedClusterAttr,
    disabled,
  }));
}

async function fetchDatasets() {
  const payload = await parseJsonResponse(await requestDatasets());
  return Array.isArray(payload.datasets) ? payload.datasets : [];
}

async function fetchAttributes(datasetName) {
  const payload = await parseJsonResponse(await requestAllAttributes(datasetName));
  return {
    attributes: Array.isArray(payload.attributes) ? payload.attributes : [],
    clusterAttr: payload.cluster_attr || null,
  };
}

function getResolvedDataset(datasets, currentDataset) {
  if (currentDataset && datasets.includes(currentDataset)) {
    return currentDataset;
  }
  return datasets[0] || null;
}

function getResolvedClusterAttr(attributes, suggestedClusterAttr, currentClusterAttr) {
  if (currentClusterAttr && attributes.includes(currentClusterAttr)) {
    return currentClusterAttr;
  }
  if (suggestedClusterAttr && attributes.includes(suggestedClusterAttr)) {
    return suggestedClusterAttr;
  }
  return attributes[0] || null;
}

async function notifyContextChange() {
  if (typeof onContextChangeHandler === "function") {
    await onContextChangeHandler();
  }
}

async function handleAttributeSelection(name) {
  const { dataset } = getCurrentContext();
  if (!dataset) {
    return;
  }

  setCurrentContext({ dataset, clusterAttr: name });
  renderAttributes(availableAttributes, name);
  closeSidebar();
  await notifyContextChange();
}

async function handleDatasetSelection(name) {
  if (isProjectionViewActive()) {
    renderDatasets(availableDatasets, name);
    closeSidebar();
    await setProjectionDataset(name);
    await notifyContextChange();
    return;
  }

  const previousContext = getCurrentContext();
  const previousAttributes = [...availableAttributes];
  setCurrentContext({ dataset: name, clusterAttr: null });
  renderDatasets(availableDatasets, name);
  renderAttributes([ATTRIBUTES_LOADING_LABEL], null, true);

  try {
    const { attributes, clusterAttr } = await fetchAttributes(name);
    availableAttributes = attributes;
    const resolvedClusterAttr = getResolvedClusterAttr(attributes, clusterAttr, null);
    setCurrentContext({ dataset: name, clusterAttr: resolvedClusterAttr });
    renderAttributes(attributes, resolvedClusterAttr);
    closeSidebar();
    await notifyContextChange();
  } catch (error) {
    availableAttributes = previousAttributes;
    setCurrentContext(previousContext);
    renderDatasets(availableDatasets, previousContext.dataset);
    if (previousAttributes.length) {
      renderAttributes(previousAttributes, previousContext.clusterAttr);
    } else {
      renderAttributes([`${ATTRIBUTES_ERROR_LABEL}: ${error.message}`], null, true);
    }
  }
}

function openSidebar() {
  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  sidebar.classList.add("is-open");
  backdrop.classList.add("is-visible");
  toggle.setAttribute("aria-expanded", "true");
  sidebar.setAttribute("aria-hidden", "false");
}

function closeSidebar() {
  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  sidebar.classList.remove("is-open");
  backdrop.classList.remove("is-visible");
  toggle.setAttribute("aria-expanded", "false");
  sidebar.setAttribute("aria-hidden", "true");
}

function toggleSidebar(event) {
  event.stopPropagation();
  if (sidebar?.classList.contains("is-open")) {
    closeSidebar();
    return;
  }
  openSidebar();
}

function initSidebarToggle() {
  if (!sidebar || !toggle || !closeBtn || !backdrop) {
    return;
  }

  if (toggle.dataset.bound === "true") {
    return;
  }

  toggle.addEventListener("click", toggleSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  backdrop.addEventListener("click", closeSidebar);
  toggle.dataset.bound = "true";
}

export async function initSidebar({ onContextChange, preserveEmptyContext = false } = {}) {
  onContextChangeHandler = onContextChange || null;
  initSidebarToggle();
  syncSidebarMode();

  if (!datasetsList || !attributesList) {
    return getCurrentContext();
  }

  datasetsList.innerHTML = "";
  datasetsList.appendChild(createListItem({ label: DATASETS_LOADING_LABEL, disabled: true }));
  if (!isProjectionViewActive()) {
    attributesList.innerHTML = "";
    attributesList.appendChild(createListItem({ label: ATTRIBUTES_LOADING_LABEL, disabled: true }));
  }

  try {
    availableDatasets = await fetchDatasets();
    if (isProjectionViewActive()) {
      if (preserveEmptyContext && !getProjectionDataset()) {
        renderDatasets(availableDatasets, null);
        renderAttributes([], null, true);
        return { dataset: null, clusterAttr: null };
      }

      const dataset = getResolvedDataset(availableDatasets, getProjectionDataset());
      if (dataset && dataset !== getProjectionDataset()) {
        await setProjectionDataset(dataset, { run: false });
      }
      renderDatasets(availableDatasets, dataset);
      renderAttributes([], null, true);
      return { dataset, clusterAttr: null };
    }

    renderDatasets(availableDatasets);

    const currentContext = getCurrentContext();
    if (preserveEmptyContext && !currentContext.dataset) {
      setCurrentContext({ dataset: null, clusterAttr: null });
      renderDatasets(availableDatasets, null);
      renderAttributes([], null, true);
      return getCurrentContext();
    }

    const dataset = getResolvedDataset(availableDatasets, currentContext.dataset);
    if (!dataset) {
      setCurrentContext({ dataset: null, clusterAttr: null });
      renderAttributes([], null, true);
      return getCurrentContext();
    }

    const { attributes, clusterAttr } = await fetchAttributes(dataset);
    availableAttributes = attributes;

    const resolvedClusterAttr = getResolvedClusterAttr(attributes, clusterAttr, currentContext.clusterAttr);
    setCurrentContext({ dataset, clusterAttr: resolvedClusterAttr });
    renderDatasets(availableDatasets, dataset);
    renderAttributes(attributes, resolvedClusterAttr);
    return getCurrentContext();
  } catch (error) {
    availableDatasets = [];
    availableAttributes = [];
    setCurrentContext({ dataset: null, clusterAttr: null });
    renderDatasets([`${DATASETS_ERROR_LABEL}: ${error.message}`], null, true);
    renderAttributes([], null, true);
    return getCurrentContext();
  }
}
