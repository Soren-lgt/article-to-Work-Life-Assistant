// 计划的定时提醒：给任务设一个时间，到点推一条到手机通知栏。
// 装成 App 时把时间交给壳里的系统闹钟（App 关着、没在前台也会响）；
// 浏览器里没有这个能力，只能页面开着时用定时器检查（关掉页面就不响，别指望它）。
import { nativeBridge, publishNotice } from './push.js';

export const REMIND_KEY = 'chaomu.remind.queue';
const MAX_ITEMS = 200;
const LATE_WINDOW = 15 * 60 * 1000; // 页面延迟打开时，只补 15 分钟内该响的，更久的不刷屏

// '9:30' / '09:30' → '09:30'；不合法的一律当没填
export function parseTime(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(s);
  if (!m) return '';
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(mi >= 0 && mi <= 59)) return '';
  return String(h).padStart(2, '0') + ':' + m[2];
}

// 'YYYY-MM-DD' + 'HH:MM' → 本地时间的毫秒数；日期或时间不合法返回 0
export function combineTs(date, time) {
  const t = parseTime(time);
  if (!t) return 0;
  const d = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(date || ''));
  if (!d) return 0;
  const y = Number(d[1]);
  const mo = Number(d[2]);
  const day = Number(d[3]);
  const h = Number(t.slice(0, 2));
  const mi = Number(t.slice(3, 5));
  const dt = new Date(y, mo - 1, day, h, mi, 0, 0);
  // 2 月 30 日这种不存在的日期，Date 会顺延到 3 月，按不合法处理
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== day) return 0;
  return dt.getTime();
}

// 一条计划 → 一条待提醒；没设时间 / 已完成 / 日期不合法都给 null
export function reminderOf(task) {
  if (!task || !task.id || task.done) return null;
  const time = parseTime(task.time);
  if (!time) return null;
  const ts = combineTs(task.date, time);
  if (!ts) return null;
  return {
    id: String(task.id),
    ts,
    time,
    date: task.date,
    title: String(task.title || '计划提醒'),
    body: '计划提醒 ' + task.date + ' ' + time,
  };
}

// 全部计划里"还没做完、时间还没到"的，按时间先后排
export function collectReminders(tasks, opts) {
  const o = opts || {};
  const now = Number.isFinite(Number(o.now)) ? Number(o.now) : Date.now();
  const out = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const r = reminderOf(t);
    if (!r) continue;
    if (r.ts <= now) continue;
    out.push(r);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out.slice(0, MAX_ITEMS);
}

export function saveQueue(storage, list) {
  try {
    if (!storage) return false;
    storage.setItem(REMIND_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadQueue(storage) {
  try {
    if (!storage) return [];
    const raw = storage.getItem(REMIND_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && x.id && Number(x.ts) > 0);
  } catch (e) {
    return [];
  }
}

// 同步一遍：队列留给浏览器定时器，同时（装成 App 时）交给壳里的系统闹钟
export function syncReminders(list, opts) {
  const o = opts || {};
  const storage = o.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const bridge = o.bridge !== undefined ? o.bridge : nativeBridge();
  const items = (Array.isArray(list) ? list : []).slice(0, MAX_ITEMS).map((it) => ({
    id: String(it.id), ts: Number(it.ts), time: it.time || '', date: it.date || '',
    title: String(it.title || '计划提醒'), body: String(it.body || ''),
  }));
  saveQueue(storage, items);
  let native = -1; // -1 = 没有原生桥，浏览器模式
  if (bridge && typeof bridge.syncAlarms === 'function') {
    try {
      native = Number(bridge.syncAlarms(JSON.stringify(items.map((it) => ({
        id: it.id, ts: it.ts, title: it.title, body: it.body,
      })))));
      if (!Number.isFinite(native)) native = -1;
    } catch (e) {
      native = -1;
    }
  }
  return { total: items.length, native };
}

// 从库里捞出当前账号的全部计划，一次性同步（切换账号、勾选、增删改后都调这个）
export async function syncAll(repo, opts) {
  const o = opts || {};
  const accountId = o.accountId;
  if (!repo || !accountId) return { total: 0, native: -1 };
  const rows = await repo.list('todoplan', (r) => r.accountId === accountId);
  const list = collectReminders(rows, { now: o.now });
  return syncReminders(list, o);
}

// 浏览器里的一拍：到点就推一条（只补 LATE_WINDOW 内的，更久的跳过但记下已处理）
export async function tickOnce(opts) {
  const o = opts || {};
  const storage = o.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = Number.isFinite(Number(o.now)) ? Number(o.now) : Date.now();
  const publish = typeof o.publish === 'function' ? o.publish : publishNotice;
  const list = loadQueue(storage);
  let fired = 0;
  let changed = false;
  for (const it of list) {
    if (it.fired) continue;
    if (Number(it.ts) > now) continue;
    it.fired = true;
    changed = true;
    if (now - Number(it.ts) <= LATE_WINDOW) {
      try {
        await publish({ id: 'remind_' + it.id, title: it.title, body: it.body, createdAt: now });
        fired++;
      } catch (e) { /* 单条失败不影响其它 */ }
    }
  }
  if (changed) saveQueue(storage, list);
  return fired;
}

let timer = null;

// 浏览器模式：每 interval 检查一次。装成 App 时交给系统闹钟，页面不再重复弹
export function startTicker(opts) {
  const o = opts || {};
  if (o.force !== true && nativeBridge()) return null;
  if (timer) return timer;
  const interval = Number(o.interval) > 0 ? Number(o.interval) : 30000;
  timer = setInterval(() => { tickOnce(o).catch(() => {}); }, interval);
  return timer;
}

export function stopTicker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
