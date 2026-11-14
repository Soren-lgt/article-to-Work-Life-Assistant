// AI生成
// 小宠物「任务话术库」：把 app 的每个功能写成小白自己能看懂的任务话术，
// 并把主人一句口语转成「type + 槽位 + 执行话术」，缺什么就问什么。
//
// 三层：
//   TASK_LIBRARY  话术库（每类功能一条：say 它要干什么、do 执行话术模板、slots 必填/可选槽 + 追问话术）
//   parseTaskJson 模型输出 → 受控任务（槽位白名单 + 数值/日期/分类归一）
//   askForMissing 缺槽 → 一句反问；mergeAnswer 主人回答 → 补槽
import {
  ROUTE_TYPES,
  cnNumToNumber,
  resolveRelativeDate,
  normalizeCategory,
  normalizeType,
  cleanTitle,
  extractJson,
} from './llm.js';
import { PAGES, THEME_WORDS, detectPage, detectTheme } from './petcommands.js';

const PAGE_KEYS = PAGES.map((p) => p.key);
const THEME_KEYS = THEME_WORDS.map((t) => t.key);
const CATEGORY_LIST = ['早餐', '中餐', '晚餐', '夜宵', '交通', '水果', '零食', '购物', '医疗', '娱乐', '房租', '其他'];

function todayStr(today) {
  const d = today instanceof Date ? today : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- 话术库 ----------

// 每类功能一条。slots 里 required=true 的槽必须齐了才敢执行，
// ask 是缺这个槽时小白原样问出口的话（尽量一次问清、别一句话问三遍）。
export const TASK_LIBRARY = [
  {
    type: 'expense',
    title: '记一笔账',
    page: 'ledger',
    say: '主人报了一笔花销，我要把它记进账本，记完回记账页给主人看一眼',
    do: '记一笔账：{category} {amount} 元，日期 {date}，记完回到记账页',
    slots: [
      { key: 'amount', label: '金额', required: true, kind: 'number', ask: '这一笔花了多少钱？' },
      { key: 'category', label: '分类', required: false, kind: 'category', ask: '这笔算哪一类？（早餐/中餐/晚餐/夜宵/交通/水果/零食/购物/医疗/娱乐/房租/其他）' },
      { key: 'date', label: '日期', required: false, kind: 'date', ask: '记到哪一天？', default: 'today' },
      { key: 'note', label: '备注', required: false, kind: 'text', ask: '要备注点什么吗？' },
    ],
  },
  {
    type: 'query',
    title: '查当天开销',
    page: 'ledger',
    say: '主人想知道某一天花了多少，我去账本上汇总一下',
    do: '查 {date} 的花销，汇总成一句报给主人，然后回到记账页',
    slots: [
      { key: 'date', label: '日期', required: false, kind: 'date', ask: '查哪一天的花销？', default: 'today' },
    ],
  },
  {
    type: 'planAdd',
    title: '加今日计划',
    page: 'today',
    say: '主人要往某天的计划里加一件事',
    do: '在 {date} 的计划里加一条「{title}」，加完回到今日计划页',
    slots: [
      { key: 'title', label: '内容', required: true, kind: 'title', ask: '要加的计划是什么事？' },
      { key: 'date', label: '日期', required: false, kind: 'date', ask: '加到哪一天？', default: 'today' },
    ],
  },
  {
    type: 'planQuery',
    title: '看今日计划',
    page: 'today',
    say: '主人想看看某天安排了什么',
    do: '列出 {date} 的计划，按时间顺序报给主人，然后回到今日计划页',
    slots: [
      { key: 'date', label: '日期', required: false, kind: 'date', ask: '看哪一天的计划？', default: 'today' },
    ],
  },
  {
    type: 'bug',
    title: '记一个 Bug',
    page: 'devwork',
    say: '主人发现了一个问题，我把它记进开发工作的 Bug 列表',
    do: '在开发工作里记一条 Bug「{title}」，记完回到开发页',
    slots: [
      { key: 'title', label: '问题', required: true, kind: 'title', ask: '这个 Bug 是什么现象？' },
    ],
  },
  {
    type: 'devTask',
    title: '加开发任务',
    page: 'devwork',
    say: '主人要往开发工作里加一条待办',
    do: '在开发工作里加一条任务「{title}」，加完回到开发页',
    slots: [
      { key: 'title', label: '任务', required: true, kind: 'title', ask: '这个开发任务要做什么？' },
    ],
  },
  {
    type: 'navigate',
    title: '打开页面',
    page: '',
    say: '主人想去某个页面，我直接把他带过去',
    do: '打开{pageLabel}页',
    slots: [
      { key: 'page', label: '页面', required: true, kind: 'page', ask: '要打开哪一页？（首页/今日计划/开发工作/同组计划/题库/每日记账）' },
    ],
  },
  {
    type: 'theme',
    title: '换主题',
    page: '',
    say: '主人想换外观，我切一套主题并记住',
    do: '把外观换成{themeLabel}',
    slots: [
      { key: 'theme', label: '主题', required: true, kind: 'theme', ask: '想换哪套？暗夜青蓝 / 经典蓝白 / 靛紫现代 / 墨绿沉稳 / 暖纸橘棕' },
    ],
  },
  {
    type: 'quiz',
    title: '刷题',
    page: 'quiz',
    say: '主人要练题或考试，我打开题库并按模式开始',
    do: '打开题库，按{mode}模式开始',
    slots: [
      { key: 'mode', label: '模式', required: false, kind: 'mode', ask: '要练习还是考试？', default: '练习' },
    ],
  },
  {
    type: 'groupQuery',
    title: '看同组计划',
    page: 'group',
    say: '主人想看小组的任务安排',
    do: '打开同组计划页，把手头任务报给主人',
    slots: [],
  },
  {
    type: 'chat',
    title: '闲聊',
    page: '',
    say: '主人只是在聊天，不写任何数据',
    do: '按画像回一句口语，不写任何数据',
    slots: [],
  },
];

export const TASK_LIBRARY_VERSION = 1;

export function taskFor(type) {
  const t = String(type == null ? '' : type).trim();
  return TASK_LIBRARY.find((x) => x.type === t) || null;
}

// ---------- 槽位 ----------

function isEmpty(v) {
  return v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
}

// 槽的默认值（date → 今天，quiz mode → 练习）
export function slotDefault(slot, { today = new Date() } = {}) {
  const d = slot && slot.default;
  if (d === 'today') return todayStr(today);
  if (d) return d;
  return null;
}

// 现有 intent（llm 路由 / 规则路由给的）里已经有值的话，直接当槽用
export function slotsFromIntent(intent) {
  const it = intent || {};
  const slots = {};
  if (!isEmpty(it.amount)) slots.amount = it.amount;
  if (!isEmpty(it.category)) slots.category = it.category;
  if (!isEmpty(it.date)) slots.date = it.date;
  if (!isEmpty(it.note)) slots.note = it.note;
  if (!isEmpty(it.title)) slots.title = it.title;
  if (!isEmpty(it.page)) slots.page = it.page;
  if (!isEmpty(it.theme)) slots.theme = it.theme;
  if (!isEmpty(it.mode)) slots.mode = it.mode;
  return slots;
}

// 缺哪些必填槽（只认 required）
export function missingSlots(task, slots = {}, { today = new Date() } = {}) {
  const t = task || taskFor(task);
  if (!t) return [];
  return (t.slots || []).filter((s) => {
    if (!s.required) return false;
    if (!isEmpty(slots[s.key])) return false;
    return isEmpty(slotDefault(s, { today }));
  });
}

// 缺槽时的一句话追问：一次最多问两个，多了主人也答不过来
export function askForMissing(task, missing, { max = 2 } = {}) {
  const t = task || taskFor(task);
  const list = (missing && missing.length ? missing : (t && t.slots ? t.slots : []))
    .filter((s) => s && s.ask);
  if (!list.length) return { text: '', keys: [] };
  const picked = list.slice(0, max);
  const keys = picked.map((s) => s.key);
  const parts = picked.map((s) => s.ask);
  let text = parts[0];
  if (parts.length > 1) text = text + '另外，' + parts[1];
  if (list.length > picked.length) text = text + '（其余的我可以先按默认来）';
  return { text, keys };
}

// 执行话术：把 do 模板里的占位换成真实值；没给的值写「（未说）」，一眼能看出漏了什么
export function composeScript(task, slots = {}, { today = new Date() } = {}) {
  const t = task || taskFor(task);
  if (!t) return '';
  const tpl = String(t.do || '');
  const fill = (raw, key) => {
    if (key === 'pageLabel') {
      const p = PAGES.find((x) => x.key === slots.page);
      return p ? p.label : '（未说）';
    }
    if (key === 'themeLabel') {
      const th = THEME_WORDS.find((x) => x.key === slots.theme);
      return th ? th.label : '（未说）';
    }
    if (key === 'mode') {
      const v = slots.mode || slotDefault((t.slots || []).find((s) => s.key === 'mode'), { today });
      return v === 'exam' ? '考试' : '练习';
    }
    const slot = (t.slots || []).find((s) => s.key === key);
    const v = isEmpty(slots[key]) ? slotDefault(slot, { today }) : slots[key];
    return isEmpty(v) ? '（未说）' : String(v);
  };
  return tpl.replace(/\{(\w+)\}/g, (_, key) => fill(key, key)).slice(0, 160);
}

// ---------- 从一句话里抽槽（模型没给全 / 主人在回答追问时用） ----------

function pickAmount(text) {
  const s = String(text || '');
  // 阿拉伯数字优先：13 / 13.5 / 13块
  const arabic = s.match(/(\d+(?:\.\d+)?)\s*(?:块钱|块|元|rmb|RMB)?/);
  if (arabic) {
    const n = cnNumToNumber(arabic[1]);
    if (n != null && n > 0) return n;
  }
  // 中文带量词：十三块五 / 两块 / 一百二
  const cn = s.match(/([一二三四五六七八九十百千万零两]+(?:块钱|块|元)[一二三四五六七八九十\d]*(?:毛|角|分)?)/);
  if (cn) {
    const n = cnNumToNumber(cn[1]);
    if (n != null && n > 0) return n;
  }
  // 只答了数、没带量词：十三 / 两百五
  const bare = s.match(/([一二三四五六七八九十百千万零两]+)(?=\s*$)/);
  if (bare) {
    const n = cnNumToNumber(bare[1]);
    if (n != null && n > 0) return n;
  }
  return null;
}

// 分类的口语说法（「中午吃的」「打车」这类原话要能归到 12 类里）
const CATEGORY_WORDS = [
  ['中餐', ['中餐', '午饭', '中午', '午餐']],
  ['早餐', ['早餐', '早饭', '早上吃']],
  ['晚餐', ['晚餐', '晚饭', '晚上吃']],
  ['夜宵', ['夜宵', '宵夜']],
  ['交通', ['交通', '地铁', '公交', '打车', '车费', '高铁', '火车', '加油']],
  ['水果', ['水果', '苹果', '香蕉', '西瓜']],
  ['零食', ['零食', '小吃', '奶茶', '咖啡']],
  ['购物', ['购物', '买东西', '超市', '衣服', '日用品']],
  ['医疗', ['医疗', '买药', '看病', '医院', '挂号']],
  ['娱乐', ['娱乐', '电影', '游戏', '唱歌', '门票']],
  ['房租', ['房租', '水电', '物业', '租金']],
];

function pickCategory(text) {
  const s = String(text || '');
  for (const c of CATEGORY_LIST) {
    if (s.includes(c)) return c;
  }
  for (const [cat, words] of CATEGORY_WORDS) {
    if (words.some((w) => s.includes(w))) return cat;
  }
  return normalizeCategory(s) || null;
}

// 「明天买牛奶」这种句子里夹着日期词的情况：先挑出日期词，再交给 resolveRelativeDate
const DATE_WORD_RE = /(大后天|大前天|今天|明天|后天|昨天|前天|月底|月初|上个月|下个月|(?:上|本|这|下)?(?:个)?(?:周|礼拜|星期)[一二三四五六日天]|(?:\d+|[一二三四五六七八九十]+)天[前后])/;

function pickDate(text, today) {
  const s = String(text || '').trim();
  const whole = resolveRelativeDate(s, today);
  if (whole) return whole;
  const hit = s.match(DATE_WORD_RE);
  if (hit) {
    const rel = resolveRelativeDate(hit[1], today);
    if (rel) return rel;
  }
  const iso = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return resolveRelativeDate(iso[1], today);
  const cn = s.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (cn) {
    const y = today instanceof Date ? today.getFullYear() : new Date().getFullYear();
    return `${y}-${String(cn[1]).padStart(2, '0')}-${String(cn[2]).padStart(2, '0')}`;
  }
  return null;
}

// 按任务声明的槽，从这句话里能抽到的都抽出来（抽不到的不瞎填）
export function extractSlotsFromText(task, text, { today = new Date() } = {}) {
  const t = task || taskFor(task);
  if (!t) return {};
  const keys = (t.slots || []).map((s) => s.key);
  const out = {};
  const s = String(text || '').trim();
  if (!s) return out;

  if (keys.includes('amount')) {
    const a = pickAmount(s);
    if (a != null) out.amount = a;
  }
  if (keys.includes('category')) {
    const c = pickCategory(s);
    if (c) out.category = c;
  }
  if (keys.includes('date')) {
    const d = pickDate(s, today);
    if (d) out.date = d;
  }
  if (keys.includes('page')) {
    const p = detectPage(s);
    if (p) out.page = p.key;
  }
  if (keys.includes('theme')) {
    const th = detectTheme(s);
    if (th) out.theme = th.key;
  }
  if (keys.includes('mode')) {
    if (/考试|测验|考一下/.test(s)) out.mode = 'exam';
    else if (/练习|练题|刷题|做题/.test(s)) out.mode = 'practice';
  }
  if (keys.includes('title')) {
    const title = cleanTitle(s, 60);
    if (title) out.title = title;
  }
  return out;
}

// 主人对追问的回答 → 补进槽里（同一个槽已有值就以新回答为准，比如改口说「其实16块」）
export function mergeAnswer(task, slots, answer, { today = new Date() } = {}) {
  const fresh = extractSlotsFromText(task, answer, { today });
  return Object.assign({}, slots || {}, fresh);
}

// ---------- 模型输出 → 受控任务 ----------

function normalizeSlotValue(slot, raw, { today = new Date() } = {}) {
  if (isEmpty(raw)) return null;
  switch (slot.kind) {
    case 'number': {
      const n = cnNumToNumber(raw);
      if (n == null || !Number.isFinite(n) || n <= 0 || n > 1000000) return null;
      return Math.round(n * 100) / 100;
    }
    case 'date':
      return resolveRelativeDate(raw, today) || null;
    case 'category':
      return normalizeCategory(raw) || null;
    case 'title': {
      const t = cleanTitle(raw, 60);
      return t || null;
    }
    case 'page':
      return PAGE_KEYS.includes(String(raw).trim()) ? String(raw).trim() : null;
    case 'theme':
      return THEME_KEYS.includes(String(raw).trim()) ? String(raw).trim() : null;
    case 'mode':
      return /exam|考试/.test(String(raw)) ? 'exam' : 'practice';
    default: {
      const s = String(raw).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
      return s || null;
    }
  }
}

// 解析模型给的 JSON：type 必须在话术库里，槽位按库里声明的收，
// 数值/日期/分类都归一；「缺什么」不信模型，一律按本地库重算
export function parseTaskJson(raw, { today = new Date() } = {}) {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== 'object') return null;
  const type = normalizeType(obj.type);
  if (!type) return null;
  const task = taskFor(type);
  if (!task) return null;

  const given = (obj.slots && typeof obj.slots === 'object') ? obj.slots : {};
  const slots = {};
  for (const slot of task.slots || []) {
    const v = normalizeSlotValue(slot, given[slot.key], { today });
    if (v != null) slots[slot.key] = v;
  }
  const missing = missingSlots(task, slots, { today }).map((s) => s.key);
  return {
    type,
    task,
    slots,
    missing,
    script: composeScript(task, slots, { today }),
    say: task.say,
  };
}

// 提示词：把话术库压缩成「可选任务 + 必填槽」，让模型只做槽位抽取
export function buildTaskMessages(text, { today = new Date() } = {}) {
  const lines = TASK_LIBRARY.map((t) => {
    const req = (t.slots || []).filter((s) => s.required).map((s) => `${s.key}(${s.label})`);
    const opt = (t.slots || []).filter((s) => !s.required).map((s) => `${s.key}(${s.label})`);
    return `${t.type}｜${t.title}｜必填：${req.length ? req.join('、') : '无'}｜可选：${opt.length ? opt.join('、') : '无'}`;
  });
  const system = [
    '你是「工作生活助手」里的任务理解器。用户说一句中文口语，你要判断它是哪个功能、并把参数抽成槽位。',
    '任务话术库（type｜功能｜必填槽｜可选槽）：',
    ...lines,
    '规则：',
    '1) 只能输出上面列出的 type；实在判断不了就用 chat。',
    '2) 用户没说、也没法从这句话推出来的槽，就不要写，留空即可——我会据此追问主人，不要编造。',
    '3) 金额转成阿拉伯数字；日期换算成 YYYY-MM-DD；分类只用上面列出的词。',
    '4) 输出一行 JSON：{"type":"expense","slots":{"amount":13,"category":"中餐"}}，不要解释、不要代码块。',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `今天是 ${todayStr(today)}。用户说：「${String(text || '').trim()}」` },
  ];
}

// 任务 → 现有执行分支认识的 intent（字段名与 parseRouteJson 对齐）
export function taskToIntent(task, slots = {}, { today = new Date() } = {}) {
  const t = task || taskFor(task);
  if (!t) return null;
  const s = slots || {};
  switch (t.type) {
    case 'expense':
      return {
        type: 'expense',
        amount: s.amount,
        category: s.category || '其他',
        date: s.date || todayStr(today),
        note: s.note || '',
        page: 'ledger',
        source: 'task',
      };
    case 'query':
      return { type: 'query', date: s.date || todayStr(today), page: 'ledger', source: 'task' };
    case 'planAdd':
      return { type: 'planAdd', title: s.title, date: s.date || todayStr(today), page: 'today', source: 'task' };
    case 'planQuery':
      return { type: 'planQuery', date: s.date || todayStr(today), page: 'today', source: 'task' };
    case 'bug':
    case 'devTask':
      return { type: t.type, title: s.title, page: 'devwork', source: 'task' };
    case 'navigate':
      return {
        type: 'navigate',
        page: s.page,
        label: (PAGES.find((p) => p.key === s.page) || {}).label || '',
        source: 'task',
      };
    case 'theme':
      return {
        type: 'theme',
        theme: s.theme,
        label: (THEME_WORDS.find((x) => x.key === s.theme) || {}).label || '',
        source: 'task',
      };
    case 'quiz':
      return { type: 'quiz', mode: s.mode === 'exam' ? 'exam' : 'practice', page: 'quiz', source: 'task' };
    case 'groupQuery':
      return { type: 'groupQuery', page: 'group', source: 'task' };
    case 'chat':
      return { type: 'chat', reply: '', source: 'task' };
    default:
      return null;
  }
}

// 这句话像不像是「要我干活」——不像就别为闲聊多调一次模型
export function looksLikeCommand(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return /(记|记一下|记个|花了|付了|买|充|充值|加|添加|新增|创建|建个|帮我|麻烦|提醒|计划|任务|bug|问题|打开|去|切换到|换|主题|练习|考试|刷题|查|看看|多少|汇总|删|改)/i.test(s);
}

// 没配模型 / 模型挂了时的本地兜底：按关键词判任务类型，槽位照样从原话里抽，
// 所以「帮我记个账」这种缺金额的话，网页版也能先反问再办
export function ruleTask(text, { today = new Date() } = {}) {
  const s = String(text || '').trim();
  if (!s) return null;

  const page = detectPage(s);
  const theme = detectTheme(s);
  let type = null;

  if (theme && /(主题|外观|皮肤|换|切)/.test(s)) type = 'theme';
  else if (/同组|小组|团队计划/.test(s)) type = 'groupQuery';
  else if (/^\s*(打开|去|进|切换|跳转|看看|看一下)/.test(s) && page) type = 'navigate';
  else if (/(bug|漏洞|报错|崩了|挂了)/i.test(s)) type = 'bug';
  else if (/(开发|代码|功能|接口|页面改)/.test(s) && /(任务|待办|加|新建)/.test(s)) type = 'devTask';
  else if (/计划|待办|安排/.test(s)) type = /(加|添加|新增|建|记|安排)/.test(s) ? 'planAdd' : 'planQuery';
  else if (/题库|刷题|练习题|考试/.test(s)) type = 'quiz';
  else if (/查|汇总|多少/.test(s) && /花|账|支出/.test(s)) type = 'query';
  else if (/记账|记一下|记个|花了|付了|消费|支出|买/.test(s)) type = 'expense';

  const task = taskFor(type);
  if (!task) return null;

  const slots = extractSlotsFromText(task, s, { today });
  // 页面/主题在句子里已经点明，这两类不必再问
  if (type === 'navigate' && !slots.page && page) slots.page = page.key;
  if (type === 'theme' && !slots.theme && theme) slots.theme = theme.key;

  const missing = missingSlots(task, slots, { today }).map((x) => x.key);
  return {
    type,
    task,
    slots,
    missing,
    script: composeScript(task, slots, { today }),
    say: task.say,
    source: 'rule',
  };
}

// 主入口：模型把口语转成任务；超时/乱码 → null（调用方继续走原来的意图路由）
export async function llmTask(text, { today = new Date(), complete = null, timeoutMs = 20000 } = {}) {
  if (!complete || !String(text || '').trim()) return null;
  const ask = (messages) => {
    let timer = null;
    return Promise.race([
      complete(messages),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('task timeout')), timeoutMs); }),
    ])
      .catch(() => null)
      .finally(() => { if (timer) clearTimeout(timer); });
  };

  const raw = await ask(buildTaskMessages(text, { today }));
  if (!raw) return null;
  const task = parseTaskJson(raw, { today });
  if (task) return task;

  // 一次纠正：把模型原话贴回去，要求只输出合法 JSON
  const repair = buildTaskMessages(text, { today }).concat([
    { role: 'assistant', content: String(raw).slice(0, 300) },
    { role: 'user', content: '上一条不合规。只输出一行 JSON，type 必须是列出的任务之一。' },
  ]);
  const raw2 = await ask(repair);
  return raw2 ? parseTaskJson(raw2, { today }) : null;
}

// ---------- 落库：把话术库存起来 ----------

export const TASK_SCRIPT_ID = 'pet-task-library';

export async function saveTaskLibrary(repo, { now = Date.now() } = {}) {
  if (!repo || typeof repo.put !== 'function') return null;
  const rows = TASK_LIBRARY.map((t) => ({
    id: t.type,
    type: t.type,
    title: t.title,
    say: t.say,
    do: t.do,
    slots: (t.slots || []).map((s) => ({
      key: s.key,
      label: s.label,
      required: !!s.required,
      kind: s.kind,
      ask: s.ask,
      default: s.default,
    })),
  }));
  return repo.put('petScript', {
    id: TASK_SCRIPT_ID,
    version: TASK_LIBRARY_VERSION,
    rows,
    count: rows.length,
    savedAt: now,
  });
}

export async function loadTaskLibrary(repo) {
  if (!repo || typeof repo.get !== 'function') return null;
  const row = await repo.get('petScript', TASK_SCRIPT_ID);
  if (!row || row.version !== TASK_LIBRARY_VERSION) return null;
  return row;
}

// 启动时调一次：库里没有 / 版本旧，就把内置话术库写进去
export async function ensureTaskLibrary(repo, { now = Date.now() } = {}) {
  const saved = await loadTaskLibrary(repo);
  if (saved) return saved;
  return saveTaskLibrary(repo, { now });
}
