const STORAGE_KEY = "mds-configurations";

function normalizeContext(dataset, clusterAttr) {
  return {
    dataset: dataset || null,
    clusterAttr: clusterAttr || null,
  };
}

function sortByTimestep(items) {
  return [...items].sort((a, b) => Number(a.timestep) - Number(b.timestep));
}

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to read configurations from sessionStorage.", error);
    return [];
  }
}

function writeStore(items) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getNextId(items) {
  if (!items.length) {
    return 1;
  }
  return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
}

export function getCurrentSessionId() {
  return "session-storage";
}

export async function saveConfiguration({ timestep, dataset, clusterAttr, weights, rateo, points, attributes }) {
  const items = readStore();
  const context = normalizeContext(dataset, clusterAttr);
  const record = {
    id: getNextId(items),
    timestep,
    dataset: context.dataset,
    clusterAttr: context.clusterAttr,
    weights: weights || {},
    attributes: Array.isArray(attributes) ? [...attributes] : Object.keys(weights || {}),
    rateo,
    points: Array.isArray(points) ? points : [],
  };

  items.push(record);
  writeStore(items);
  return record;
}

export async function getAllConfigurations() {
  return readStore();
}

export async function getConfigurationsForContext({ dataset, clusterAttr }) {
  const context = normalizeContext(dataset, clusterAttr);
  const items = readStore();

  return sortByTimestep(
    items.filter(
      (item) =>
        item.dataset === context.dataset &&
        item.clusterAttr === context.clusterAttr
    )
  );
}

export async function getNextTimestep({ dataset, clusterAttr }) {
  const items = await getConfigurationsForContext({ dataset, clusterAttr });
  if (!items.length) {
    return 0;
  }
  return Number(items[items.length - 1].timestep) + 1;
}

export async function deleteConfiguration(id) {
  const items = readStore().filter((item) => item.id !== id);
  writeStore(items);
}

export async function getConfigurationById(id) {
  return readStore().find((item) => item.id === id) || null;
}

export function configurationMatchesContext(config, { dataset, clusterAttr }) {
  if (!config) {
    return false;
  }

  const context = normalizeContext(dataset, clusterAttr);
  return config.dataset === context.dataset && config.clusterAttr === context.clusterAttr;
}
