import { renderClassicMds } from "./mds-classic";
import { initNonPropMds } from "./mds-nonprop";
import { renderWeightsPanel } from "./weights-panel";
import { renderRateoChart } from "./rateo-chart";
import { renderStarGraph } from "./star-graph";

function setupStarLockButtons() {
  const buttons = document.querySelectorAll(".lock-btn[data-target]");
  buttons.forEach((button) => {
    if (button._lockBound) return;
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const target = document.getElementById(targetId);
      if (!target) return;
      const nextLocked = target.dataset.locked !== "true";
      target.dataset.locked = nextLocked ? "true" : "false";
      button.setAttribute("aria-pressed", nextLocked ? "true" : "false");
      button.textContent = nextLocked ? "Unlock view" : "Lock view";
    });
    button._lockBound = true;
  });
}

initNonPropMds();
renderClassicMds();
renderWeightsPanel();
renderRateoChart();
renderStarGraph(null, "star-graph");
renderStarGraph(null, "star-graph-compare");
setupStarLockButtons();
