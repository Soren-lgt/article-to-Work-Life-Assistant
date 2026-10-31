// AI生成
// 数据备份 / 恢复 / 清理 / 概览（可在 Node 测试）
import { STORES } from './schema.js';

function storeNames() { return Object.keys(STORES); }

export const Backup = {
  VERSION: 1,

  async exportAll(repo, meta = {}) {
    const stores = {};
    for (const name of storeNames()) stores[name] = await repo.all(name);
    return { version: this.VERSION, exportedAt: Date.now(), app: 'worklife-app', ...meta, stores };
  },

  async stats(repo) {
    const out = {};
    for (const name of storeNames()) out[name] = (await repo.all(name)).length;
    return out;
  },

  // 导入：mode='replace' 先清空对应仓库再写入；'merge' 直接写入（同 id 覆盖）
  async importAll(repo, data, { mode = 'replace' } = {}) {
    if (!data || typeof data !== 'object' || !data.stores || typeof data.stores !== 'object') {
      throw new Error('备份数据格式无效');
    }
    return this._writeStores(repo, data.stores, mode);
  },

  // 从 JSON 字符串导入
  async importFromText(repo, text, opts) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('不是有效的 JSON 文件'); }
    return this.importAll(repo, parsed, opts);
  },

  async _writeStores(repo, stores, mode) {
    let count = 0;
    for (const name of storeNames()) {
      const rows = stores[name];
      if (rows == null) continue;
      if (!Array.isArray(rows)) throw new Error(`仓库 ${name} 的数据应为数组`);
      if (mode === 'replace') await this.clearStore(repo, name);
      for (const row of rows) {
        if (!row || typeof row !== 'object' || row.id == null) throw new Error(`仓库 ${name} 存在缺少 id 的记录`);
        await repo.put(name, row);
        count++;
      }
    }
    return { imported: count };
  },

  async clearStore(repo, name) {
    if (!storeNames().includes(name)) throw new Error('未知的仓库：' + name);
    const rows = await repo.all(name);
    for (const r of rows) await repo.remove(name, r.id);
    return rows.length;
  },

  async resetAll(repo) {
    let removed = 0;
    for (const name of storeNames()) removed += await this.clearStore(repo, name);
    return removed;
  },

  // 按模块清理（与 PRD 的「分模块清空」对应）
  MODULES: {
    today: ['todoplan', 'memo'],
    ledger: ['ledgerCategory', 'ledgerRecord'],
    devwork: ['devTask', 'devBug', 'devSnippet'],
    quiz: ['category', 'bank', 'question', 'attempt'],
    group: ['group', 'groupMember', 'joinRequest', 'project', 'task', 'attachment', 'opLog', 'notification'],
    accounts: ['accounts'],
  },

  async clearModule(repo, moduleKey) {
    const stores = this.MODULES[moduleKey];
    if (!stores) throw new Error('未知的模块：' + moduleKey);
    let removed = 0;
    for (const name of stores) removed += await this.clearStore(repo, name);
    return removed;
  },
};