import { getStarTarget, setStarTarget } from "./config-selection";

const LEFT_STAR_ID = "star-graph-1";
const RIGHT_STAR_ID = "star-graph-2";
const STAR_IDS = [LEFT_STAR_ID, RIGHT_STAR_ID];

function getStarElement(targetId) {
  return document.getElementById(targetId);
}

function updateStarSelectionState(targetId) {
  STAR_IDS.forEach((starId) => {
    const starElement = getStarElement(starId);
    if (!starElement) {
      return;
    }

    starElement.dataset.selected = targetId === starId ? "true" : "false";
  });
}

function getNextTarget(targetId) {
  return getStarTarget() === targetId ? null : targetId;
}

function bindStarSelection(targetId) {
  const starElement = getStarElement(targetId);
  if (!starElement) {
    return;
  }

  starElement.addEventListener("click", () => {
    setSelectedStarTarget(getNextTarget(targetId));
  });
}

export function setSelectedStarTarget(targetId) {
  updateStarSelectionState(targetId);
  setStarTarget(targetId || null);
}

export function setupStarSelection() {
  STAR_IDS.forEach((targetId) => {
    bindStarSelection(targetId);
  });

  setSelectedStarTarget(null);
}
