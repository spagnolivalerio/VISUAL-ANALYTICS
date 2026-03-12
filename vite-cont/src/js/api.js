function buildDatasetPayload(dataset, clusterAttr) {
  const payload = {};
  if (dataset) payload.dataset = dataset;
  if (clusterAttr) payload.cluster_attr = clusterAttr;
  return payload;
}

function postJson(url, payload = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function requestDatasets() {
  return fetch("/api/dataset");
}

export function requestAllAttributes(dataset) {
  return postJson("/api/all_attributes", { dataset });
}

export function requestNumericAttributes(dataset, clusterAttr) {
  return postJson("/api/numeric-attributes", buildDatasetPayload(dataset, clusterAttr));
}

export function requestClassicMds(dataset, clusterAttr) {
  return postJson("/api/mds-classic", buildDatasetPayload(dataset, clusterAttr));
}

export function requestNonPropMds(weights, dataset, clusterAttr) {
  const payload = buildDatasetPayload(dataset, clusterAttr);
  if (weights) payload.weights = weights;
  return postJson("/api/mds-nonprop", payload);
}
