// APEX LAB — persistence (spec §76, §111, §112).
// localStorage: small state (current design, settings, version index).
// IndexedDB: large objects (experiment logs, run history) with graceful fallback.
// All persisted records carry schemaVersion. Corrupt data → recover, inform.

const LS_PREFIX = 'apexlab.v1.';
export const SCHEMA_VERSION = 1;

export function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return fallback;
    const val = JSON.parse(raw);
    if (val && typeof val === 'object' && val.schemaVersion !== undefined && val.schemaVersion > SCHEMA_VERSION) {
      console.warn(`[storage] ${key} written by a newer schema (${val.schemaVersion}) — keeping fallback.`);
      return fallback;
    }
    return val;
  } catch (e) {
    console.warn(`[storage] failed to read ${key}:`, e);
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: value }));
    return true;
  } catch (e) {
    // storage full or unavailable — inform via return, caller decides
    console.warn('[storage] write failed:', e);
    return false;
  }
}

export function lsDel(key) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
}

// ---------- IndexedDB (best-effort, optional) ----------
const DB_NAME = 'apexlab';
const STORE = 'runs';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(record) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...record, schemaVersion: SCHEMA_VERSION });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false; // graceful: logs still live in memory
  }
}

export async function idbAll() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbClear() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* noop */ }
}
