// AI生成
// 题库业务逻辑（可在 Node 测试）
import { QUIZ_CATEGORIES } from './schema.js';

export const CHOICE_TYPES = ['single', 'multiple', 'judge'];

export const Quiz = {
  categories() { return QUIZ_CATEGORIES; },

  // 固定分类写入 category 表（幂等）
  async ensureCategories(repo) {
    const existing = await repo.all('category');
    const have = new Set(existing.map((c) => c.key));
    for (const c of QUIZ_CATEGORIES) {
      if (!have.has(c.key)) await repo.put('category', { ...c });
    }
    return this.categories();
  },

  // ---------- 题库 ----------
  async addBank(repo, accountId, categoryKey, name) {
    const n = String(name || '').trim();
    if (!n) throw new Error('题库名称不能为空');
    if (!QUIZ_CATEGORIES.some((c) => c.key === categoryKey)) throw new Error('非法题目类别');
    return repo.put('bank', { accountId, categoryKey, name: n, createdAt: Date.now() });
  },

  async listBanks(repo, accountId, categoryKey) {
    const rows = await repo.list('bank', (r) => r.accountId === accountId && (!categoryKey || r.categoryKey === categoryKey));
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async removeBank(repo, id) {
    const bank = await repo.get('bank', id);
    if (!bank) return false;
    await repo.remove('bank', id);
    await repo.removeWhere('question', (q) => q.bankId === id);
    return true;
  },

  // ---------- 题目 ----------
  async addQuestion(repo, bankId, data = {}) {
    const bank = await repo.get('bank', bankId);
    if (!bank) throw new Error('题库不存在');
    const cat = bank.categoryKey;
    const stem = String(data.stem || '').trim();
    if (!stem) throw new Error('题干不能为空');

    const q = { bankId, accountId: bank.accountId, categoryKey: cat, stem, createdAt: Date.now() };

    if (cat === 'choice') {
      const type = data.type || 'single';
      if (!CHOICE_TYPES.includes(type)) throw new Error('非法题型');
      q.type = type;
      q.options = Array.isArray(data.options) ? data.options.map((o) => String(o)) : [];
      if (type === 'judge' && q.options.length === 0) q.options = ['对', '错'];
      if (type !== 'judge' && q.options.length < 2) throw new Error('至少需要 2 个选项');
      if (type === 'multiple') {
        if (!Array.isArray(data.answer) || data.answer.length === 0) throw new Error('请设置正确答案');
        q.answer = data.answer.map((a) => String(a));
      } else {
        if (data.answer == null || data.answer === '') throw new Error('请设置正确答案');
        q.answer = String(data.answer);
      }
      q.analysis = String(data.analysis || '');
    } else if (cat === 'qa') {
      q.answer = String(data.answer || '');
      q.keywords = Array.isArray(data.keywords) ? data.keywords.map((k) => String(k).trim()).filter(Boolean) : [];
      if (q.keywords.length === 0) throw new Error('请至少填写一个关键词');
    } else {
      q.lang = String(data.lang || '');
      q.refCode = String(data.refCode || '');
      q.hint = String(data.hint || '');
    }
    return repo.put('question', q);
  },

  async listQuestions(repo, bankId) {
    const rows = await repo.list('question', (r) => r.bankId === bankId);
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  // F1：考试模式跨全部题库汇总该账号所有题目（不限制当前选中的 bankId）
  async listAllQuestions(repo, accountId) {
    const rows = await repo.list('question', (r) => r.accountId === accountId);
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async removeQuestion(repo, id) { return repo.remove('question', id); },

  // F2：编辑题目——保留 id/bankId/accountId/categoryKey/createdAt，仅更新可编辑字段
  async updateQuestion(repo, id, data = {}) {
    const q = await repo.get('question', id);
    if (!q) throw new Error('题目不存在');
    const next = { ...q };
    if (data.stem != null) {
      const stem = String(data.stem).trim();
      if (!stem) throw new Error('题干不能为空');
      next.stem = stem;
    }
    if (q.categoryKey === 'choice') {
      if (data.type) next.type = data.type;
      if (Array.isArray(data.options)) next.options = data.options;
      if (data.answer != null) next.answer = data.answer;
      if (data.analysis != null) next.analysis = String(data.analysis);
    } else if (q.categoryKey === 'qa') {
      if (data.answer != null) next.answer = String(data.answer);
      if (Array.isArray(data.keywords)) next.keywords = data.keywords;
    } else {
      if (data.lang != null) next.lang = String(data.lang);
      if (data.refCode != null) next.refCode = String(data.refCode);
      if (data.hint != null) next.hint = String(data.hint);
    }
    return repo.put('question', next);
  },

  // ---------- 抽题 ----------
  drawQuestions(questions, n, rng = Math.random) {
    const arr = [...questions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const count = Math.max(0, Math.min(n, arr.length));
    return arr.slice(0, count);
  },

  // ---------- 成绩记录 ----------
  async saveAttempt(repo, accountId, { bankId = null, mode = 'practice', score = 0, total = 0, details = [], startedAt = null, submittedAt = null, timeSpent = 0 } = {}) {
    return repo.put('attempt', {
      accountId, bankId, mode, score, total, details, startedAt, submittedAt, timeSpent, createdAt: Date.now(),
    });
  },

  async listAttempts(repo, accountId, bankId = null) {
    const rows = await repo.list('attempt', (r) => r.accountId === accountId && (!bankId || r.bankId === bankId));
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async removeAttempt(repo, id) { return repo.remove('attempt', id); },
};