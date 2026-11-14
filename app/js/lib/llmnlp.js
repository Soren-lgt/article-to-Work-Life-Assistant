// AI生成
// P18：用大模型做 NLP——从口语里抽实体（金额/日期/分类/标题/标签/情绪/一句话摘要）
// 作用有两个：
//   1) 补盲：路由拿到的指令缺金额/日期/分类时，用 NLP 结果补上（规则正则经常漏「二十五块」「上礼拜」这类说法）；
//   2) 喂记忆：标签 + 情绪 + 摘要写进宠物记忆库，给「性格/习惯养成」用。
// 同样是纯函数 + 可注入网络层，Node 可直接测。

import {
  extractJson, isDateLike, cnNumToNumber, resolveRelativeDate, normalizeCategory, cleanTitle,
} from './llm.js';
import { normalizeText } from './petintent.js';

export const EMOTIONS = ['开心', '平静', '疲惫', '焦虑', '难过', '生气', '未知'];

// 模型常用近义词描述情绪，收敛成这 7 类，画像统计才不会碎成一堆
const EMOTION_ALIASES = {
  高兴: '开心', 愉快: '开心', 兴奋: '开心', 满足: '开心', 喜悦: '开心', 舒服: '开心',
  平淡: '平静', 一般: '平静', 还行: '平静', 正常: '平静', 日常: '平静',
  累: '疲惫', 好累: '疲惫', 困: '疲惫', 疲劳: '疲惫', 没劲: '疲惫',
  烦: '焦虑', 烦躁: '焦虑', 紧张: '焦虑', 压力: '焦虑', 担心: '焦虑', 慌: '焦虑',
  难受: '难过', 失落: '难过', 委屈: '难过', 不开心: '难过', 伤心: '难过',
  气: '生气', 生气: '生气', 愤怒: '生气', 火大: '生气',
};

// 这些词太泛，做长期记忆的标签没意义
const TAG_STOPWORDS = ['今天', '明天', '昨天', '事情', '东西', '什么', '一下', '感觉', '有点', '然后', '就是', '这个', '那个'];
const PEOPLE_STOPWORDS = ['我', '我们', '你', '你们', '他', '她', '他们', '她们', '它', '自己', '别人', '大家', '有人'];
const CATEGORIES = ['早餐', '中餐', '晚餐', '夜宵', '交通', '水果', '零食', '购物', '医疗', '娱乐', '房租', '其他'];

export function todayStr(today) {
  const d = today instanceof Date ? today : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildNlpMessages(text, { today = new Date() } = {}) {
  const system = [
    '你是中文口语信息抽取器（NLP）。只输出一行 JSON，不要解释、不要代码块。',
    '字段固定：',
    '{',
    ' "summary": "不超过20字的一句话概括，保留原意",',
    ' "amount": 数字或 null,',
    ' "date": "YYYY-MM-DD" 或 null,',
    ` "category": "${CATEGORIES.join('|')}" 或 null,`,
    ' "title": "如果是待办/任务/Bug，抽出事情本身；否则 null",',
    ' "people": ["提到的人名或称呼"],',
    ' "tags": ["2~4 个主题词，用于长期记忆，如 打车/加班/室友"],',
    ` "emotion": "${EMOTIONS.join('|')}"`,
    '}',
    '规则：中文数字转阿拉伯数字；相对日期按今天换算；没有的字段给 null，不要编。',
  ].join('\n');
  const user = `今天是 ${todayStr(today)}。原话：「${String(text || '').trim()}」`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function cleanStr(v, max = 60) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function cleanTags(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const t of v) {
    const s = cleanStr(t, 12).replace(/[#＃]/g, '');
    if (!s || TAG_STOPWORDS.includes(s) || out.includes(s)) continue;
    out.push(s);
    if (out.length >= 5) break;
  }
  return out;
}

function normalizeEmotion(value) {
  const raw = cleanStr(value, 8);
  if (!raw) return '未知';
  if (EMOTIONS.includes(raw)) return raw;
  return EMOTION_ALIASES[raw] || '未知';
}

function cleanPeople(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const p of v) {
    const s = cleanStr(p, 20).replace(/^(和|跟|与)/, '');
    if (!s || PEOPLE_STOPWORDS.includes(s) || out.includes(s)) continue;
    out.push(s);
    if (out.length >= 4) break;
  }
  return out;
}

// 模型算错日期（比如算成 1970 或三年后）不能直接写进账本
function plausibleDate(date, today = new Date()) {
  if (!isDateLike(date)) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yearAhead = base + 366 * 24 * 3600 * 1000;
  if (t < Date.parse('2000-01-01') || t > yearAhead) return null;
  return date;
}

export function parseNlpJson(raw, { today = new Date() } = {}) {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  // 金额：模型可能给 "13"、"十三块五"、"13元"，统一走口语数字解析
  const amountNum = cnNumToNumber(obj.amount);
  const amount = amountNum != null && Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 1000000
    ? Math.round(amountNum * 100) / 100 : null;

  // 日期：模型可能给「上礼拜三」这种口语，也可能给标准日期，都收口
  const date = plausibleDate(resolveRelativeDate(obj.date, today), today);

  const category = normalizeCategory(obj.category);
  const emotion = normalizeEmotion(obj.emotion);
  const summary = cleanStr(obj.summary, 60);
  const title = cleanTitle(obj.title, 60) || null;
  const people = cleanPeople(obj.people);
  const tags = cleanTags(obj.tags);

  if (!summary && amount === null && !date && !title && !category && !tags.length) return null;

  return {
    summary: summary || '',
    amount,
    date,
    category,
    title,
    people,
    tags,
    emotion,
    source: 'llm-nlp',
  };
}

// 这条指令需不需要再补一轮 NLP：记账缺关键字段、或纯聊天（要标签喂记忆）
export function needsNlp(intent) {
  if (!intent) return false;
  if (intent.type === 'expense') return !intent.amount || !intent.category;
  if (intent.type === 'chat') return true;
  if (intent.type === 'planAdd' || intent.type === 'bug' || intent.type === 'devTask') return !intent.title;
  return false;
}

// 把 NLP 结果并进指令：只补空，不覆盖已经确定的字段
export function applyNlp(intent, nlp) {
  if (!intent) return intent;
  if (!nlp) return intent;
  const out = Object.assign({}, intent);

  if (out.type === 'expense') {
    if (out.amount == null && nlp.amount != null) out.amount = nlp.amount;
    if (!out.category && nlp.category) out.category = nlp.category;
    if (!out.note && nlp.summary) out.note = nlp.summary;
    if (nlp.date) out.date = nlp.date; // 大模型理解了「上礼拜」这类相对说法，日期以它为准
  }
  if ((out.type === 'planAdd' || out.type === 'bug' || out.type === 'devTask') && !out.title && nlp.title) {
    out.title = nlp.title;
  }
  if (!out.date && nlp.date) out.date = nlp.date;

  out.nlp = {
    summary: nlp.summary || normalizeText(intent.raw || ''),
    tags: nlp.tags || [],
    emotion: nlp.emotion || '未知',
    people: nlp.people || [],
    amount: nlp.amount,
    category: nlp.category,
    date: nlp.date,
  };
  return out;
}

export async function llmNlp(text, { today = new Date(), complete, timeoutMs = 20000 } = {}) {
  if (!complete || !String(text || '').trim()) return null;
  let timer = null;
  try {
    const raw = await Promise.race([
      complete(buildNlpMessages(text, { today })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('nlp timeout')), timeoutMs); }),
    ]);
    return parseNlpJson(raw, { today });
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 一次完整的「补盲」：需要才调用，不需要就不花第二次模型钱
export async function enrichIntent(text, intent, { today = new Date(), complete } = {}) {
  if (!needsNlp(intent)) return { intent, nlp: null };
  const nlp = await llmNlp(text, { today, complete });
  return { intent: applyNlp(intent, nlp), nlp };
}
