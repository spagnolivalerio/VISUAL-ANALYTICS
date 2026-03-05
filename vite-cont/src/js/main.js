import { renderClassicMds } from "./mds-classic";
import { renderWeightsPanel } from "./weights-panel";

const nonProportionalContainer = document.getElementById("mds-non-proportional-container");

renderClassicMds();
renderWeightsPanel();

if (nonProportionalContainer) {
  nonProportionalContainer.textContent =
    "Scatterplot MDS non proporzionale: area pronta per il rendering.";
}
