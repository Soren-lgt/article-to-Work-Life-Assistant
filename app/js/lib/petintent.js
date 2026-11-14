// AI生成
// 小宠物的对话意图解析（纯函数，可在 Node 测试）
// 目标句式：「我今天中午花了13块吃中饭」→ 记账：金额 13 / 分类 中餐 / 日期 今天

import { todayStr } from './utils.js';

const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000 };

// 全角转半角、去空白
export function normalizeText(input) {
  return String(input == null ? '' : input)
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

// 中文数字 → 数值（十五 / 二十 / 一百二十）
export function chineseToNumber(text) {
  const s = String(text || '');
  if (!s) return null;
  let section = 0;
  let number = 0;
  let seen = false;
  for (const ch of s) {
    if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) {
      number = CN_DIGITS[ch];
      seen = true;
    } else if (Object.prototype.hasOwnProperty.call(CN_UNITS, ch)) {
      const unit = CN_UNITS[ch];
      if (number === 0) number = 1;
      section += number * unit;
      number = 0;
      seen = true;
    } else {
      return null;
    }
  }
  if (!seen) return null;
  return section + number;
}

function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

// 从话里取金额：优先「13块 / 13.5元」，其次「花了十三」，最后兜底整数
export function parseAmount(input) {
  const t = normalizeText(input);
  // 先把日期、时间描述抹掉，避免把「11月5日」当成金额
  const cleaned = t
    .replace(/(\d{1,4}年)?(\d{1,2})月(\d{1,2})[日号]/g, '')
    .replace(/(今天|明天|昨天|前天|今日|昨日|上午|中午|下午|晚上|早上|晚上)/g, '');

  // 阿拉伯数字 + 块/元
  let m = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:块钱|元钱|块|元|圆)/);
  if (m) {
    let v = Number(m[1]);
    const tail = cleaned.slice(m.index + m[0].length);
    // 「13块5」= 13.5
    const tm = tail.match(/^([一二两三四五六七八九]|\d)(?!\d)/);
    if (tm) {
      const frac = /^\d/.test(tm[1]) ? Number(tm[1]) : CN_DIGITS[tm[1]];
      if (frac >= 0 && frac < 10) v += frac / 10;
    }
    return round2(v);
  }

  // 中文数字 + 块/元（「十三块五」也算 13.5）
  m = cleaned.match(/([零〇一二两三四五六七八九十百千]+)(?:块钱|元钱|块|元|圆)/);
  if (m) {
    let v = chineseToNumber(m[1]);
    if (v != null) {
      const tail = cleaned.slice(m.index + m[0].length);
      const tm = tail.match(/^([一二两三四五六七八九]|\d)(?!\d)/);
      if (tm) {
        const frac = /^\d/.test(tm[1]) ? Number(tm[1]) : CN_DIGITS[tm[1]];
        if (frac >= 0 && frac < 10) v += frac / 10;
      }
      return round2(v);
    }
  }

  // 「花了/付了/用了 …」后跟数字（可无单位）
  m = cleaned.match(/(?:花了|花费|花|付了|付|用了|用|消费|充了|充值|买了|买|吃了|给了)([零〇一二两三四五六七八九十百千]+|\d+(?:\.\d+)?)(?!\d)/);
  if (m) {
    const raw = m[1];
    const v = /^\d/.test(raw) ? Number(raw) : chineseToNumber(raw);
    if (v != null) return round2(v);
  }

  // 兜底：句子里出现的第一个数字（如「记账 13 中餐」）
  m = cleaned.match(/(\d+(?:\.\d+)?)(?!\d)/);
  if (m) return round2(Number(m[1]));

  return null;
}

// 分类关键词 → 记账卡片名（顺序即优先级，先匹配到的赢）
const CATEGORY_RULES = [
  { name: '早餐', re: /(早餐|早饭|早点|早上吃|早晨吃)/ },
  { name: '中餐', re: /(中餐|中饭|午饭|午餐|中午饭|中午吃)/ },
  { name: '晚餐', re: /(晚餐|晚饭|晚上吃|晚点吃)/ },
  { name: '夜宵', re: /(夜宵|宵夜)/ },
  { name: '交通', re: /(打车|地铁|公交|出租|车费|油费|加油|停车|高铁|火车|机票|骑车)/ },
  { name: '水果', re: /(水果|苹果|香蕉|西瓜|橘子)/ },
  { name: '零食', re: /(零食|薯片|辣条|奶茶|咖啡|饮料)/ },
  { name: '购物', re: /(购物|买衣服|买鞋|日用品|超市)/ },
  { name: '医疗', re: /(看病|买药|挂号|体检|医疗)/ },
  { name: '娱乐', re: /(电影|游戏|演出|唱歌|KTV)/ },
  { name: '房租', re: /(房租|水电|物业|燃气)/ },
];

export function detectCategory(input) {
  const t = normalizeText(input);
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(t)) return rule.name;
  }
  return null;
}

function shiftDate(dateStr, delta) {
  const parts = String(dateStr).split('-').map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  d.setDate(d.getDate() + delta);
  return todayStr(d);
}

// 日期：今天（默认）/ 昨天 / 前天 / 明天 / M月D日
export function detectDate(input, today = new Date()) {
  const t = normalizeText(input);
  const base = todayStr(today);
  const explicit = t.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (explicit) {
    const year = today.getFullYear();
    const mm = String(Number(explicit[1])).padStart(2, '0');
    const dd = String(Number(explicit[2])).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }
  if (/前天/.test(t)) return shiftDate(base, -2);
  if (/昨天|昨日/.test(t)) return shiftDate(base, -1);
  if (/明天|明日/.test(t)) return shiftDate(base, 1);
  return base;
}

const QUERY_RE = /(花了多少|花多少钱|一共花|总共花|多少钱|记账多少|今天花|昨天花|前天花|今天账|昨天账|账单|明细|查账)/;

export function parsePetIntent(input, { today = new Date() } = {}) {
  const t = normalizeText(input);
  if (!t) return { type: 'empty', raw: '' };

  const amount = parseAmount(t);
  const category = detectCategory(t);
  const date = detectDate(t, today);
  const isSpendWord = /(花|付|消费|买|吃|喝|充|打车|交)/.test(t);

  if (amount != null && (category || isSpendWord)) {
    return { type: 'expense', amount, category: category || '其他', date, note: '', raw: t };
  }
  if (QUERY_RE.test(t)) {
    return { type: 'query', date, raw: t };
  }
  if (/(你好|您好|嗨|哈喽|早上好|中午好|晚上好|hello|hi)/i.test(t)) {
    return { type: 'greet', raw: t };
  }
  if (/(你能做什么|会什么|帮助|怎么用|使用说明)/.test(t)) {
    return { type: 'help', raw: t };
  }
  return { type: 'unknown', raw: t };
}

// 记账成功后的回复文案（纯函数，便于测试）
export function answerForExpense(result) {
  const money = '¥' + Number(result.amount).toFixed(2);
  const day = String(result.date).slice(5).replace('-', '/');
  if (result.created) {
    return `好嘞，${day} 还没有「${result.card.name}」这张卡，我新建了一张并记上 ${money}。`;
  }
  if (result.replaced) {
    return `好嘞，${day} 的「${result.card.name}」改成 ${money}。`;
  }
  return `好嘞，${day} 的「${result.card.name}」记上 ${money}。`;
}

// 查询结果的回复文案
export function answerForSummary(summary) {
  const day = String(summary.date).slice(5).replace('-', '/');
  if (!summary.count) return `${day} 还没有记账呢，跟我说一句「今天中午花了13块吃中饭」就能记上。`;
  const rows = summary.items
    .filter((it) => it.total > 0)
    .map((it) => `${it.name} ¥${Number(it.total).toFixed(2)}`)
    .join('、');
  return `${day} 一共花了 ¥${Number(summary.total).toFixed(2)}，${summary.count} 笔：${rows || '暂无明细'}。`;
}

// 得不到意图时的兜底回复
export function answerForUnknown(raw) {
  return `「${String(raw || '').slice(0, 24)}」我还没听明白。可以这样说：今天中午花了13块吃中饭；或者问：今天花了多少。`;
}
