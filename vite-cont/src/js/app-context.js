const DATASET_KEY = "dataset";
const CLUSTER_ATTR_KEY = "cluster_attr";

function setStorageValue(key, value) {
  if (value) {
    localStorage.setItem(key, value);
    return;
  }
  localStorage.removeItem(key);
}

export function getCurrentDataset() {
  return localStorage.getItem(DATASET_KEY);
}

export function getCurrentClusterAttr() {
  return localStorage.getItem(CLUSTER_ATTR_KEY);
}

export function getCurrentContext() {
  return {
    dataset: getCurrentDataset(),
    clusterAttr: getCurrentClusterAttr(),
  };
}

export function setCurrentDataset(dataset) {
  setStorageValue(DATASET_KEY, dataset);
}

export function setCurrentClusterAttr(clusterAttr) {
  setStorageValue(CLUSTER_ATTR_KEY, clusterAttr);
}

export function setCurrentContext({ dataset, clusterAttr }) {
  setCurrentDataset(dataset);
  setCurrentClusterAttr(clusterAttr);
}

export function clearCurrentContext() {
  localStorage.removeItem(DATASET_KEY);
  localStorage.removeItem(CLUSTER_ATTR_KEY);
}
