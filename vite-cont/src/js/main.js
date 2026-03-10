import { renderClassicMds } from "./mds-classic";
import { initNonPropMds } from "./mds-nonprop";
import { renderWeightsPanel } from "./weights-panel";
import { renderRateoChart } from "./rateo-chart";
import { renderStarGraph } from "./star-graph";
import { setupStarSelection } from "./star-selection";
import { syncWeights } from "./mds-nonprop";

let dataset = localStorage.getItem("dataset")
let cluster_attr = localStorage.getItem("cluster_attr")

initNonPropMds();
renderClassicMds(dataset, cluster_attr);
renderWeightsPanel(null);
renderRateoChart();
renderStarGraph(null, "star-graph-1");
renderStarGraph(null, "star-graph-2");
setupStarSelection();
syncWeights();
