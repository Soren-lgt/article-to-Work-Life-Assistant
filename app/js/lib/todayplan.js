// AI生成
// 今日计划业务逻辑（可在 Node 测试）
import { todayStr } from './utils.js';

const PRIORITIES = ['高', '中', '低'];

export const TodayPlan = {
  async listByDate(repo, accountId, date) {
    const rows = await repo.list('todoplan', (r) => r.accountId === accountId && r.date === date);
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async add(repo, accountId, { title, date = todayStr(), priority = '中', note = '' } = {}) {
    const t = String(title || '').trim();
    if (!t) throw new Error('计划内容不能为空');
    if (!PRIORITIES.includes(priority)) priority = '中';
    return repo.put('todoplan', {
      accountId, title: t, date, priority, note, done: false, createdAt: Date.now(),
    });
  },

  async toggle(repo, id) {
    const it = await repo.get('todoplan', id);
    if (!it) throw new Error('计划不存在');
    it.done = !it.done;
    return repo.put('todoplan', it);
  },

  async update(repo, id, patch) {
    const it = await repo.get('todoplan', id);
    if (!it) throw new Error('计划不存在');
    if (patch.title !== undefined) {
      const t = String(patch.title || '').trim();
      if (!t) throw new Error('计划内容不能为空');
      patch.title = t;
    }
    if (patch.priority !== undefined && !PRIORITIES.includes(patch.priority)) {
      patch.priority = '中';
    }
    Object.assign(it, patch);
    return repo.put('todoplan', it);
  },

  async remove(repo, id) {
    return repo.remove('todoplan', id);
  },

  async removeByDate(repo, accountId, date) {
    return repo.removeWhere('todoplan', (r) => r.accountId === accountId && r.date === date);
  },

  // 月度概览：汇总指定月份（YYYY-MM）的总数/完成/未完成，并按天聚合
  async monthSummary(repo, accountId, month) {
    const rows = await repo.list('todoplan', (r) => r.accountId === accountId && r.date && r.date.startsWith(month));
    const byDay = {};
    let total = 0, done = 0;
    for (const r of rows) {
      total += 1;
      if (r.done) done += 1;
      if (!byDay[r.date]) byDay[r.date] = { total: 0, done: 0 };
      byDay[r.date].total += 1;
      if (r.done) byDay[r.date].done += 1;
    }
    return { month, total, done, undone: total - done, byDay };
  },
};