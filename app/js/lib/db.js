// AI生成
// 数据访问层：适配器（内存 / IndexedDB）+ 仓储（Repository）
// 业务逻辑只依赖 Repository 接口，便于在 Node 下用内存适配器做测试。

import { STORES } from './schema.js';
import { genId } from './utils.js';

// ---------- 内存适配器（浏览器与 Node 均可用，测试默认用它）----------
export class MemoryAdapter {
  constructor() {
    this._data = {};
    for (const name of Object.keys(STORES)) this._data[name] = new Map();
  }
  _clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }
  async put(store, obj) {
    if (!this._data[store]) this._data[store] = new Map();
    this._data[store].set(obj.id, this._clone(obj));
    return obj;
  }
  async get(store, id) {
    const v = this._data[store] ? this._data[store].get(id) : null;
    return v ? this._clone(v) : null;
  }
  async all(store) {
    const m = this._data[store];
    return m ? Array.from(m.values()).map((o) => this._clone(o)) : [];
  }
  async delete(store, id) {
    if (this._data[store]) this._data[store].delete(id);
    return true;
  }
  async clear(store) {
    if (this._data[store]) this._data[store].clear();
    return true;
  }
}

// ---------- IndexedDB 适配器（仅浏览器环境）----------
export class IdbAdapter {
  constructor(dbName = 'worklife', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: def.keyPath });
          }
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  _store(name, mode) {
    return this.db.transaction(name, mode).objectStore(name);
  }
  _req(r, okVal) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(okVal !== undefined ? okVal : r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async put(store, obj) {
    await this._req(this._store(store, 'readwrite').put(obj), obj);
    return obj;
  }
  async get(store, id) {
    const r = await this._req(this._store(store, 'readonly').get(id));
    return r || null;
  }
  async all(store) {
    const r = await this._req(this._store(store, 'readonly').getAll());
    return r || [];
  }
  async delete(store, id) {
    await this._req(this._store(store, 'readwrite').delete(id));
    return true;
  }
  async clear(store) {
    await this._req(this._store(store, 'readwrite').clear());
    return true;
  }
}

// ---------- 仓储：面向业务的统一读写接口 ----------
export class Repository {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async put(store, obj) {
    if (!obj.id) obj.id = genId(store);
    return this.adapter.put(store, obj);
  }
  async get(store, id) {
    return this.adapter.get(store, id);
  }
  async all(store) {
    return this.adapter.all(store);
  }
  async remove(store, id) {
    return this.adapter.delete(store, id);
  }
  async clearStore(store) {
    return this.adapter.clear(store);
  }
  async list(store, predicate) {
    const rows = await this.adapter.all(store);
    return predicate ? rows.filter(predicate) : rows;
  }
  async byAccount(store, accountId) {
    return this.list(store, (r) => r.accountId === accountId);
  }
  async byField(store, field, value) {
    return this.list(store, (r) => r[field] === value);
  }
  async removeWhere(store, predicate) {
    const rows = await this.list(store, predicate);
    for (const r of rows) await this.adapter.delete(store, r.id);
    return rows.length;
  }
  async count(store) {
    const rows = await this.adapter.all(store);
    return rows.length;
  }
}

// 创建默认仓储（浏览器用 IndexedDB；测试可自行传 MemoryAdapter）
export async function createRepository(adapter) {
  if (adapter && typeof adapter.open === 'function') await adapter.open();
  return new Repository(adapter);
}