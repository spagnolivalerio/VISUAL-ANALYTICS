import { getStarTarget, setStarTarget } from "./config-selection";

export function setSelectedStarTarget(targetId) {
  const left = document.getElementById("star-graph-1");
  const right = document.getElementById("star-graph-2");
  if (left) left.dataset.selected = targetId === "star-graph-1" ? "true" : "false";
  if (right) right.dataset.selected = targetId === "star-graph-2" ? "true" : "false";
  setStarTarget(targetId || null);
}

export function setupStarSelection() {
  const left = document.getElementById("star-graph-1");
  const right = document.getElementById("star-graph-2");
  if (left) {
    left.addEventListener("click", () => {
      const next = getStarTarget() === "star-graph-1" ? null : "star-graph-1";
      setSelectedStarTarget(next);
    });
  }
  if (right) {
    right.addEventListener("click", () => {
      const next = getStarTarget() === "star-graph-2" ? null : "star-graph-2";
      setSelectedStarTarget(next);
    });
  }
  setSelectedStarTarget(null);
}
