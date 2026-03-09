import { renderClassicMds } from "./mds-classic";
import { initNonPropMds } from "./mds-nonprop";
import { renderWeightsPanel } from "./weights-panel";
import { renderRateoChart } from "./rateo-chart";
import { renderStarGraph } from "./star-graph";
import { setupStarSelection } from "./star-selection";

initNonPropMds();
renderClassicMds();
renderWeightsPanel();
renderRateoChart();
renderStarGraph(null, "star-graph-1");
renderStarGraph(null, "star-graph-2");
setupStarSelection();
