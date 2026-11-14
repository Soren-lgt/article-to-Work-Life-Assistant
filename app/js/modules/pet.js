// AI生成
// 小宠物「小白」：在窗口里自由走动（点它就开始听，说完静音 2 秒自动结束）
// 说话 → 解析意图（petintent）→ 记账（petledger）→ 气泡回复，并刷新记账页

import { answerForExpense, answerForSummary, answerForUnknown } from '../lib/petintent.js';
import { applyExpense, readDay } from '../lib/petledger.js';
import {
  routeUtterance,
  answerForNavigate,
  answerForTheme,
  answerForPlanAdded,
  answerForPlanList,
  answerForBug,
  answerForDevTask,
  answerForQuiz,
  answerForGroup,
  HELP_TEXT,
} from '../lib/petcommands.js';
import { TodayPlan } from '../lib/todayplan.js';
import { DevWork } from '../lib/devwork.js';
import { applyTheme, loadPrefs, savePrefs } from '../lib/prefs.js';
import { resolveIntent, defaultComplete } from '../lib/llm.js';
import { enrichIntent } from '../lib/llmnlp.js';
import {
  rememberItem,
  listMemories,
  personaFor,
  chatWithPersona,
  runMaintenance,
  rememberShortTerm,
  shortTermTurns,
  detectRevoke,
  revokePrefs,
} from '../lib/petmemory.js';
import {
  missingSlots,
  askForMissing,
  mergeAnswer,
  taskToIntent,
  looksLikeCommand,
  llmTask,
  ruleTask,
  taskFor,
  slotsFromIntent,
  ensureTaskLibrary,
} from '../lib/pettask.js';

const FRAME_ROOT = 'img/pet';
const ANIM = {
  idle: { fps: 4, loop: true, next: 'idle' },
  walk_right: { fps: 7, loop: true },
  walk_left: { fps: 7, loop: true },
  click: { fps: 8, loop: false, next: 'idle' },
  wake: { fps: 7, loop: false, next: 'idle' },
  sleep: { fps: 4, loop: true },
  fall_asleep: { fps: 5, loop: false, next: 'sleep' },
};

// 正等着主人补槽的任务（缺金额 / 缺计划内容时先问一句，主人答上来再执行）
let pendingTask = null;

// 收音判定参数：说话声阈值、说完静音多久算结束、一直不说话多久放弃、最长一次收音时长
export const VOICE_RULES = {
  threshold: 0.02,
  silenceMs: 2000,
  noSpeechMs: 5000,
  maxMs: 30000,
};

// 自由活动参数：每秒位移（px/s）、到点后歇多久、偶尔趴下睡多久
export const WANDER = {
  speed: 66,
  pauseMin: 2600,
  pauseMax: 6200,
  sleepChance: 0.22,
  sleepMs: 7000,
};

let mounted = false;
let frames = null;
let petEl = null;
let spriteEl = null;
let bubbleEl = null;
let animTimer = 0;
let animName = '';
let animIndex = 0;
let recorder = null;
let listening = false;
let bubbleTimer = 0;
let ctx = null;
let detector = null;

// 走动状态
let pos = { x: 0, y: 0 };
let target = null;
let paused = false;
let sleeping = false;
let restTimer = 0;
let rafId = 0;
let lastFrame = 0;
let placed = false;
let dragState = null;
let suppressClick = false;
let clickBack = null; // 点击前的状态快照，说完话后原样放回去

function loadManifest() {
  if (frames) return Promise.resolve(frames);
  return fetch(FRAME_ROOT + '/manifest.json')
    .then((r) => r.json())
    .then((j) => { frames = j; return j; })
    .catch(() => { frames = {}; return frames; });
}

function frameList(name) {
  return (frames && frames[name]) || [];
}

function paintFrame() {
  const list = frameList(animName);
  if (!list.length) return;
  spriteEl.src = FRAME_ROOT + '/' + animName + '/' + list[animIndex % list.length];
}

function play(name) {
  const list = frameList(name);
  if (!list.length) return;
  if (animName === name && ANIM[name] && ANIM[name].loop) return;
  animName = name;
  animIndex = 0;
  paintFrame();
  clearInterval(animTimer);
  const cfg = ANIM[name] || { fps: 6, loop: true };
  animTimer = setInterval(() => {
    animIndex += 1;
    const total = frameList(animName).length;
    if (!cfg.loop && animIndex >= total) {
      clearInterval(animTimer);
      play(cfg.next || 'idle');
      return;
    }
    paintFrame();
  }, Math.round(1000 / (cfg.fps || 6)));
}

function setBubble(text, ms = 6000) {
  if (!bubbleEl) return;
  bubbleEl.textContent = String(text || '');
  bubbleEl.hidden = !text;
  clearTimeout(bubbleTimer);
  layout();
  if (text && ms > 0) {
    bubbleTimer = setTimeout(() => { if (bubbleEl) { bubbleEl.hidden = true; layout(); } }, ms);
  }
}

// 说完话/出错后，把点击前的状态放回去（原来在睡就接着睡，原来在走就接着走）
function restoreAfterClick() {
  const back = restoreAfterDrag(clickBack);
  clickBack = null;
  paused = back.paused;
  target = back.target;
  sleeping = back.sleeping;
  if (!paused && !target && !sleeping) scheduleRest(WANDER.pauseMin);
}

let lastReplyText = '';
let turnKind = 'event';
let lastMaintDay = '';

function reply(text) {
  lastReplyText = String(text || '');
  setBubble(text, 7000);
  restoreAfterClick();
}

// 每轮结束后记一条记忆（聊天标 chat，其它标 event），标签/情绪来自 NLP
async function rememberTurn(raw, intent, kind) {
  const state = ctx.state;
  if (!state || !state.currentAccountId) return;
  const nlp = (intent && intent.nlp) || {};
  try {
    await rememberItem(ctx.repo, state.currentAccountId, {
      text: raw,
      reply: lastReplyText,
      kind,
      tags: nlp.tags || [],
      emotion: nlp.emotion || '未知',
    });
    // 同时更新短期缓存（最近 10 轮；超过 5 分钟没说话就自然清空）
    await rememberShortTerm(ctx.repo, state.currentAccountId, { text: raw, reply: lastReplyText });
  } catch (e) { /* 记忆失败不影响主流程 */ }
}

// 每天第一次交互时，给过去的内容打分、分层、清理，并刷新性格画像
async function maintainOnce() {
  const state = ctx.state;
  if (!state || !state.currentAccountId) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = state.currentAccountId + '@' + day;
  if (lastMaintDay === key) return;
  lastMaintDay = key;
  try {
    await runMaintenance(ctx.repo, state.currentAccountId, { complete: defaultComplete() });
  } catch (e) { /* 维护失败下次再来 */ }
}

// 轻量重采样：把任意采样率单声道 PCM 转成 16k（语音识别引擎要求）
export function resampleTo16k(input, inRate) {
  const outRate = 16000;
  if (inRate === outRate) return Float32Array.from(input);
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] || 0;
    const b = input[idx + 1] || a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

// 一段 PCM 的均方根音量（判断有没有在说话）
export function rms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// 静音检测器：喂 PCM 块，返回该不该结束收音
// - 说过话之后连续 silenceMs 没声音 → 'silence'（正常说完）
// - 一直没开口，noSpeechMs 后 → 'nospeech'（没听到）
// - 连续说超过 maxMs → 'max'（兜底，别无限录）
export function createSilenceDetector(options = {}) {
  const cfg = Object.assign({}, VOICE_RULES, options);
  let beganAt = -1;
  let lastVoiceAt = -1;
  let started = false;
  let ended = false;

  function reset(now) {
    beganAt = now == null ? -1 : now;
    lastVoiceAt = beganAt;
    started = false;
    ended = false;
  }

  function feed(samples, sampleRate, now) {
    if (ended) return { end: null, voiced: false, started, chunkMs: 0 };
    const at = now == null ? 0 : now;
    if (beganAt < 0) reset(at);
    const voiced = rms(samples) >= cfg.threshold;
    if (voiced) {
      started = true;
      lastVoiceAt = at;
    }
    const chunkMs = sampleRate > 0 ? (samples.length / sampleRate) * 1000 : 0;
    let end = null;
    if (started && at - lastVoiceAt >= cfg.silenceMs) end = 'silence';
    else if (!started && at - beganAt >= cfg.noSpeechMs) end = 'nospeech';
    else if (at - beganAt >= cfg.maxMs) end = 'max';
    if (end) ended = true;
    return { end, voiced, started, chunkMs };
  }

  return { reset, feed, config: cfg };
}

// ---- 自由走动：纯计算部分（Node 里也能测） ----

// 把坐标拉住，别让小狗跑出窗口
export function clampPos(p, bounds) {
  return {
    x: Math.min(Math.max(p.x, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(p.y, bounds.minY), bounds.maxY),
  };
}

// 朝目标挪一步；speed 是 px/s，dtMs 是这一帧经过的毫秒
export function stepToward(from, to, speed, dtMs) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const stepLen = (speed * Math.max(0, dtMs)) / 1000;
  if (dist === 0) return { x: to.x, y: to.y, arrived: true, dx: 0 };
  if (dist <= stepLen) return { x: to.x, y: to.y, arrived: true, dx };
  return {
    x: from.x + (dx / dist) * stepLen,
    y: from.y + (dy / dist) * stepLen,
    arrived: false,
    dx,
  };
}

// 在可走范围里随机挑一个目的地
export function pickTarget(bounds, rand = Math.random) {
  const r = typeof rand === 'function' ? rand() : 0.5;
  const r2 = typeof rand === 'function' ? rand() : 0.5;
  return {
    x: bounds.minX + r * Math.max(0, bounds.maxX - bounds.minX),
    y: bounds.minY + r2 * Math.max(0, bounds.maxY - bounds.minY),
  };
}

// 拖拽：指针移动超过这个像素才算「拖」，否则仍按一次点击处理
export const DRAG = { threshold: 4 };

// 把指针位置换算成小狗左上角（扣掉你抓它的那个点），再夹进可走范围
export function dragToPoint(pointer, grabOffset, bounds) {
  return clampPos(
    { x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y },
    bounds
  );
}

// 拖动结束后要还原成拖动前的状态：原来在睡就继续睡，原来在走就往原目的地接着走
export function restoreAfterDrag(prev) {
  const p = prev || {};
  return {
    paused: !!p.paused,
    target: p.target || null,
    sleeping: !!p.sleeping,
  };
}

// 这段位移够不够得上「拖动」
export function exceedsDragThreshold(dx, dy, threshold) {
  const t = threshold == null ? DRAG.threshold : threshold;
  return Math.sqrt(dx * dx + dy * dy) >= t;
}

function boundsNow() {
  const vw = (typeof document !== 'undefined' && document.documentElement ? document.documentElement.clientWidth : 0) || 1000;
  const vh = (typeof document !== 'undefined' && document.documentElement ? document.documentElement.clientHeight : 0) || 700;
  const sw = (spriteEl && spriteEl.offsetWidth) || 132;
  const sh = (spriteEl && spriteEl.offsetHeight) || 132;
  // 上方留出顶栏，四周留 8px，避免贴边
  return clampBounds({ minX: 10, maxX: vw - sw - 10, minY: 64, maxY: vh - sh - 10 });
}

function clampBounds(b) {
  return {
    minX: Math.max(0, b.minX),
    maxX: Math.max(b.minX, b.maxX),
    minY: Math.max(0, b.minY),
    maxY: Math.max(b.minY, b.maxY),
  };
}

function layout() {
  if (!petEl || !spriteEl) return;
  spriteEl.style.left = Math.round(pos.x) + 'px';
  spriteEl.style.top = Math.round(pos.y) + 'px';
  if (bubbleEl) {
    bubbleEl.style.left = Math.round(pos.x) + 'px';
    bubbleEl.style.top = Math.round(pos.y) + 'px';
  }
}

function scheduleRest(delay) {
  clearTimeout(restTimer);
  const wait = delay == null
    ? WANDER.pauseMin + Math.random() * (WANDER.pauseMax - WANDER.pauseMin)
    : delay;
  restTimer = setTimeout(() => {
    if (listening || paused) return;
    if (Math.random() < WANDER.sleepChance) {
      sleeping = true;
      play('fall_asleep');
      setTimeout(() => {
        sleeping = false;
        play('wake');
        scheduleRest(WANDER.pauseMin);
      }, WANDER.sleepMs);
      return;
    }
    const bounds = boundsNow();
    target = pickTarget(bounds);
    target = clampPos(target, bounds);
  }, wait);
}

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const dt = lastFrame ? Math.min(ts - lastFrame, 120) : 0;
  lastFrame = ts;
  if (paused || sleeping || listening || !target) return;
  const r = stepToward(pos, target, WANDER.speed, dt);
  pos.x = r.x;
  pos.y = r.y;
  if (Math.abs(r.dx) > 6) play(r.dx < 0 ? 'walk_left' : 'walk_right');
  layout();
  if (r.arrived) {
    target = null;
    play('idle');
    scheduleRest();
  }
}

function stopVoice(silent, sendStop = true) {
  if (recorder) {
    try { recorder.proc.disconnect(); } catch (e) { /* ignore */ }
    try { recorder.src.disconnect(); } catch (e) { /* ignore */ }
    try { recorder.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
    try { recorder.ctx.close(); } catch (e) { /* ignore */ }
    recorder = null;
  }
  listening = false;
  if (petEl) petEl.classList.remove('pet-listening');
  const bridgeNow = sendStop ? ((ctx && ctx.bridge) || (typeof window !== 'undefined' ? window.worklifeVoice : null)) : null;
  if (bridgeNow) {
    try { bridgeNow.stop(); } catch (e) { /* ignore */ }
  }
  if (!silent) setBubble('先停一下，我在收拾刚听到的。', 2000);
}

async function startVoice() {
  const bridge = typeof window !== 'undefined' ? window.worklifeVoice : null;
  if (!bridge || !bridge.available) {
    setBubble('语音要用桌面版（exe）才能听我说哦。', 7000);
    return;
  }
  try {
    await bridge.start();
  } catch (e) {
    setBubble('语音引擎启动失败：' + (e && e.message ? e.message : e), 8000);
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    setBubble('没有拿到麦克风权限，允许后再点我一次。', 7000);
    return;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const actx = new AudioCtx();
  const src = actx.createMediaStreamSource(stream);
  const proc = actx.createScriptProcessor(4096, 1, 1);
  detector = createSilenceDetector();
  detector.reset(Date.now());
  proc.onaudioprocess = (ev) => {
    if (!listening) return;
    try {
      const input = ev.inputBuffer.getChannelData(0);
      const out = resampleTo16k(input, actx.sampleRate);
      bridge.chunk(out);
      const res = detector.feed(out, 16000, Date.now());
      if (res && res.end) stopVoice(true);
    } catch (e) { /* ignore */ }
  };
  src.connect(proc);
  proc.connect(actx.destination);
  recorder = { stream, ctx: actx, src, proc };
  listening = true;
  if (petEl) petEl.classList.add('pet-listening');
  setBubble('我在听…说完停两秒我就记账。', 0);
}

// 跳到指定页面（模块自己会在 renderRoute 里重绘）
function goPage(page) {
  if (!page) return;
  if (location.hash !== '#' + page) location.hash = '#' + page;
}

async function handleUtterance(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return;
  turnKind = 'event';
  lastReplyText = '';

  // 上一句在追问（缺金额 / 缺计划内容之类）：这一句就是回答，别重新理解，等槽位补齐再干活
  let intent = null;
  if (!pendingTask) {
    // 先让大模型把口语整理成受控指令；没配 key / 超时 / 返回不合规就回退本地规则
    intent = await resolveIntent(raw, { fallback: (t, o) => routeUtterance(t, o) });

    // 指令缺关键字段（比如没抓到金额/分类）或纯聊天时，再用 NLP 抽一轮实体补上
    try {
      const enriched = await enrichIntent(raw, intent, { complete: defaultComplete() });
      intent = enriched.intent;
    } catch (e) { /* 补盲失败不影响主流程 */ }
  }

  const state = ctx.state;

  try {
    // 追问中的回答：能补进的槽先补，补不齐接着问，齐了就按任务话术执行
    if (pendingTask) {
      if (/(算了|不用了|取消|别记|不记了|先不)/.test(raw)) {
        pendingTask = null;
        reply('好，那这件事先不办了。');
        return;
      }
      const merged = mergeAnswer(pendingTask.task, pendingTask.slots, raw);
      const miss = missingSlots(pendingTask.task, merged);
      if (miss.length) {
        pendingTask.slots = merged;
        reply(askForMissing(pendingTask.task, miss).text);
        return;
      }
      intent = taskToIntent(pendingTask.task, merged);
      pendingTask = null;
    }

    // 没听懂、或只判成闲聊，但这句明显是在派活：拿任务话术库再理解一次，缺什么就反问
    if ((!intent || !intent.type || intent.type === 'unknown' || intent.type === 'chat') && looksLikeCommand(raw)) {
      const task = (await llmTask(raw, { complete: defaultComplete() })) || ruleTask(raw);
      if (task && task.type !== 'chat') {
        const miss = missingSlots(task.task, task.slots);
        if (miss.length) {
          pendingTask = { task: task.task, slots: task.slots, askedAt: Date.now() };
          intent = { type: 'unknown', raw };
          reply(askForMissing(task.task, miss).text);
          return;
        }
        intent = taskToIntent(task.task, task.slots);
      }
    }

    if (!intent || !intent.type) {
      reply(answerForUnknown(intent && intent.raw ? intent.raw : raw));
      return;
    }

    // 意图认出来了、但必填槽没给全（比如听成记账却没有金额）：先问，别拿空值去写库
    const presetTask = taskFor(intent.type);
    if (presetTask && (presetTask.slots || []).some((sl) => sl.required)) {
      const ready = slotsFromIntent(intent);
      const miss = missingSlots(presetTask, ready);
      if (miss.length) {
        pendingTask = { task: presetTask, slots: ready, askedAt: Date.now() };
        reply(askForMissing(presetTask, miss).text);
        return;
      }
    }

    if (intent.type === 'expense') {
      if (!state.currentAccountId) { reply('先登录账号，我才能帮你记账哦。'); return; }
      const res = await applyExpense(ctx.repo, state.currentAccountId, intent);
      reply(answerForExpense(res));
      state.emit();
      goPage('ledger');
      return;
    }

    if (intent.type === 'query') {
      if (!state.currentAccountId) { reply('先登录账号，我才能查账哦。'); return; }
      const sum = await readDay(ctx.repo, state.currentAccountId, intent.date);
      reply(answerForSummary(sum));
      goPage('ledger');
      return;
    }

    // ---- 打开页面 / 换主题：不需要登录 ----
    if (intent.type === 'navigate') {
      goPage(intent.page);
      reply(answerForNavigate(intent));
      return;
    }

    if (intent.type === 'theme') {
      applyTheme(intent.theme);
      savePrefs(Object.assign(loadPrefs(), { theme: intent.theme }));
      reply(answerForTheme(intent));
      return;
    }

    if (intent.type === 'quiz') {
      goPage(intent.page || 'quiz');
      reply(answerForQuiz(intent));
      return;
    }

    if (intent.type === 'groupQuery') {
      goPage(intent.page || 'group');
      reply(answerForGroup());
      return;
    }

    if (intent.type === 'chat') {
      turnKind = 'chat';
      const accountId = state.currentAccountId;
      let finalText = intent.reply || '嗯，我在听。';
      if (accountId) {
        // 「我不喜欢这个 / 别记这个」= 撤销这条长期偏好（长期记忆只增不减，除非用户这么说）
        if (detectRevoke(raw)) {
          const revoked = await revokePrefs(ctx.repo, accountId, raw);
          reply(revoked && revoked.removed
            ? `好，这个我不记了：${String(revoked.removed.k).slice(0, 16)}`
            : '我这儿还没记这类事，放心吧。');
          return;
        }
        try {
          const persona = await personaFor(ctx.repo, accountId);
          const recent = await listMemories(ctx.repo, accountId);
          // 图里口径：只传长期画像 + 最近 3 轮短期对话
          const turns = await shortTermTurns(ctx.repo, accountId, { limit: 3 });
          const chat = await chatWithPersona(raw, { persona, recent, turns, complete: defaultComplete() });
          if (chat) finalText = chat;
        } catch (e) { /* 画像聊天失败就用模型直给的回复 */ }
      }
      reply(finalText);
      return;
    }

    if (intent.type === 'greet') {
      reply('在呢！记账、加计划、记 Bug、换主题、打开页面都能跟我说，说一句「你能做什么」我列给你。');
      return;
    }

    if (intent.type === 'help') {
      reply(HELP_TEXT);
      return;
    }

    // ---- 要写数据的功能：都得先登录 ----
    if (intent.type === 'planAdd') {
      if (!state.currentAccountId) { reply('先登录账号，我才能帮你加计划哦。'); return; }
      const row = await TodayPlan.add(ctx.repo, state.currentAccountId, { title: intent.title, date: intent.date });
      state.emit();
      goPage(intent.page || 'today');
      reply(answerForPlanAdded({ title: row.title, date: row.date }));
      return;
    }

    if (intent.type === 'planQuery') {
      if (!state.currentAccountId) { reply('先登录账号，我才能看计划哦。'); return; }
      const items = await TodayPlan.listByDate(ctx.repo, state.currentAccountId, intent.date);
      reply(answerForPlanList({ date: intent.date, items }));
      goPage(intent.page || 'today');
      return;
    }

    if (intent.type === 'bug') {
      if (!state.currentAccountId) { reply('先登录账号，我才能帮你记 Bug 哦。'); return; }
      const row = await DevWork.addBug(ctx.repo, state.currentAccountId, { title: intent.title });
      state.emit();
      goPage(intent.page || 'devwork');
      reply(answerForBug({ title: row.title }));
      return;
    }

    if (intent.type === 'devTask') {
      if (!state.currentAccountId) { reply('先登录账号，我才能帮你加开发任务哦。'); return; }
      const row = await DevWork.addTask(ctx.repo, state.currentAccountId, { title: intent.title });
      state.emit();
      goPage(intent.page || 'devwork');
      reply(answerForDevTask({ title: row.title }));
      return;
    }

    reply(answerForUnknown(intent.raw || raw));
  } catch (e) {
    reply('没办成：' + (e && e.message ? e.message : e));
  } finally {
    await rememberTurn(raw, intent, turnKind);
    await maintainOnce();
  }
}

function buildDock() {
  const dock = document.createElement('div');
  dock.className = 'pet-dock';
  dock.id = 'petDock';
  dock.innerHTML = `
    <div class="pet-bubble" data-el="bubble" hidden></div>
    <img class="pet-sprite" data-el="sprite" alt="小白" draggable="false">
  `;
  document.body.appendChild(dock);
  return dock;
}

export function mountPet({ repo, state, app } = {}) {
  if (mounted) return;
  if (typeof document === 'undefined' || !document.body) return;
  mounted = true;
  ctx = { repo, state, app };

  // 任务话术库落库：换设备 / 清缓存后也能读回来（版本不一致会自动覆盖）
  if (repo) ensureTaskLibrary(repo).catch(() => {});

  const dock = buildDock();
  petEl = dock;
  spriteEl = dock.querySelector('[data-el="sprite"]');
  bubbleEl = dock.querySelector('[data-el="bubble"]');

  loadManifest().then(() => {
    play('idle');
    if (!placed) {
      const bounds = boundsNow();
      pos = { x: bounds.maxX, y: bounds.maxY };
      placed = true;
      layout();
    }
    setBubble('我是小白，点我就开始听你说，说完停两秒自动记账。', 9000);
    scheduleRest(WANDER.pauseMin);
    rafId = requestAnimationFrame(frame);
  });

  // 拖拽：按住小狗可以把它拖到窗口里任意位置，松手后它继续自己溜达
  spriteEl.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    const rect = spriteEl.getBoundingClientRect();
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      grabX: ev.clientX - rect.left,
      grabY: ev.clientY - rect.top,
      moved: false,
      // 先把拖动前的状态记下来，松手时原样放回去
      prevAnim: animName,
      prevPaused: paused,
      prevTarget: target,
      prevSleeping: sleeping,
    };
    paused = true;
    target = null;
    clearTimeout(restTimer);
    if (spriteEl.setPointerCapture) {
      try { spriteEl.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
  });

  window.addEventListener('pointermove', (ev) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    if (!dragState.moved && !exceedsDragThreshold(ev.clientX - dragState.startX, ev.clientY - dragState.startY)) return;
    if (!dragState.moved) {
      dragState.moved = true;
      petEl.classList.add('pet-dragging');
      // 拖动期间不切动作帧：睡着就保持睡相，正在走就保持迈步相
    }
    const bounds = boundsNow();
    pos = dragToPoint(
      { x: ev.clientX, y: ev.clientY },
      { x: dragState.grabX, y: dragState.grabY },
      bounds
    );
    layout();
  });

  function endDrag(ev) {
    if (!dragState) return;
    if (ev && ev.pointerId != null && ev.pointerId !== dragState.pointerId) return;
    const snap = dragState;
    dragState = null;
    if (spriteEl.hasPointerCapture && spriteEl.hasPointerCapture(snap.pointerId)) {
      try { spriteEl.releasePointerCapture(snap.pointerId); } catch (e) { /* ignore */ }
    }
    petEl.classList.remove('pet-dragging');
    const back = restoreAfterDrag({
      paused: snap.prevPaused,
      target: snap.prevTarget,
      sleeping: snap.prevSleeping,
    });
    paused = back.paused;
    target = back.target;
    sleeping = back.sleeping;
    if (!snap.moved) return; // 只是点了一下，交给下面的 click 去收音
    suppressClick = true; // 拖完手指抬起会补一个 click，别让它误开话筒
    // 动作帧不动（没切过帧就不需要重播），只在原来是「自己溜达」时才续上节奏
    if (!paused && !target && !sleeping) scheduleRest(WANDER.pauseMin);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // 点小狗：先站住，再开始听；正在听就提前结束（不用等静音）
  spriteEl.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    // 记下点击前的状态；点它的时候不换动作帧，睡着的还是睡相
    if (!clickBack) clickBack = { paused, target, sleeping };
    paused = true;
    target = null;
    clearTimeout(restTimer);
    if (listening) stopVoice(false);
    else startVoice();
  });

  // 语音引擎回传：部分结果实时显示，最终结果直接执行
  const bridge = typeof window !== 'undefined' ? window.worklifeVoice : null;
  ctx.bridge = bridge;
  if (bridge && typeof bridge.onEvent === 'function') {
    bridge.onEvent((ev) => {
      if (!ev) return;
      if (ev.type === 'partial') {
        if (ev.text) setBubble('我在听：' + ev.text, 0);
      } else if (ev.type === 'final') {
        stopVoice(true, false);
        if (ev.text) handleUtterance(ev.text);
        else { setBubble('没听清，再点我一次说一遍？', 5000); restoreAfterClick(); }
      } else if (ev.type === 'error') {
        stopVoice(true, false);
        setBubble('语音出错了：' + (ev.message || ''), 8000);
        restoreAfterClick();
      }
    });
  }

  // 窗口尺寸变了，把小狗拉回可走范围
  window.addEventListener('resize', () => {
    const bounds = boundsNow();
    pos = clampPos(pos, bounds);
    if (target) target = clampPos(target, bounds);
    layout();
  });
}

export { handleUtterance };
