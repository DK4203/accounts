/* db.js — IndexedDB wrapper. Falls back to localStorage if IndexedDB is unavailable. */

const DB_NAME = 'MoneyAppDB';
const DB_VERSION = 1;
const STORES = ['users', 'transactions', 'groups', 'budgets', 'currencies'];

let _db = null;
let _useLocalFallback = false;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      _useLocalFallback = true;
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: 'id' });
          if (store !== 'users') os.createIndex('userId', 'userId', { unique: false });
        }
      });
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = () => {
      _useLocalFallback = true;
      resolve(null);
    };
  });
}

/* ---------- localStorage fallback helpers ---------- */
function lsGetAll(store) {
  try {
    return JSON.parse(localStorage.getItem('ls_' + store) || '[]');
  } catch (e) {
    return [];
  }
}
function lsSetAll(store, arr) {
  localStorage.setItem('ls_' + store, JSON.stringify(arr));
}

/* ---------- generic CRUD ---------- */
const DB = {
  async init() {
    await openDB();
  },

  async put(store, record) {
    if (_useLocalFallback) {
      const all = lsGetAll(store);
      const idx = all.findIndex((r) => r.id === record.id);
      if (idx >= 0) all[idx] = record;
      else all.push(record);
      lsSetAll(store, all);
      return record;
    }
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(store, 'readwrite');
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  },

  async delete(store, id) {
    if (_useLocalFallback) {
      const all = lsGetAll(store).filter((r) => r.id !== id);
      lsSetAll(store, all);
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAll(store) {
    if (_useLocalFallback) return lsGetAll(store);
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllByUser(store, userId) {
    const all = await this.getAll(store);
    return all.filter((r) => r.userId === userId);
  },

  async get(store, id) {
    if (_useLocalFallback) return lsGetAll(store).find((r) => r.id === id) || null;
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
};

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
