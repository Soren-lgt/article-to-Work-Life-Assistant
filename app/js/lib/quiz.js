// AI生成
// 题库业务逻辑（可在 Node 测试）
import { QUIZ_CATEGORIES } from './schema.js';

export const CHOICE_TYPES = ['single', 'multiple', 'judge'];

// P6：题目类型固定顺序——单选 → 多选 → 判断 → 问答 → 代码
export const QUESTION_TYPE_ORDER = ['single', 'multiple', 'judge', 'qa', 'code'];
export const TYPE_LABELS = { single: '单选', multiple: '多选', judge: '判断', qa: '问答', code: '代码' };

// P6：考试模式按题型定量随机抽取（合计 42 题）
export const EXAM_PLAN = [
  { type: 'single', count: 20 },
  { type: 'multiple', count: 5 },
  { type: 'judge', count: 10 },
  { type: 'qa', count: 5 },
  { type: 'code', count: 2 },
];

// 纯函数：题目的题型键（选择类看 type，问答/代码看 categoryKey）
export function questionTypeKey(q) {
  if (!q) return '';
  if (q.categoryKey === 'choice') return q.type || 'single';
  return q.categoryKey === 'qa' ? 'qa' : 'code';
}

// 纯函数：顺序练习题目排序——题库按传入顺序（选择第一个 → 代码最后一个），题目按题型排序
export function buildSequentialQuestions(banks = [], questions = []) {
  const bankOrder = new Map(banks.map((b, i) => [b.id, i]));
  const typeRank = new Map(QUESTION_TYPE_ORDER.map((t, i) => [t, i]));
  const base = [...questions].sort((a, b) => {
    const ai = bankOrder.has(a.bankId) ? bankOrder.get(a.bankId) : Number.MAX_SAFE_INTEGER;
    const bi = bankOrder.has(b.bankId) ? bankOrder.get(b.bankId) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
  // 稳定排序：题型优先，同题型保持题库/录入顺序
  return base.sort((a, b) => {
    const ra = typeRank.has(questionTypeKey(a)) ? typeRank.get(questionTypeKey(a)) : 99;
    const rb = typeRank.has(questionTypeKey(b)) ? typeRank.get(questionTypeKey(b)) : 99;
    return ra - rb;
  });
}

// 纯函数：洗牌后取前 n 个（不改原数组）
export function takeRandom(list = [], n = 0, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(0, Math.min(n, arr.length)));
}

// 纯函数：按题型配额随机抽题，返回题目与「想要/实际取到」明细
export function drawExamQuestions(questions = [], rng = Math.random, plan = EXAM_PLAN) {
  const pools = new Map(QUESTION_TYPE_ORDER.map((t) => [t, []]));
  for (const q of questions) {
    const key = questionTypeKey(q);
    if (pools.has(key)) pools.get(key).push(q);
  }
  const list = [];
  const detail = [];
  for (const item of plan) {
    const got = takeRandom(pools.get(item.type) || [], item.count, rng);
    list.push(...got);
    detail.push({ type: item.type, label: TYPE_LABELS[item.type], want: item.count, got: got.length });
  }
  return { list, detail, total: list.length };
}

// 纯函数：各题型题目数量
export function typeCounts(questions = []) {
  const counts = {};
  for (const t of QUESTION_TYPE_ORDER) counts[t] = 0;
  for (const q of questions) {
    const key = questionTypeKey(q);
    if (counts[key] != null) counts[key] += 1;
  }
  return counts;
}

// 纯函数：考试配额说明文案
export function examPlanText(plan = EXAM_PLAN) {
  const total = plan.reduce((sum, p) => sum + p.count, 0);
  return plan.map((p) => `${p.count} ${TYPE_LABELS[p.type]}`).join(' / ') + `（共 ${total} 题）`;
}

export const Quiz = {
  categories() { return QUIZ_CATEGORIES; },
  QUESTION_TYPE_ORDER,
  TYPE_LABELS,
  typeLabel(type) { return TYPE_LABELS[type] || type; },
  typeCounts(questions) { return typeCounts(questions); },
  examPlanText(plan) { return examPlanText(plan); },
  drawExamQuestions(questions, rng) { return drawExamQuestions(questions, rng); },

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

  // P6：按「选择 → 问答 → 代码」分类顺序、同类按创建时间排出的全部题库
  async listAllBanks(repo, accountId) {
    const rows = await repo.list('bank', (r) => r.accountId === accountId);
    const catOrder = new Map(QUIZ_CATEGORIES.map((c, i) => [c.key, i]));
    return rows.sort((a, b) => {
      const ai = catOrder.has(a.categoryKey) ? catOrder.get(a.categoryKey) : 9;
      const bi = catOrder.has(b.categoryKey) ? catOrder.get(b.categoryKey) : 9;
      if (ai !== bi) return ai - bi;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  },

  // P6：顺序练习题目源——全部题库按顺序汇总，题目按 单选/多选/判断/问答/代码 排序
  async practiceQuestions(repo, accountId) {
    const [banks, questions] = await Promise.all([
      this.listAllBanks(repo, accountId),
      this.listAllQuestions(repo, accountId),
    ]);
    return buildSequentialQuestions(banks, questions);
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