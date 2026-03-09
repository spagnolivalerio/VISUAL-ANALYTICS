const DB_NAME = "mds-configurations";
const DB_VERSION = 1;
const STORE_NAME = "configurations";

let dbPromise;
let sessionId;

function getSessionId() {
  if (!sessionId) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      sessionId = `session-${Date.now()}`;
    }
  }
  return sessionId;
}

export function getCurrentSessionId() {
  return getSessionId();
}

function openDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("timestep", "timestep", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Unable to open IndexedDB"));
    };
  });

  return dbPromise;
}

export async function saveConfiguration({ timestep, weights, rateo, points }) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const record = {
      sessionId: getSessionId(),
      timestep,
      createdAt: new Date().toISOString(),
      weights,
      rateo,
      points,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error || new Error("Save failed"));
  });
}

export async function getAllConfigurations() {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Read failed"));
  });
}

export async function deleteConfiguration(id) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Delete failed"));
  });
}

export async function getConfigurationById(id) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Read failed"));
  });
}
