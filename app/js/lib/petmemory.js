// AI生成
// P19：小白的长期记忆 —— 聊天记录、每日打分（0-10）、四级分层、按等级保留/清理、性格画像
// 纯函数（打分/分层/清理计划/画像聚合）都能在 Node 单测；落库走 Repository。

import { todayStr } from './llmnlp.js';
import { extractJson, cnNumToNumber } from './llm.js';

export const LEVELS = ['垃圾', '普通', '中等', '重要'];

// 等级 → 保留天数（垃圾当天清，重要永久）
export const RETENTION_DAYS = { 垃圾: 0, 普通: 7, 中等: 30, 重要: 9999 };

// P23-1：短期记忆（对应 Attention 缓存）——只留最近 10 轮（问+答约 20 条），
// 5 分钟没有新对话就清空这份缓存；当天日志仍在 petMemory 里，不受影响。
export const SHORT_TERM = { maxTurns: 10, windowMs: 5 * 60 * 1000, chatTurns: 3 };

// P23-2：位置编码（时间衰减）——越新权重越高，一周前打七折，一个月前三折；
// 合成权重跌破 0.15 就清掉（「重要」即 9-10 分不衰减、只增不减）。
export const DECAY = {
  anchors: [
    { days: 0, factor: 1.0 },
    { days: 1, factor: 1.0 },
    { days: 7, factor: 0.7 },
    { days: 30, factor: 0.3 },
  ],
  threshold: 0.15,
};

// 没有分数时按等级给一个默认分（不打分的老数据也能算权重）
export const LEVEL_SCORE = { 垃圾: 1, 普通: 4, 中等: 7, 重要: 9 };

// P23-3：KV 缓存——从你说过的话里抽出「K 关键信息 → V 该怎么答」，
// 只认这几类稳定信息（身份、回答偏好、作息习惯），一次性的琐事不算。
export const PREF_RULES = [
  {
    key: 'identity_student',
    label: '学生身份',
    test: /(我是|我在读|在读|大学生|学生|读研|研究生|上学)/,
    v: '回答要简单，不要太专业',
  },
  {
    key: 'style_short',
    label: '回答简短',
    test: /(简洁|简单点|简单些|短一点|短点|直接给|别啰嗦|不用解释|一句话说|精简)/,
    v: '回答要短，直接给结果',
  },
  {
    key: 'style_detail',
    label: '喜欢详细',
    test: /(详细|展开讲|说清楚|多讲|讲透)/,
    v: '可以多说两句，把来龙去脉讲清楚',
  },
  {
    key: 'habit_morning',
    label: '早起习惯',
    test: /(早起|每天早上|早上要|早晨|背单词)/,
    v: '早上可以提一句要背单词，别催',
  },
  {
    key: 'work_identity',
    label: '上班族',
    test: /(我在上班|上班族|打工人|上班了)/,
    v: '说话直接一点，多帮主人省时间',
  },
];

// 撤销口令：说「我不喜欢这个」就别再拿它当偏好
// 只认「整句就是撤销」的说法：后面得是句尾/标点/语气词，
// 否则「我不喜欢这个菜」这种家常话会被误判成撤偏好
export const REVOKE_RE = /(?:我不喜欢这个|不喜欢这个|别记这个|别记了|不要记这个|不要记|忘掉这个|忘了吧|删掉这个|别留下)(?=[。！？!?，,、~～\s]|了|啦|吧|呀|哦|哈|$)/;

export function detectRevoke(text) {
  return REVOKE_RE.test(String(text || ''));
}

export function clampScore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v)));
}

export function classifyLevel(score) {
  const s = clampScore(score);
  if (s <= 2) return '垃圾';
  if (s <= 5) return '普通';
  if (s <= 8) return '中等';
  return '重要';
}

const GREET_RE = /^(嗯|哦|啊|哈+|你好|您好|hi|hello|在吗|在不在|在不在呀|早|晚安|拜拜|好的|ok)(呀|啊|呢|吧|啦|喔|哟)*[。！!?？\s]*$/i;

// 规则打分：纯寒暄/空话低分，有主题标签、有情绪、信息量大的加分
export function heuristicScore(item = {}) {
  const text = String(item.text || '').trim();
  let s = 3;
  if (!text) return 0;
  if (GREET_RE.test(text)) return 1;
  if (text.length >= 8) s += 1;
  if (text.length >= 20) s += 1;
  const tags = Array.isArray(item.tags) ? item.tags.length : 0;
  if (tags >= 1) s += 1;
  if (tags >= 2) s += 1;
  if (item.emotion && item.emotion !== '未知') s += 1;
  if (/(决定|计划|答应|以后|习惯|喜欢|讨厌|担心|目标|面试|考试|加班|家里|妈妈|爸爸|室友|女朋友|男朋友)/.test(text)) s += 2;
  if (item.kind === 'chat') s += 0;
  if (item.kind === 'event') s += 1;
  return clampScore(s);
}

// 某一天的记忆条目打分：优先用大模型的结果，拿不到就用规则
export function buildScoreMessages(items, { today = new Date() } = {}) {
  const list = (items || []).map((it, i) => `${i}. [${it.kind || 'chat'}|${it.emotion || '未知'}] ${it.text}`).join('\n');
  const system = [
    '你是小白的记忆整理员。给下面每条对话打 0-10 分，并给出当天总分（0-10）。',
    '打分口径：寒暄/无信息=0-2（垃圾）；一般日常=3-5（普通）；有具体信息或情绪=6-8（中等）；',
    '关于用户本人、长期偏好、重要承诺、健康与家人、目标计划=9-10（重要）。',
    '只输出一行 JSON：{"dayScore": 数字, "items": [{"i": 序号, "score": 数字}]}，不要解释。',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `今天是 ${todayStr(today)}。\n${list}` },
  ];
}

export function parseScoreJson(raw, count) {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== 'object') return null;
  const items = Array.isArray(obj.items) ? obj.items : [];
  const rows = [];
  for (const it of items) {
    const idxNum = cnNumToNumber(it && it.i);
    if (idxNum == null || !Number.isInteger(idxNum)) continue;
    const scoreNum = cnNumToNumber(it && it.score);
    if (scoreNum == null || !Number.isFinite(scoreNum)) continue;
    rows.push({ i: idxNum, score: clampScore(scoreNum) });
  }
  if (!rows.length) return null;
  // 模型经常从 1 开始编号（1..n），这里换算回 0 基；只有全都不含 0 时才这么认
  const oneBased = rows.every((r) => r.i >= 1 && r.i <= count) && !rows.some((r) => r.i === 0);
  const out = [];
  for (const r of rows) {
    const idx = oneBased ? r.i - 1 : r.i;
    if (idx < 0 || idx >= count) continue;
    if (out.some((x) => x.i === idx)) continue;
    out.push({ i: idx, score: r.score, level: classifyLevel(r.score) });
  }
  if (!out.length) return null;
  const day = cnNumToNumber(obj.dayScore);
  return { dayScore: day == null ? null : clampScore(day), items: out };
}

// 把打分合并回条目（不改原对象）
export function applyScores(items, scored) {
  // 纯寒暄是「垃圾」——模型口径偏宽时（会把「你好呀」打 3 分）用规则压回 0-2，避免白占 7 天保留期
  const rows = (items || []).map((it) => Object.assign({}, it));
  if (!scored) {
    return rows.map((it) => {
      const s = clampScore(it.score == null ? heuristicScore(it) : it.score);
      return Object.assign(it, { score: s, level: classifyLevel(s) });
    });
  }
  const map = new Map(scored.items.map((x) => [x.i, x.score]));
  return rows.map((it, i) => {
    let s = map.has(i) ? map.get(i) : clampScore(it.score == null ? heuristicScore(it) : it.score);
    const plain = String(it.text || '').replace(/小白|小狗|小助手/g, '').trim();
    if (GREET_RE.test(plain) && s > 2) s = 2;
    return Object.assign(it, { score: s, level: classifyLevel(s) });
  });
}

export async function scoreDay(items, { today = new Date(), complete, timeoutMs = 25000 } = {}) {
  let scored = null;
  if (complete && items && items.length) {
    let timer = null;
    try {
      const raw = await Promise.race([
        complete(buildScoreMessages(items, { today })),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('score timeout')), timeoutMs); }),
      ]);
      scored = parseScoreJson(raw, items.length);
    } catch { scored = null; } finally { if (timer) clearTimeout(timer); }
  }
  const rows = applyScores(items, scored);
  const dayScore = scored && Number.isFinite(scored.dayScore)
    ? clampScore(scored.dayScore)
    : clampScore(Math.round(rows.reduce((a, r) => a + r.score, 0) / Math.max(1, rows.length)));
  return { dayScore, level: classifyLevel(dayScore), items: rows };
}

function daysBetween(a, b) {
  const ms = Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00');
  return Math.floor(ms / 86400000);
}

// 时间衰减因子：0~1 天 = 1.0；1~7 天线性降到 0.7；7~30 天线性降到 0.3；
// 30 天以后沿同一斜率继续降（约 47 天归零），保证再老的内容权重不会卡在 0.3
export function decayFactor(ageDays) {
  const a = Number(ageDays);
  if (!Number.isFinite(a) || a <= 1) return 1.0;
  const anchors = DECAY.anchors;
  for (let i = 1; i < anchors.length; i += 1) {
    const from = anchors[i - 1];
    const to = anchors[i];
    if (a <= to.days) {
      const span = Math.max(1e-6, to.days - from.days);
      const k = (a - from.days) / span;
      return Math.max(0, from.factor + (to.factor - from.factor) * k);
    }
  }
  const last = anchors[anchors.length - 1];
  const prev = anchors[anchors.length - 2];
  const slope = (last.factor - prev.factor) / Math.max(1e-6, last.days - prev.days);
  return Math.max(0, last.factor + slope * (a - last.days));
}

// 合成权重 = 分数 × 时间衰减；「重要」不衰减（对应图里长期记忆只增不减）
export function weightOf(item, { today = new Date(), score = null } = {}) {
  const it = item || {};
  const level = LEVELS.includes(it.level) ? it.level : classifyLevel(it.score);
  if (level === '重要') return 1;
  const s = clampScore(score == null ? (it.score == null ? LEVEL_SCORE[level] : it.score) : score);
  const age = daysBetween(it.date || todayStr(today), todayStr(today));
  return (s / 10) * decayFactor(age);
}

// 清理计划：两套判据取先到——合成权重跌破 0.15，或超过该等级的保留天数；
// 「重要」既不衰减也不按保留期删，只受总量兜底约束
export function planCleanup(items, { today = new Date(), maxItems = 2000 } = {}) {
  const t = todayStr(today);
  const keep = [];
  const drop = [];
  for (const it of items || []) {
    const level = LEVELS.includes(it.level) ? it.level : classifyLevel(it.score);
    const keepDays = RETENTION_DAYS[level];
    const age = daysBetween(it.date || t, t);
    const weight = weightOf(it, { today, score: it.score });
    // 当天说的事先留着（这一整天还没过完、也还没打分），隔天再按权重和保留期算
    if (age <= 0) {
      keep.push(Object.assign({}, it, { _weight: weight }));
    } else if (level !== '重要' && weight < DECAY.threshold) {
      drop.push(Object.assign({}, it, {
        _reason: '权重衰减到 ' + weight.toFixed(2) + '（阈值 ' + DECAY.threshold + '）',
        _weight: weight,
      }));
    } else if (age > keepDays) {
      drop.push(Object.assign({}, it, { _reason: '超过' + level + '保留期', _weight: weight }));
    } else {
      keep.push(Object.assign({}, it, { _weight: weight }));
    }
  }
  // 兜底：总量超限时，先丢最老的低等级（权重判据已经处理掉「又老又轻」的，这里只防积压）
  keep.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  while (keep.length > maxItems) {
    const idx = keep.findIndex((x) => x.level === '垃圾' || x.level === '普通');
    if (idx < 0) break;
    drop.push(Object.assign(keep[idx], { _reason: '总量上限' }));
    keep.splice(idx, 1);
  }
  return { keep, drop };
}

// 从记忆里抽偏好 KV：同 key 只留最新一条，低分/垃圾内容不参与
export function extractPrefs(items, { max = 6, now = Date.now() } = {}) {
  const byKey = new Map();
  for (const it of items || []) {
    if (!it || it.level === '垃圾') continue;
    if (!LEVELS.includes(it.level)) continue;
    const text = String(it.text || '');
    for (const rule of PREF_RULES) {
      if (!rule.test.test(text)) continue;
      const row = {
        key: rule.key,
        label: rule.label,
        k: text.slice(0, 24),
        v: rule.v,
        sourceId: it.id == null ? null : it.id,
        ts: it.ts || now,
      };
      const old = byKey.get(rule.key);
      if (!old || (row.ts || 0) >= (old.ts || 0)) byKey.set(rule.key, row);
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, max);
}

// 把偏好压成一行（≤3 条、去重），给聊天提示词用
export function prefLineOf(prefs) {
  const uniq = [];
  for (const p of prefs || []) {
    const v = String((p && p.v) || '').trim();
    if (v && !uniq.includes(v)) uniq.push(v);
    if (uniq.length >= 3) break;
  }
  return uniq.join('；').slice(0, 60);
}

// 性格画像：标签频次 + 情绪分布 + 习惯句 + 偏好 KV
export function buildPersona(items, { now = Date.now() } = {}) {
  const tagCount = new Map();
  const emotionCount = new Map();
  let important = 0;
  const usable = (items || []).filter((it) => it && it.level !== '垃圾');
  for (const it of usable) {
    for (const tag of it.tags || []) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    if (it.emotion && it.emotion !== '未知') emotionCount.set(it.emotion, (emotionCount.get(it.emotion) || 0) + 1);
    if (it.level === '重要') important += 1;
  }
  const tags = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));
  const emotions = Array.from(emotionCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([emotion, count]) => ({ emotion, count }));
  const habits = [];
  if (tags.length) habits.push(`主人常提到：${tags.slice(0, 4).map((t) => t.tag).join('、')}`);
  if (emotions.length) habits.push(`主人最近多是${emotions[0].emotion}的样子`);
  if (important) habits.push(`记住了 ${important} 件对主人重要的事`);
  const prefs = extractPrefs(usable, { now });
  if (prefs.length) habits.push(`你的偏好：${prefs.slice(0, 3).map((p) => p.label).join('、')}`);
  return {
    tags,
    emotions,
    habits,
    prefs,
    tone: important >= 5 ? '贴心、会惦记主人提过的事' : '轻松、简短',
    total: usable.length,
    updatedAt: now,
  };
}

// ---------- 短期记忆（最近 10 轮 / 5 分钟）----------

// 追加一轮（主人说的 + 我回的），按轮数裁剪；返回新数组，不改原数组
export function pushShortTerm(turns, turn, { maxTurns = SHORT_TERM.maxTurns } = {}) {
  const base = (turns || []).filter((t) => t && t.text);
  const item = Object.assign({}, turn, { ts: turn && turn.ts != null ? turn.ts : Date.now() });
  return base.concat([item]).slice(-Math.max(1, maxTurns));
}

// 5 分钟没有新对话就把缓存清空（只清缓存，当天日志照旧）
export function clearIfIdle(turns, { now = Date.now(), windowMs = SHORT_TERM.windowMs } = {}) {
  const list = (turns || []).filter((t) => t && t.ts != null);
  if (!list.length) return [];
  const lastAt = Math.max.apply(null, list.map((t) => t.ts));
  if (now - lastAt >= windowMs) return [];
  return list;
}

// 取窗口内最近的几轮：默认给全部（落库裁剪用），limit 给闲聊用（图里只要最近 3 轮）
export function shortTermFor(turns, {
  now = Date.now(), windowMs = SHORT_TERM.windowMs, maxTurns = SHORT_TERM.maxTurns, limit = null,
} = {}) {
  const live = clearIfIdle(turns, { now, windowMs });
  const cut = live.slice(-Math.max(1, maxTurns));
  return limit ? cut.slice(-limit) : cut;
}

// ---------- 落库 ----------

export async function rememberItem(repo, accountId, {
  text, reply = '', kind = 'chat', tags = [], emotion = '未知', date = null,
} = {}) {
  const t = String(text || '').trim();
  if (!accountId || !t) return null;
  return repo.put('petMemory', {
    accountId,
    date: date || todayStr(new Date()),
    kind,
    text: t.slice(0, 300),
    reply: String(reply || '').slice(0, 300),
    tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
    emotion: emotion || '未知',
    score: null,
    level: null,
    ts: Date.now(),
  });
}

// 每轮结束后写一条短期缓存，同时把超窗口/超轮数的旧行删掉
export async function rememberShortTerm(repo, accountId, { text, reply = '', ts = Date.now() } = {}) {
  const t = String(text || '').trim();
  if (!accountId || !t) return null;
  const row = await repo.put('petShortTerm', {
    accountId,
    text: t.slice(0, 200),
    reply: String(reply || '').slice(0, 200),
    ts,
  });
  const all = await repo.byAccount('petShortTerm', accountId);
  // 判断只看「新这一轮之前」的旧缓存：上次说话到现在超过 5 分钟就整份作废，从这一轮重新攒
  const others = all
    .filter((x) => x.id !== row.id)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const idle = clearIfIdle(others, { now: ts }).length === 0;
  const kept = idle ? [] : shortTermFor(others, { now: ts }).slice(-(SHORT_TERM.maxTurns - 1));
  kept.push(row);
  const keptIds = new Set(kept.map((x) => x.id));
  for (const old of all) {
    if (old.id && !keptIds.has(old.id)) await repo.remove('petShortTerm', old.id);
  }
  return row;
}

// 撤销偏好：用户说「我不喜欢这个」→ 删掉来源记忆（不然隔天维护又抽回来）→ 重算画像
export async function revokePrefs(repo, accountId, text) {
  const persona = await personaFor(repo, accountId);
  const prefs = (persona && persona.prefs) || [];
  if (!prefs.length) return { removed: null, left: 0 };
  const t = String(text || '');
  // 指名（「不喜欢早起」）就撤那条，只说「这个」就撤最近一条
  let idx = prefs.findIndex((x) => x && x.label && t.includes(x.label));
  if (idx < 0) idx = 0;
  const removed = prefs[idx];
  if (removed && removed.sourceId) await repo.remove('petMemory', removed.sourceId);
  const items = await listMemories(repo, accountId);
  const next = buildPersona(items);
  await savePersona(repo, accountId, next);
  return { removed, left: (next.prefs || []).length };
}

// 读短期缓存：limit=3 就是闲聊要带去的那 3 轮
export async function shortTermTurns(repo, accountId, { now = Date.now(), limit = null } = {}) {
  if (!accountId) return [];
  const rows = await repo.byAccount('petShortTerm', accountId);
  const sorted = rows.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return shortTermFor(sorted, { now, limit });
}

export async function listMemories(repo, accountId) {
  const rows = await repo.byAccount('petMemory', accountId);
  return rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

export async function personaFor(repo, accountId) {
  const rows = await repo.list('petPersona', (r) => r.accountId === accountId);
  if (!rows.length) return null;
  return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
}

export async function savePersona(repo, accountId, persona) {
  const old = await personaFor(repo, accountId);
  const row = Object.assign({ accountId }, persona, { updatedAt: Date.now() });
  if (old && old.id) row.id = old.id;
  return repo.put('petPersona', row);
}

// 每日维护：给「昨天及更早」的条目打分 → 分层 → 清理过期 → 重算画像
export async function runMaintenance(repo, accountId, { today = new Date(), complete } = {}) {
  const t = todayStr(today);
  const all = await listMemories(repo, accountId);
  const pendingAll = all.filter((it) => it.date < t && it.score == null).slice(0, 40);
  const scoring = await scoreDay(pendingAll, { today, complete });
  for (let i = 0; i < pendingAll.length; i += 1) {
    const row = Object.assign({}, pendingAll[i], { score: scoring.items[i].score, level: scoring.items[i].level });
    await repo.put('petMemory', row);
  }

  const fresh = await listMemories(repo, accountId);
  const planned = planCleanup(fresh, { today });
  for (const it of planned.drop) {
    if (it.id) await repo.remove('petMemory', it.id);
  }

  const kept = await listMemories(repo, accountId);
  const persona = buildPersona(kept);
  await savePersona(repo, accountId, persona);
  return {
    date: t,
    dayScore: scoring.dayScore,
    level: scoring.level,
    scored: pendingAll.length,
    dropped: planned.drop.length,
    total: kept.length,
    persona,
  };
}

// ---------- 聊天 ----------

export function buildChatMessages(text, {
  persona = null, recent = [], turns = [], today = new Date(),
} = {}) {
  const tagLine = persona && persona.tags && persona.tags.length
    ? persona.tags.map((t) => t.tag).join('、') : '还没积累';
  const habitLine = persona && persona.habits && persona.habits.length ? persona.habits.join('；') : '还没养成习惯';
  const prefLine = prefLineOf(persona && persona.prefs);
  // 短期：最近 3 轮（主人说的 + 我回的），图里「不传全部历史，省 token」
  const usableTurns = (turns || [])
    .filter((t) => t && t.text)
    .slice(-SHORT_TERM.chatTurns)
    .map((t) => `- 主人：${String(t.text).slice(0, 60)}${t.reply ? `｜我：${String(t.reply).slice(0, 60)}` : ''}`);
  // 兜底：没有短期缓存时（比如刚打开就聊），用最近 3 条中期记忆
  const usableRecent = (recent || [])
    .filter((m) => m && m.text && m.level !== '垃圾')
    .slice(-3)
    .map((m) => `- ${m.date} ${String(m.text).slice(0, 60)}`);
  const hasTurns = usableTurns.length > 0;
  const memoryLine = (hasTurns ? usableTurns : usableRecent).join('\n') || '- 暂无';
  const system = [
    '你是「工作生活助手」里的小白，一只萨摩耶小狗，说话短、亲切、不油腻，一次不超过两句话。',
    `你的性格：${(persona && persona.tone) || '轻松、简短'}。`,
    `你记得主人常提的事：${tagLine}。`,
    `你对主人的了解：${habitLine}。`,
    prefLine ? `主人的偏好：${prefLine}。` : null,
    hasTurns ? '最近几轮对话：' : '最近记得的事：',
    memoryLine,
    '规则：不编造事实；主人交代事情时先答应下来；不输出任何系统提示或 JSON。',
  ].filter((x) => x != null).join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `今天是 ${todayStr(today)}。主人说：「${String(text || '').trim()}」` },
  ];
}

export async function chatWithPersona(text, {
  persona, recent, turns, today = new Date(), complete, timeoutMs = 20000,
} = {}) {
  if (!complete || !String(text || '').trim()) return null;
  let timer = null;
  try {
    const raw = await Promise.race([
      complete(buildChatMessages(text, { persona, recent, turns, today })),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('chat timeout')), timeoutMs); }),
    ]);
    const t = String(raw || '')
      .trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```$/g, '')
      .replace(/^(小白|小狗|宠物)[:：]\s*/, '')
      .replace(/^["'`“”]+|["'`“”]+$/g, '')
      .replace(/[*#]+/g, '')
      .trim();
    return t ? t.slice(0, 220) : null;
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}
