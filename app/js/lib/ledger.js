// AI生成
// 每日记账业务逻辑（可在 Node 测试）
import { DEFAULT_LEDGER_CARDS } from './schema.js';
import { monthOf } from './utils.js';

function toAmount(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumAmounts(rows) {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

// H2：在候选记录中定位“同账号 + 卡片 + 日期”的既有记录作为替换目标；找不到返回 null
export function findRecordByKey(rows, accountId, cardId, date) {
  return (rows || []).find(
    (r) => r.accountId === accountId && r.cardId === cardId && r.date === date,
  ) || null;
}

// P9-2：卡片在指定日期是否可见
// - 初始卡片（preset=true）：每一天都出现
// - 新增消费建的临时卡（带 date）：只在那一天出现
// - 历史遗留的自建卡（无 date）：按每天出现处理，保证旧数据不丢
export function isCardVisibleOn(card, date) {
  if (!card) return false;
  if (card.preset === true) return true;
  if (card.date) return card.date === date;
  return true;
}

export function cardsVisibleOn(cards, date) {
  return (cards || []).filter((c) => isCardVisibleOn(c, date));
}

export const Ledger = {
  // 首次使用初始化预置卡片（幂等）
  async ensureDefaultCards(repo, accountId) {
    const existing = await repo.list('ledgerCategory', (r) => r.accountId === accountId);
    if (existing.length) return existing.sort((a, b) => a.sort - b.sort);
    const created = [];
    for (const c of DEFAULT_LEDGER_CARDS) {
      created.push(await repo.put('ledgerCategory', {
        accountId, name: c.name, preset: true, sort: c.sort, createdAt: Date.now(),
      }));
    }
    return created;
  },

  async listCards(repo, accountId) {
    const rows = await repo.list('ledgerCategory', (r) => r.accountId === accountId);
    return rows.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  },

  async addCard(repo, accountId, name, { date = null, preset = false } = {}) {
    const n = String(name || '').trim();
    if (!n) throw new Error('分类名称不能为空');
    const cards = await this.listCards(repo, accountId);
    const sort = cards.length ? Math.max(...cards.map((c) => c.sort || 0)) + 1 : 1;
    const card = { accountId, name: n, preset: !!preset, sort, createdAt: Date.now() };
    // 只在那一天出现的卡片带上日期；不带日期就是每天都出现的初始卡片
    if (date) card.date = date;
    return repo.put('ledgerCategory', card);
  },

  // P9-3：新增初始卡片——每一天都会出现的卡片
  async addInitialCard(repo, accountId, name) {
    return this.addCard(repo, accountId, name, { preset: true });
  },

  async renameCard(repo, id, name) {
    const n = String(name || '').trim();
    if (!n) throw new Error('分类名称不能为空');
    const c = await repo.get('ledgerCategory', id);
    if (!c) throw new Error('分类不存在');
    c.name = n;
    return repo.put('ledgerCategory', c);
  },

  // 删除卡片并连带删除该卡片下的记录
  async removeCard(repo, id) {
    const c = await repo.get('ledgerCategory', id);
    if (!c) return false;
    await repo.remove('ledgerCategory', id);
    await repo.removeWhere('ledgerRecord', (r) => r.cardId === id);
    return true;
  },

  async addRecord(repo, accountId, { cardId, amount, note = '', date } = {}) {
    if (!cardId) throw new Error('请选择消费分类');
    if (!date) throw new Error('缺少日期');
    const amt = toAmount(amount);
    const noteText = String(note || '');
    // H2：同一账号 + 卡片 + 日期只保留一条；再次写金额为替换，不累加
    const candidates = await repo.list('ledgerRecord', (r) => r.accountId === accountId && r.cardId === cardId);
    const keep = findRecordByKey(candidates, accountId, cardId, date);
    if (keep) {
      for (const e of candidates) {
        if (e.id !== keep.id && e.date === date) await repo.remove('ledgerRecord', e.id);
      }
      return repo.put('ledgerRecord', { ...keep, amount: amt, note: noteText });
    }
    return repo.put('ledgerRecord', {
      accountId, cardId, amount: amt, note: noteText, date, createdAt: Date.now(),
    });
  },

  async listByDate(repo, accountId, date) {
    const rows = await repo.list('ledgerRecord', (r) => r.accountId === accountId && r.date === date);
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async dayTotal(repo, accountId, date) {
    const rows = await this.listByDate(repo, accountId, date);
    return { total: sumAmounts(rows), count: rows.length };
  },

  // 各卡片当日金额与笔数
  async dayByCard(repo, accountId, date) {
    const cards = cardsVisibleOn(await this.listCards(repo, accountId), date);
    const rows = await this.listByDate(repo, accountId, date);
    return cards.map((c) => {
      const rc = rows.filter((r) => r.cardId === c.id);
      return { cardId: c.id, name: c.name, total: sumAmounts(rc), count: rc.length };
    });
  },

  async removeRecord(repo, id) {
    return repo.remove('ledgerRecord', id);
  },

  // 按月汇总：各分类金额 + 合计
  async monthSummary(repo, accountId, month) {
    const cards = await this.listCards(repo, accountId);
    const rows = await repo.list('ledgerRecord', (r) => r.accountId === accountId && monthOf(r.date) === month);
    const listed = cards.filter((c) => c.preset === true || rows.some((r) => r.cardId === c.id));
    const perCard = listed.map((c) => {
      const rc = rows.filter((r) => r.cardId === c.id);
      return { cardId: c.id, name: c.name, total: sumAmounts(rc), count: rc.length };
    });
    return { month, perCard, total: sumAmounts(rows), count: rows.length };
  },

  // 有记录的日期（倒序）
  async listDates(repo, accountId) {
    const rows = await repo.list('ledgerRecord', (r) => r.accountId === accountId);
    const set = Array.from(new Set(rows.map((r) => r.date)));
    return set.sort((a, b) => (a < b ? 1 : -1));
  },
};