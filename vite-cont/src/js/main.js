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
  window.__starTarget = targetId;
}

function setupStarSelection() {
  const left = document.getElementById("star-graph");
  const right = document.getElementById("star-graph-compare");
  if (left) {
    left.addEventListener("click", () => setSelectedStarTarget("star-graph"));
  }
  if (right) {
    right.addEventListener("click", () => setSelectedStarTarget("star-graph-compare"));
  }
  setSelectedStarTarget("star-graph");
}


initNonPropMds();
renderClassicMds();
renderWeightsPanel();
renderRateoChart();
renderStarGraph(null, "star-graph");
renderStarGraph(null, "star-graph-compare");
setupStarSelection();
