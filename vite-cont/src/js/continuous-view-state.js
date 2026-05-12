const state = {
  enabled: false,
  previewConfiguration: null,
};

export function isContinuousViewEnabled() {
  return state.enabled;
}

export function setContinuousViewEnabled(enabled) {
  state.enabled = Boolean(enabled);
}

export function getContinuousPreviewConfiguration() {
  return state.previewConfiguration;
}

export function setContinuousPreviewConfiguration(configuration) {
  state.previewConfiguration = configuration || null;
}

export function clearContinuousPreviewConfiguration() {
  state.previewConfiguration = null;
}

export function resetContinuousViewState() {
  state.enabled = false;
  state.previewConfiguration = null;
}
