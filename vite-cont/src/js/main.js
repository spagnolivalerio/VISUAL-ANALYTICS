import { renderClassicMds } from "./mds-classic";
import { initNonPropMds } from "./mds-nonprop";
import { renderWeightsPanel } from "./weights-panel";
import { renderRateoChart } from "./rateo-chart";
import { renderStarGraph } from "./star-graph";

function setSelectedStarTarget(targetId) {
  const left = document.getElementById("star-graph");
  const right = document.getElementById("star-graph-compare");
  if (left) left.dataset.selected = targetId === "star-graph" ? "true" : "false";
  if (right) right.dataset.selected = targetId === "star-graph-compare" ? "true" : "false";
  window.__starTarget = targetId || null;
}

function setupStarSelection() {
  const left = document.getElementById("star-graph");
  const right = document.getElementById("star-graph-compare");
  if (left) {
    left.addEventListener("click", () => {
      const next = window.__starTarget === "star-graph" ? null : "star-graph";
      setSelectedStarTarget(next);
    });
  }
  if (right) {
    right.addEventListener("click", () => {
      const next = window.__starTarget === "star-graph-compare" ? null : "star-graph-compare";
      setSelectedStarTarget(next);
    });
  }
  setSelectedStarTarget(null);
}


initNonPropMds();
renderClassicMds();
renderWeightsPanel();
renderRateoChart();
renderStarGraph(null, "star-graph");
renderStarGraph(null, "star-graph-compare");
setupStarSelection();
