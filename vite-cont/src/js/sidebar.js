import { requestAllAttributes, requestDatasets } from "./api";
import { getCurrentDataset, setCurrentClusterAttr, setCurrentDataset } from "./app-context";

const sidebar = document.getElementById("app-sidebar");
const toggle = document.querySelector(".sidebar-toggle");
const closeBtn = document.querySelector(".sidebar-close");
const backdrop = document.querySelector(".sidebar-backdrop");
const datasetsList = document.getElementById("datasets-list");
const attributesList = document.getElementById("attributes-list");

const ATTRIBUTES_LOADING_LABEL = "Loading...";
const ATTRIBUTES_ERROR_LABEL = "Error loading attributes";
const NO_ATTRIBUTES_LABEL = "No attributes";
const NO_DATASETS_LABEL = "No datasets";
const DATASETS_ERROR_LABEL = "Error loading datasets";

function createListItem(label, onClick = null, isSelected = false) {
  const li = document.createElement("li");
  li.textContent = label;
  li.dataset.selected = isSelected ? "true" : "false";

  // making the li clickable
  if (onClick) {
    li.style.cursor = "pointer";
    li.addEventListener("click", onClick);
  }

  return li;
}

function renderList(listElement, items, emptyLabel, getItemConfig) {
  if (!listElement) {
    return;
  }

  listElement.innerHTML = "";
  if (!items.length) {
    listElement.appendChild(createListItem(emptyLabel));
    return;
  }

  items.forEach((item) => {
    const [label, onClick, isSelected] = getItemConfig(item);
    listElement.appendChild(createListItem(label, onClick, isSelected));
  });
}

function renderAttributes(items) {
  renderList(attributesList, items, NO_ATTRIBUTES_LABEL, (name) => [
    name,
    [ATTRIBUTES_LOADING_LABEL, ATTRIBUTES_ERROR_LABEL, NO_ATTRIBUTES_LABEL].includes(name)
      ? null
      : () => handleAttributeSelection(name),
    false,
  ]);
}

function renderDatasets(items) {
  const currentDataset = getCurrentDataset();
  renderList(datasetsList, items, NO_DATASETS_LABEL, (name) => [
    name,
    () => handleDatasetSelection(name),
    name === currentDataset,
  ]);
}

function handleAttributeSelection(name) {
  setCurrentClusterAttr(name);
  location.reload();
}

async function loadAttributes(datasetName) {
  try {
    const response = await requestAllAttributes(datasetName);
    const payload = await response.json();
    const attributes = Array.isArray(payload.attributes) ? payload.attributes : [];
    renderAttributes(attributes);
  } catch (error) {
    renderAttributes([ATTRIBUTES_ERROR_LABEL]);
  }
}

function handleDatasetSelection(name) {
  setCurrentDataset(name);
  setCurrentClusterAttr(null);
  renderDatasets(
    Array.from(datasetsList?.querySelectorAll("li") || [], (item) => item.textContent).filter(Boolean)
  );
  renderAttributes([ATTRIBUTES_LOADING_LABEL]);
  loadAttributes(name);
}

async function initDatasetsList() {
  if (!datasetsList) {
    return;
  }

  datasetsList.innerHTML = "<li>Loading...</li>";

  try {
    const response = await requestDatasets();
    const payload = await response.json();
    const datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
    renderDatasets(datasets);
  } catch (error) {
    datasetsList.innerHTML = `<li>${DATASETS_ERROR_LABEL}</li>`;
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
  toggle.style.display = "none";
}

function closeSidebar() {
  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  sidebar.classList.remove("is-open");
  backdrop.classList.remove("is-visible");
  toggle.setAttribute("aria-expanded", "false");
  sidebar.setAttribute("aria-hidden", "true");
  toggle.style.display = "";
}

function toggleSidebar(event) {
  event.stopPropagation();
  if (sidebar?.classList.contains("is-open")) closeSidebar();
  else openSidebar();
}

function initSidebarToggle() {
  if (!sidebar || !toggle || !closeBtn || !backdrop) {
    return;
  }

  toggle.addEventListener("click", toggleSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  backdrop.addEventListener("click", closeSidebar);
}

initDatasetsList();
initSidebarToggle();
