// AI生成
// P17：把一句话交给大模型「整理成受控指令」——输出必须是固定的 JSON 指令对象
// 设计要点：
// 1) 纯函数先行：提示词构建（buildRouteMessages）、返回解析与白名单校验（parseRouteJson）都能在 Node 单测；
// 2) 网络层可注入（complete），没网/没配 key 时返回 null，调用方回退到本地正则路由（routeUtterance）；
// 3) 页面不直接发外网请求（CORS + 密钥泄露），桌面版走主进程 IPC 桥 window.worklifeLLM。

import { PAGES, THEME_WORDS } from './petcommands.js';

export const ROUTE_TYPES = [
  'expense', 'query', 'navigate', 'theme', 'quiz',
  'planAdd', 'planQuery', 'bug', 'devTask', 'groupQuery', 'chat',
];

export const PAGE_KEYS = PAGES.map((p) => p.key);
export const THEME_KEYS = THEME_WORDS.map((t) => t.key);

function todayStr(today) {
  const d = today instanceof Date ? today : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDateLike(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// —— 口语数字：把「十三」「一百二十」「十三块五」转成阿拉伯数字（模型偶尔还会吐中文数字） ——
const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000 };

function cnInteger(str) {
  const text = String(str || '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0;
  let section = 0;
  let num = 0;
  let lastUnit = 0;
  let zeroSeen = false;
  for (const ch of text) {
    if (ch in CN_DIGITS) {
      num = CN_DIGITS[ch];
      if (num === 0) zeroSeen = true;
    } else if (ch in CN_UNITS) {
      section += (num || 1) * CN_UNITS[ch];
      lastUnit = CN_UNITS[ch];
      num = 0;
      zeroSeen = false;
    } else if (ch === '万') {
      total += (section + num) * 10000;
      section = 0;
      num = 0;
      lastUnit = 10000;
      zeroSeen = false;
    } else return null;
  }
  // 口语省略末位单位：「两百五」=250、「一百二」=120；带「零」的「一千零五」=1005 不缩
  if (num > 0 && lastUnit >= 100 && !zeroSeen) num *= lastUnit / 10;
  return total + section + num;
}

export function cnNumToNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let str = String(input == null ? '' : input).trim();
  if (!str) return null;
  str = str.replace(/^(约|大概|差不多|一共|总共)/, '').trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(str)) return Number(str);
  const frac = str.match(/^([\d一二三四五六七八九十两]+)(毛|角)$/);
  if (frac) {
    const n = cnInteger(frac[1]);
    return n == null ? null : n / 10;
  }
  // 「7分」「9个人」「13块」这类带量词的，去掉量词再走数字解析
  str = str.replace(/(分|个|次|人|块|元)$/, '').trim();
  const [yuanRaw, jiaoRaw] = str.split(/块|元/);
  const yuan = cnInteger(yuanRaw);
  if (yuan == null) return null;
  if (jiaoRaw === undefined || jiaoRaw === '') return yuan;
  const jiaoText = String(jiaoRaw).replace(/[毛角分钱]/g, '');
  if (/^\d$/.test(jiaoText)) return yuan + Number(jiaoText) / 10;
  if (jiaoText.length === 1 && jiaoText in CN_DIGITS) return yuan + CN_DIGITS[jiaoText] / 10;
  return yuan;
}

// —— 口语日期：今天/昨天/大前天/上周三/下礼拜五/三天后/月底… ——
const REL_DAYS = {
  今天: 0, 今日: 0, 昨天: -1, 昨日: -1, 前天: -2, 大前天: -3,
  明天: 1, 明日: 1, 后天: 2, 大后天: 3,
};
const WEEK_CHARS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

function shiftDay(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function resolveRelativeDate(input, today = new Date()) {
  const str = String(input == null ? '' : input).trim();
  if (!str) return null;
  if (isDateLike(str)) return str;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (str in REL_DAYS) return shiftDay(base, REL_DAYS[str]);

  const week = str.match(/^(上|本|这|下)?(?:个)?(?:周|礼拜|星期)([一二三四五六日天])$/);
  if (week) {
    const target = WEEK_CHARS[week[2]];
    const curMon = (base.getDay() + 6) % 7; // 周一算 0
    const tgtMon = (target + 6) % 7;
    let delta = tgtMon - curMon;
    if (week[1] === '下') delta += 7;
    else if (week[1] === '上') delta -= 7;
    return shiftDay(base, delta);
  }
  const days = str.match(/^(\d+|[一二三四五六七八九十]+)天([前后])$/);
  if (days) {
    const n = cnInteger(days[1]);
    if (n == null) return null;
    return shiftDay(base, days[2] === '前' ? -n : n);
  }
  if (/月底$/.test(str)) return shiftDay(new Date(base.getFullYear(), base.getMonth() + 1, 0), 0);
  if (/月初$/.test(str)) return shiftDay(new Date(base.getFullYear(), base.getMonth(), 1), 0);
  const month = str.match(/^(上|下|这个?)?个?月$/);
  if (month) {
    const off = month[1] === '上' ? -1 : month[1] === '下' ? 1 : 0;
    const d = new Date(base.getFullYear(), base.getMonth() + off, 1);
    return todayStr(d);
  }
  return null;
}

// —— 模型偶尔用中文说 type / 分类，这里做同义词收口 ——
const TYPE_ALIASES = {
  记账: 'expense', 花费: 'expense', 消费: 'expense', 支出: 'expense', 花钱: 'expense',
  查询: 'query', 统计: 'query', 查看: 'query',
  打开: 'navigate', 切换: 'navigate', 跳转: 'navigate', 页面: 'navigate',
  主题: 'theme', 皮肤: 'theme', 外观: 'theme',
  练习: 'quiz', 考试: 'quiz', 刷题: 'quiz', 做题: 'quiz',
  聊天: 'chat', 闲聊: 'chat', 随口说: 'chat',
  计划: 'planAdd', 待办: 'planAdd', 加计划: 'planAdd', 记计划: 'planAdd',
  问题: 'bug', 报错: 'bug', 缺陷: 'bug', bug记录: 'bug',
  任务: 'devTask', 开发: 'devTask', 开发任务: 'devTask',
  同组: 'groupQuery', 协作: 'groupQuery', 小组: 'groupQuery',
  查看计划: 'planQuery', 看计划: 'planQuery',
};

export function normalizeType(value) {
  const raw = String(value == null ? '' : value).trim();
  if (ROUTE_TYPES.includes(raw)) return raw;
  return TYPE_ALIASES[raw] || null;
}

const CATEGORY_ALIASES = {
  早饭: '早餐', 早点: '早餐', 早餐: '早餐', 早上: '早餐',
  午饭: '中餐', 午餐: '中餐', 吃饭: '中餐', 中饭: '中餐', 正餐: '中餐',
  晚饭: '晚餐', 晚上吃饭: '晚餐',
  宵夜: '夜宵', 夜宵: '夜宵',
  打车: '交通', 出租车: '交通', 公交: '交通', 地铁: '交通', 车费: '交通', 高铁: '交通', 加油: '交通',
  奶茶: '零食', 饮料: '零食', 零食: '零食', 小吃: '零食',
  水果: '水果',
  买菜: '购物', 超市: '购物', 网购: '购物', 购物: '购物', 买东西: '购物',
  看病: '医疗', 药: '医疗', 买药: '医疗', 医院: '医疗', 医疗: '医疗',
  电影: '娱乐', 游戏: '娱乐', 健身: '娱乐', 娱乐: '娱乐',
  房租: '房租', 水电: '房租', 水电费: '房租',
};

export function normalizeCategory(value) {
  const raw = String(value == null ? '' : value).trim();
  const list = ['早餐', '中餐', '晚餐', '夜宵', '交通', '水果', '零食', '购物', '医疗', '娱乐', '房租', '其他'];
  if (list.includes(raw)) return raw;
  return CATEGORY_ALIASES[raw] || null;
}

// 标题去掉「帮我/记一下/加个计划」这类口水前缀，只留事情本身
export function cleanTitle(value, max = 60) {
  let text = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  let hadPrefix = false;
  const p1 = /^(帮我|麻烦|请|给我|替我|帮忙)/;
  const p2 = /^(记一下|记一个|记录一下|记录|记个|加一个|加个|新增|添加|安排)/;
  const p3 = /^(开发任务|任务|计划项|计划|待办|事项)/;
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    if (p1.test(text)) { text = text.replace(p1, ''); hadPrefix = true; }
    if (p2.test(text)) { text = text.replace(p2, ''); hadPrefix = true; }
    // 只在前面确实剥过口水词时才敢剥「计划/任务」，否则「计划明天交作业」会被剥坏
    if (hadPrefix && p3.test(text)) text = text.replace(p3, '');
    text = text.replace(/^[：:，,、。\s]+/, '').trim();
    if (text === before) break;
  }
  return text.replace(/[。！!\s]+$/, '').slice(0, max);
}

// 提示词：只给「指令协议」，不给业务说明，让模型把口水话整理成字段
export function buildRouteMessages(text, { today = new Date() } = {}) {
  const system = [
    '你是「工作生活助手」里的指令整理器。用户说了一句中文口语，你只负责把它整理成一条 JSON 指令，不要解释、不要寒暄。',
    '可用 type 与字段：',
    '{"type":"expense","amount":数字,"category":"早/中/晚餐、夜宵、交通、水果、零食、购物、医疗、娱乐、房租、其他之一","date":"YYYY-MM-DD","note":"简短原文"}  记账',
    '{"type":"query","date":"YYYY-MM-DD"}  查当天花了多少',
    '{"type":"planAdd","title":"要做的事","date":"YYYY-MM-DD"}  加今日计划',
    '{"type":"planQuery","date":"YYYY-MM-DD"}  查看当天计划',
    '{"type":"bug","title":"问题描述"}  记 Bug',
    '{"type":"devTask","title":"任务标题"}  加开发任务',
    `{"type":"navigate","page":"${PAGE_KEYS.join('|')}"}  打开页面`,
    `{"type":"theme","theme":"${THEME_KEYS.join('|')}"}  换主题`,
    '{"type":"quiz","mode":"practice|exam"}  练习/考试',
    '{"type":"groupQuery"}  查看同组计划',
    '{"type":"chat","reply":"回一句简短口语"}  只是聊天、不涉及任何操作时用这个',
    '规则：日期相对今天换算成具体日期；金额把中文数字转成阿拉伯数字；title 只留事情本身，去掉「帮我、记一下、加个」这类词；',
    '拿不准就用 chat，不要编造字段。只输出一行 JSON，不要代码块标记。',
  ].join('\n');
  const user = `今天是 ${todayStr(today)}。用户说：「${String(text || '').trim()}」`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// 从模型返回里抽 JSON（容忍 ```json 包裹、前后废话）
export function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

function cleanText(v, max = 80) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

// 白名单校验：模型可能乱给 type / 字段，越界的直接判无效（回退规则路由）
export function parseRouteJson(raw, { today = new Date() } = {}) {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== 'object') return null;
  const type = normalizeType(obj.type);
  if (!type) return null;

  const date = resolveRelativeDate(obj.date, today) || todayStr(today);

  if (type === 'expense') {
    const amount = cnNumToNumber(obj.amount);
    if (amount == null || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) return null;
    return { type, amount: Math.round(amount * 100) / 100, category: normalizeCategory(obj.category) || '其他', date, note: cleanText(obj.note, 40), source: 'llm' };
  }
  if (type === 'query') return { type, date, source: 'llm' };
  if (type === 'navigate') {
    if (!PAGE_KEYS.includes(obj.page)) return null;
    const label = (PAGES.find((p) => p.key === obj.page) || {}).label || '';
    return { type, page: obj.page, label, source: 'llm' };
  }
  if (type === 'theme') {
    if (!THEME_KEYS.includes(obj.theme)) return null;
    const label = (THEME_WORDS.find((t) => t.key === obj.theme) || {}).label || '';
    return { type, theme: obj.theme, label, source: 'llm' };
  }
  if (type === 'quiz') {
    return { type, mode: obj.mode === 'exam' ? 'exam' : 'practice', page: 'quiz', source: 'llm' };
  }
  if (type === 'planAdd') {
    const title = cleanTitle(obj.title, 60);
    if (!title) return null;
    return { type, title, date, page: 'today', source: 'llm' };
  }
  if (type === 'planQuery') return { type, date, page: 'today', source: 'llm' };
  if (type === 'bug' || type === 'devTask') {
    const title = cleanTitle(obj.title, 60);
    if (!title) return null;
    return { type, title, page: 'devwork', source: 'llm' };
  }
  if (type === 'groupQuery') return { type, page: 'group', source: 'llm' };
  if (type === 'chat') {
    const reply = cleanText(obj.reply, 200).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
    if (!reply) return null;
    return { type, reply, source: 'llm' };
  }
  return null;
}

// 默认的网络实现：桌面版 IPC 桥；网页版没有桥就返回 null（不发外网请求）
export function defaultComplete() {
  const bridge = (typeof window !== 'undefined' && window.worklifeLLM) || null;
  if (!bridge || !bridge.available) return null;
  return (messages) => bridge.chat(messages);
}

// 主入口：能拿到统一指令就返回，否则 null（调用方回退 routeUtterance）
export async function llmRoute(text, { today = new Date(), complete = defaultComplete(), timeoutMs = 20000, retry = true } = {}) {
  if (!complete || !String(text || '').trim()) return null;
  const deadline = Date.now() + timeoutMs;

  async function ask(messages, waitMs) {
    let timer = null;
    try {
      return await Promise.race([
        complete(messages),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('llm timeout')), waitMs); }),
      ]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const raw = await ask(buildRouteMessages(text, { today }), timeoutMs);
  if (!raw) return null;
  const intent = parseRouteJson(raw, { today });
  if (intent || !retry) return intent;

  // 第一次输出不合规：把它的回答贴回去，要求重写一次（真实模型偶发夹解释、字段写错）
  const left = deadline - Date.now();
  if (left < 1500) return null;
  const repair = buildRouteMessages(text, { today }).concat([
    { role: 'assistant', content: String(raw).slice(0, 400) },
    { role: 'user', content: '上一条不是合法指令。只输出一行 JSON，type 必须是前面列出的类型之一，amount 必须是数字。不要解释。' },
  ]);
  const raw2 = await ask(repair, left);
  return raw2 ? parseRouteJson(raw2, { today }) : null;
}

// 给调用方用：先大模型，拿不到就本地规则
export async function resolveIntent(text, { today = new Date(), complete = defaultComplete(), fallback } = {}) {
  const fromLlm = await llmRoute(text, { today, complete });
  if (fromLlm) return fromLlm;
  return fallback ? fallback(text, { today }) : null;
}
