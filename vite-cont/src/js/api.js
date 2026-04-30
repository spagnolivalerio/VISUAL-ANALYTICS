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

export async function parseJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(body.slice(0, 120) || "Invalid server response");
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

export function requestDatasets() {
  return fetch("/api/dataset");
}

export function requestAllAttributes(dataset, clusterAttr) {
  return postJson("/api/all_attributes", buildDatasetPayload(dataset, clusterAttr));
}

export function requestNumericAttributes(dataset, clusterAttr) {
  return postJson("/api/numeric-attributes", buildDatasetPayload(dataset, clusterAttr));
}

export function requestKMeans(dataset, clusterAttr, weights = null) {
  const payload = buildDatasetPayload(dataset, clusterAttr);
  if (weights) payload.weights = weights;
  return postJson("/api/kmeans", payload);
}

export function requestNonPropMds(weights, dataset, clusterAttr) {
  const payload = buildDatasetPayload(dataset, clusterAttr);
  if (weights) payload.weights = weights;
  return postJson("/api/mds-nonprop", payload);
}
