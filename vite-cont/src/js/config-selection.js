import { configurationMatchesContext, getConfigurationByIdSync } from "./config-store";
import { getCurrentContext } from "./app-context";

const state = {
  activeSilhouetteView: "labelBased",
  displayedConfigurationId: null,
  starTarget: null,
  lineSelectionIds: {
    labelBased: null,
    kmeans: null,
  },
  starAssignmentsByView: {
    labelBased: {
      "star-graph-1": null,
      "star-graph-2": null,
    },
    kmeans: {
      "star-graph-1": null,
      "star-graph-2": null,
    },
  },
};

function getAssignments(view = state.activeSilhouetteView) {
  return state.starAssignmentsByView[view] || state.starAssignmentsByView.labelBased;
}

export function getActiveSilhouetteView() {
  return state.activeSilhouetteView;
}

export function setActiveSilhouetteView(view) {
  if (!state.starAssignmentsByView[view]) {
    return;
  }
  state.activeSilhouetteView = view;
}

export function getStarTarget() {
  return state.starTarget;
}

export function setStarTarget(targetId) {
  state.starTarget = targetId || null;
}

export function getLineSelectionId() {
  return state.lineSelectionIds[state.activeSilhouetteView] || null;
}

export function setLineSelection(config) {
  state.lineSelectionIds[state.activeSilhouetteView] = config?.id ?? null;
}

export function getDisplayedConfigurationId() {
  return state.displayedConfigurationId;
}

export function setDisplayedConfiguration(config) {
  state.displayedConfigurationId = config?.id ?? null;
}

export function assignConfigurationToStar(targetId, config, view = state.activeSilhouetteView) {
  const assignments = getAssignments(view);
  if (!targetId || !(targetId in assignments)) {
    return;
  }
  assignments[targetId] = config?.id ?? null;
}

export function getAssignedConfigurationId(targetId, view = state.activeSilhouetteView) {
  return getAssignments(view)[targetId] || null;
}

export function getAssignedConfiguration(targetId, view = state.activeSilhouetteView) {
  const configId = getAssignedConfigurationId(targetId, view);
  if (configId === null) {
    return null;
  }
  return getConfigurationByIdSync(configId);
}

export function getAssignedTimestep(targetId) {
  return getAssignedConfiguration(targetId)?.timestep ?? null;
}

export function clearAssignedConfiguration(targetId) {
  const assignments = getAssignments();
  if (!targetId || !(targetId in assignments)) {
    return;
  }
  assignments[targetId] = null;
}

export function clearInvalidAssignments(context = getCurrentContext()) {
  const displayedConfig = getConfigurationByIdSync(state.displayedConfigurationId);
  if (displayedConfig && !configurationMatchesContext(displayedConfig, context)) {
    state.displayedConfigurationId = null;
  }

  Object.entries(state.starAssignmentsByView).forEach(([view, assignments]) => {
    Object.keys(assignments).forEach((targetId) => {
      const config = getAssignedConfiguration(targetId, view);
      if (config && !configurationMatchesContext(config, context)) {
        assignments[targetId] = null;
      }
    });
  });
}

export function clearSelectionIfMissing(validIds) {
  if (state.displayedConfigurationId !== null && !validIds.has(state.displayedConfigurationId)) {
    state.displayedConfigurationId = null;
  }

  Object.keys(state.lineSelectionIds).forEach((view) => {
    const selectedId = state.lineSelectionIds[view];
    if (selectedId !== null && !validIds.has(selectedId)) {
      state.lineSelectionIds[view] = null;
    }
  });
}

export function clearAssignmentsIfMissing(validIds) {
  Object.values(state.starAssignmentsByView).forEach((assignments) => {
    Object.keys(assignments).forEach((targetId) => {
      const configId = assignments[targetId];
      if (configId !== null && !validIds.has(configId)) {
        assignments[targetId] = null;
      }
    });
  });
}
