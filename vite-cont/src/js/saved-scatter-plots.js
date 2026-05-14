import { getActiveSilhouetteView, getAssignedConfiguration } from "./config-selection";
import { buildKMeansLegendItems } from "./kmeans-view";
import { configurePointSizeSlider, createSelectionState, renderMdsPlot } from "./mds-shared";
import { clearPlotContainer, setPlotPlaceholder } from "./plot-utils";

const PLOT_SPECS = [
  {
    targetId: "star-graph-1",
    containerId: "saved-config-container-1",
    labelId: "saved-config-view-1",
    sizeSliderId: "point-size-saved-1",
    placeholder: "Pin a configuration to Star Graph A.",
  },
  {
    targetId: "star-graph-2",
    containerId: "saved-config-container-2",
    labelId: "saved-config-view-2",
    sizeSliderId: "point-size-saved-2",
    placeholder: "Pin a configuration to Star Graph B.",
  },
];

const selectionStateByTarget = new Map(
  PLOT_SPECS.map((spec) => [spec.targetId, createSelectionState()])
);
const resizeObserverByTarget = new Map();
const lastPayloadByTarget = new Map();

function getContainer(containerId) {
  return document.getElementById(containerId);
}

function getViewLabelElement(labelId) {
  return document.getElementById(labelId);
}

function setViewLabel(spec, text) {
  const element = getViewLabelElement(spec.labelId);
  if (!element) {
    return;
  }

  element.textContent = text;
}

function getActiveViewLabel() {
  return getActiveSilhouetteView() === "kmeans" ? "KMeans view" : "Label based view";
}

function resolvePlotPayload(config) {
  const activeView = getActiveSilhouetteView();
  if (!config) {
    return null;
  }

  if (activeView === "kmeans") {
    const result = config.views?.kmeans;
    if (!result?.points?.length) {
      return null;
    }

    return {
      points: result.points,
      legendLabels: result.legendLabels || [],
      colorDomain: result.colorDomain || [],
      legendItems: buildKMeansLegendItems(result),
    };
  }

  const points = config.views?.labelBased?.points || config.points || [];
  if (!points.length) {
    return null;
  }

  return {
    points,
    legendLabels: null,
    colorDomain: null,
    legendItems: null,
  };
}

function drawSavedScatterPlot(container, targetId, payload) {
  renderMdsPlot({
    container,
    points: payload.points,
    showCentroids: true,
    clearContainer: clearPlotContainer,
    legendLabels: payload.legendLabels,
    colorDomain: payload.colorDomain,
    legendItems: payload.legendItems,
    selectionState: selectionStateByTarget.get(targetId),
  });
}

function bindResizeObserver(spec, container) {
  if (resizeObserverByTarget.has(spec.targetId)) {
    return;
  }

  const observer = new ResizeObserver(() => {
    const payload = lastPayloadByTarget.get(spec.targetId);
    if (payload?.points?.length) {
      drawSavedScatterPlot(container, spec.targetId, payload);
    }
  });

  observer.observe(container);
  resizeObserverByTarget.set(spec.targetId, observer);
}

export function renderSavedScatterPlot(targetId) {
  const spec = PLOT_SPECS.find((item) => item.targetId === targetId);
  const container = spec ? getContainer(spec.containerId) : null;
  if (!spec || !container) {
    return;
  }

  setViewLabel(spec, getActiveViewLabel());
  configurePointSizeSlider(container, document.getElementById(spec.sizeSliderId));
  bindResizeObserver(spec, container);

  const config = getAssignedConfiguration(targetId, getActiveSilhouetteView());
  const payload = resolvePlotPayload(config);
  lastPayloadByTarget.set(targetId, payload);

  if (!payload?.points?.length) {
    selectionStateByTarget.get(targetId)?.clear?.();
    setPlotPlaceholder(container, spec.placeholder);
    return;
  }

  drawSavedScatterPlot(container, targetId, payload);
}

export function renderSavedScatterPlots() {
  PLOT_SPECS.forEach((spec) => {
    renderSavedScatterPlot(spec.targetId);
  });
}
