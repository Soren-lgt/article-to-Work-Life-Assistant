// AI生成
// 小白的「全功能指令」解析：把一句话路由到 app 里的各个模块
// 覆盖：每日记账（记账/查账）、今日计划（加计划/看计划）、开发工作（记 Bug/加开发任务）、
//      同组计划（查看）、题库（练习/考试）、主题切换、打开任意页面、帮助
// 全部是纯函数，Node 里可直接测。

import { normalizeText, parsePetIntent, detectDate } from './petintent.js';

// 页面：关键词 → 路由 key（app.js 里 MODULES 的键）与显示名
export const PAGES = [
  { key: 'home', label: '首页总览', re: /(首页|主页|概览|总览|首页总览)/ },
  { key: 'today', label: '今日计划', re: /(今日计划|今天的计划|计划页|今日任务)/ },
  { key: 'devwork', label: '开发工作', re: /(开发工作|开发页|开发任务页)/ },
  { key: 'group', label: '同组计划', re: /(同组计划|小组计划|同组页|同组|小组|团队计划)/ },
  { key: 'quiz', label: '题库', re: /(题库|刷题页|练习题页)/ },
  { key: 'ledger', label: '每日记账', re: /(每日记账|记账页|记账|账单页)/ },
];

// 主题关键词 → 主题 key（与 lib/theme.js 的 THEME_LIST 一致）
export const THEME_WORDS = [
  { key: 'night', label: '暗夜青蓝', re: /(暗夜|深夜|夜间|黑夜|深色|暗色|暗黑)/ },
  { key: 'classic', label: '经典蓝白', re: /(经典|蓝白|浅色|亮色)/ },
  { key: 'indigo', label: '靛紫现代', re: /(靛蓝|靛紫|紫色|蓝紫)/ },
  { key: 'forest', label: '墨绿沉稳', re: /(墨绿|森林|绿色)/ },
  { key: 'warm', label: '暖纸橘棕', re: /(暖纸|暖色|橘棕|橘色|棕色)/ },
];

const NAV_VERB_RE = /(打开|进入|跳到|切到|切换到|切换|去|看看|看一下|显示|回到)/;
const NAV_START_RE = /^(?:打开|进入|跳到|切到|切换到|切换|去|看看|看一下|显示|回到)(?:一下)?/;
const THEME_VERB_RE = /(换|切换|切|改成|改|用|要|调)/;
const ADD_VERB_RE = /(加|记|记录|新增|添加|新建|安排|提醒|提醒我|来|建)/;
const ASK_RE = /(什么|哪些|多少|有没有|查看|查一下|列一下|看看|列|有几|有什么)/;

const PLAN_NOUN_RE = /(计划|待办|代办|任务|提醒)/;
const DEV_NOUN_RE = /(bug|缺陷|报错|故障|问题)/i;

// 去掉指令词与时间词，留下真正要做的事
export function extractTitle(input) {
  let t = normalizeText(input);
  t = t
    .replace(NAV_START_RE, '')
    .replace(/^(?:帮我|请|麻烦|你|给我)/, '')
    .replace(ADD_VERB_RE, '')
    .replace(/(开发任务里|开发工作里|开发里|任务里|计划里|待办里|提醒里)/g, '')
    .replace(/^(?:一下|一个|一条|个|条|下|里|们)/, '')
    .replace(PLAN_NOUN_RE, '')
    .replace(DEV_NOUN_RE, '')
    .replace(/^(?:开发工作|开发任务|开发)/, '')
    .replace(/(今天|明天|昨天|前天|今日|明日|昨日)/g, '')
    .replace(/^[，,。：:、\s]+/, '')
    .replace(/[，,。：:、\s]+$/, '')
    .trim();
  return t;
}

// 找页面
export function detectPage(input) {
  const t = normalizeText(input);
  for (const p of PAGES) {
    if (p.re.test(t)) return p;
  }
  return null;
}

// 找主题
export function detectTheme(input) {
  const t = normalizeText(input);
  for (const th of THEME_WORDS) {
    if (th.re.test(t)) return th;
  }
  return null;
}

// 主路由：先让记账/查账拿走（这两句最常用），再依次判定其它功能
export function routeUtterance(input, { today = new Date() } = {}) {
  const t = normalizeText(input);
  if (!t) return { type: 'empty', raw: '' };

  const base = parsePetIntent(t, { today });
  if (base.type === 'expense' || base.type === 'query') return base;

  // 换主题
  const theme = detectTheme(t);
  if (theme && (THEME_VERB_RE.test(t) || /(主题|外观|皮肤|模式)/.test(t))) {
    return { type: 'theme', theme: theme.key, label: theme.label, raw: t };
  }

  // 打开某个页面
  const page = detectPage(t);
  if (page && NAV_VERB_RE.test(t)) {
    return { type: 'navigate', page: page.key, label: page.label, raw: t };
  }

  // 题库：开始练习 / 考试
  if (/(练习|做题|刷题)/.test(t)) {
    return { type: 'quiz', mode: 'practice', page: 'quiz', raw: t };
  }
  if (/(考试|测验|考一场|考一下)/.test(t)) {
    return { type: 'quiz', mode: 'exam', page: 'quiz', raw: t };
  }

  // 开发工作：记 Bug
  if (DEV_NOUN_RE.test(t) && (ADD_VERB_RE.test(t) || /(出现)/.test(t))) {
    const title = extractTitle(t) || '待补充的 Bug';
    return { type: 'bug', title, page: 'devwork', raw: t };
  }

  // 开发工作：加开发任务
  if (/开发/.test(t) && /(任务|待办|todo)/.test(t) && ADD_VERB_RE.test(t)) {
    const title = extractTitle(t) || '待补充的开发任务';
    return { type: 'devTask', title, page: 'devwork', raw: t };
  }

  // 同组计划：查任务 / 打开
  if (/(同组|小组|团队)/.test(t) && /(任务|计划|待办)/.test(t)) {
    return { type: 'groupQuery', page: 'group', raw: t };
  }

  // 今日计划：加一条
  if (PLAN_NOUN_RE.test(t) && ADD_VERB_RE.test(t)) {
    const title = extractTitle(t);
    if (title) {
      return { type: 'planAdd', title, date: detectDate(t, today), page: 'today', raw: t };
    }
  }

  // 今日计划：查看
  if (PLAN_NOUN_RE.test(t) && ASK_RE.test(t)) {
    return { type: 'planQuery', date: detectDate(t, today), page: 'today', raw: t };
  }

  // 只说了页面名本身 → 直接打开
  if (page) return { type: 'navigate', page: page.key, label: page.label, raw: t };

  if (base.type === 'greet' || base.type === 'help') return base;
  return { type: 'unknown', raw: t };
}

// ---------- 回复文案（纯函数，便于测试） ----------

export function answerForNavigate(intent) {
  return `好，带你去「${intent.label}」。`;
}

export function answerForTheme(intent) {
  return `换好了，现在是「${intent.label}」主题。`;
}

export function answerForPlanAdded(result) {
  const day = String(result.date).slice(5).replace('-', '/');
  return `记下了：${day} 的「${result.title}」。`;
}

export function answerForPlanList(summary) {
  const day = String(summary.date).slice(5).replace('-', '/');
  const items = (summary.items || []).filter((it) => !it.done);
  if (!summary.items || !summary.items.length) {
    return `${day} 还没有计划，跟我说「加个计划，晚上复习英语」就行。`;
  }
  const text = summary.items.slice(0, 3).map((it) => `${it.done ? '✓' : '·'}${it.title}`).join('；');
  const rest = summary.items.length > 3 ? `（还有 ${summary.items.length - 3} 条）` : '';
  return `${day} 一共 ${summary.items.length} 条计划，待办 ${items.length} 条：${text}${rest}。`;
}

export function answerForBug(intent) {
  return `Bug 记上了：「${intent.title}」，已经放在「开发工作」里，状态是待处理。`;
}

export function answerForDevTask(intent) {
  return `开发任务记上了：「${intent.title}」，在「开发工作」里。`;
}

export function answerForQuiz(intent) {
  const mode = intent.mode === 'exam' ? '考试' : '练习';
  return `带你去题库了，选好题库点「开始${mode}」就行。`;
}

export function answerForGroup() {
  return '带你去「同组计划」了，那里能看到小组里分配给你的任务。';
}

export const HELP_TEXT = '我能干这些：① 记账「今天中午花了13块吃中饭」；② 查账「今天花了多少」；'
  + '③ 加计划「记个计划，明天交实验报告」；④ 看计划「今天有什么计划」；'
  + '⑤ 记 Bug「记个 bug，登录按钮点了没反应」；⑥ 加开发任务「开发任务里加个任务，接登录接口」；'
  + '⑦ 打开页面「打开每日记账」；⑧ 换主题「换成暗色主题」；⑨ 做题「开始练习」。';
