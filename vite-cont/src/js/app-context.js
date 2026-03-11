export function getCurrentDataset() {
  return localStorage.getItem("dataset");
}

export function getCurrentClusterAttr() {
  return localStorage.getItem("cluster_attr");
}

export function getCurrentContext() {
  return {
    dataset: getCurrentDataset(),
    clusterAttr: getCurrentClusterAttr(),
  };
}

export function setCurrentDataset(dataset) {
  if (dataset) {
    localStorage.setItem("dataset", dataset);
    return;
  }
  localStorage.removeItem("dataset");
}

export function setCurrentClusterAttr(clusterAttr) {
  if (clusterAttr) {
    localStorage.setItem("cluster_attr", clusterAttr);
    return;
  }
  localStorage.removeItem("cluster_attr");
}
