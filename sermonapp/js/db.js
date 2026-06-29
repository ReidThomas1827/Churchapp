// Thin IndexedDB wrapper. Local-first storage so the app works offline and
// before any cloud backend is configured. Audio blobs live in their own store.
const DB_NAME = "sermon-notes";
const DB_VERSION = 2;
let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sermons")) db.createObjectStore("sermons", { keyPath: "id" });
      if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio");        // key = sermon id, value = Blob
      if (!db.objectStoreNames.contains("study")) db.createObjectStore("study", { keyPath: "id" });
      if (!db.objectStoreNames.contains("quizHistory")) db.createObjectStore("quizHistory", { keyPath: "id" });
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function store(name, mode) {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(name, value, key) {
  const s = await store(name, "readwrite");
  return asPromise(key !== undefined ? s.put(value, key) : s.put(value));
}
export async function get(name, key) {
  const s = await store(name, "readonly");
  return asPromise(s.get(key));
}
export async function getAll(name) {
  const s = await store(name, "readonly");
  return asPromise(s.getAll());
}
export async function del(name, key) {
  const s = await store(name, "readwrite");
  return asPromise(s.delete(key));
}
