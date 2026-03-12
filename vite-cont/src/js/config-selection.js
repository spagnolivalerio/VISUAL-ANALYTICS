import { configurationMatchesContext, getConfigurationByIdSync } from "./config-store";
import { getCurrentContext } from "./app-context";

const state = {
  starTarget: null,
  lineSelectionId: null,
  starAssignments: {
    "star-graph-1": null,
    "star-graph-2": null,
  },
};

export function getStarTarget() {
  return state.starTarget;
}

export function setStarTarget(targetId) {
  state.starTarget = targetId || null;
}

export function getLineSelectionId() {
  return state.lineSelectionId;
}

export function setLineSelection(config) {
  state.lineSelectionId = config?.id ?? null;
}

export function assignConfigurationToStar(targetId, config) {
  if (!targetId || !(targetId in state.starAssignments)) {
    return;
  }
  state.starAssignments[targetId] = config?.id ?? null;
}

export function getAssignedConfigurationId(targetId) {
  return state.starAssignments[targetId] || null;
}

export function getAssignedConfiguration(targetId) {
  const configId = getAssignedConfigurationId(targetId);
  if (configId === null) {
    return null;
  }
  return getConfigurationByIdSync(configId);
}

export function getAssignedTimestep(targetId) {
  return getAssignedConfiguration(targetId)?.timestep ?? null;
}

export function clearAssignedConfiguration(targetId) {
  if (!targetId || !(targetId in state.starAssignments)) {
    return;
  }
  state.starAssignments[targetId] = null;
}

export function clearInvalidAssignments(context = getCurrentContext()) {
  Object.keys(state.starAssignments).forEach((targetId) => {
    const config = getAssignedConfiguration(targetId);
    if (config && !configurationMatchesContext(config, context)) {
      state.starAssignments[targetId] = null;
    }
  });
}

export function clearSelectionIfMissing(validIds) {
  if (state.lineSelectionId !== null && !validIds.has(state.lineSelectionId)) {
    state.lineSelectionId = null;
  }
}

export function clearAssignmentsIfMissing(validIds) {
  Object.keys(state.starAssignments).forEach((targetId) => {
    const configId = getAssignedConfigurationId(targetId);
    if (configId !== null && !validIds.has(configId)) {
      state.starAssignments[targetId] = null;
    }
  });
}
