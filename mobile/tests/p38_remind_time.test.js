// P38：给「今日计划」加提醒时间，到点推手机通知栏
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTime, combineTs, reminderOf, collectReminders,
  saveQueue, loadQueue, syncReminders, tickOnce,
} from '../js/lib/remind.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function memStorage(init) {
  const map = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('时间只认「时:分」，写成 9:30 也会补成 09:30', () => {
  assert.equal(parseTime('09:30'), '09:30');
  assert.equal(parseTime('9:30'), '09:30');
  assert.equal(parseTime(' 23:59 '), '23:59');
  assert.equal(parseTime(''), '');
  assert.equal(parseTime('24:00'), '', '没有 24 点');
  assert.equal(parseTime('09:60'), '', '没有 60 分');
  assert.equal(parseTime('9:5'), '', '分钟必须两位');
  assert.equal(parseTime('abc'), '');
});

test('日期加时间算出的时刻落在本地时区的那个点', () => {
  const ts = combineTs('2026-11-14', '09:30');
  const d = new Date(ts);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 14);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 30);
  assert.equal(combineTs('2026-02-30', '09:30'), 0, '不存在的日期不算数');
  assert.equal(combineTs('2026-11-14', ''), 0);
  assert.equal(combineTs('11-14', '09:30'), 0);
});

test('只把「还没做完、时间还没到」的计划排进队列', () => {
  const now = combineTs('2026-11-14', '08:00');
  const rows = [
    { id: 'a', date: '2026-11-14', time: '09:30', title: '交作业', done: false },
    { id: 'b', date: '2026-11-14', time: '08:00', title: '已经到点了', done: false },
    { id: 'c', date: '2026-11-14', time: '10:00', title: '做完了', done: true },
    { id: 'd', date: '2026-11-14', title: '没设时间', done: false },
    { id: 'e', date: '2026-11-15', time: '07:00', title: '明天的', done: false },
  ];
  const list = collectReminders(rows, { now });
  assert.deepEqual(list.map((x) => x.id), ['a', 'e']);
  assert.equal(list[0].body, '计划提醒 2026-11-14 09:30');
  assert.equal(reminderOf(rows[2]), null, '做完的不再提醒');
});

test('同步：队列留在本地，整份交给壳里的系统闹钟', () => {
  const storage = memStorage();
  const sent = [];
  const bridge = { syncAlarms: (json) => { sent.push(json); return 2; } };
  const list = [
    { id: 'a', ts: 1000, title: '交作业' },
    { id: 'b', ts: 2000, title: '开会' },
  ];
  const res = syncReminders(list, { storage, bridge });
  assert.equal(res.total, 2);
  assert.equal(res.native, 2);
  assert.equal(loadQueue(storage).length, 2);
  const payload = JSON.parse(sent[0]);
  assert.deepEqual(Object.keys(payload[0]).sort(), ['body', 'id', 'title', 'ts'], '只传壳用得上的字段');
});

test('没有原生桥就只本地排队，交给页面定时器', () => {
  const storage = memStorage();
  const res = syncReminders([{ id: 'a', ts: 1000, title: 'x' }], { storage, bridge: null });
  assert.equal(res.native, -1);
  assert.equal(loadQueue(storage).length, 1);
});

test('到点推一条，同一件事不会重复推', async () => {
  const storage = memStorage();
  const ts = combineTs('2026-11-14', '09:30');
  saveQueue(storage, [{ id: 'a', ts, title: '交作业', body: '计划提醒 2026-11-14 09:30' }]);
  const sent = [];
  assert.equal(await tickOnce({ storage, now: ts - 60000, publish: (x) => sent.push(x) }), 0, '还没到点');
  assert.equal(await tickOnce({ storage, now: ts + 1000, publish: (x) => sent.push(x) }), 1);
  assert.equal(sent[0].title, '交作业');
  assert.equal(await tickOnce({ storage, now: ts + 30000, publish: (x) => sent.push(x) }), 0, '推过就不再推');
});

test('页面开得晚：15 分钟内补一条，更早的不再吵', async () => {
  const storage = memStorage();
  const ts = combineTs('2026-11-14', '09:30');
  saveQueue(storage, [
    { id: 'old', ts: ts - 3 * 3600 * 1000, title: '三小时前的' },
    { id: 'late', ts, title: '刚过一会儿' },
  ]);
  const sent = [];
  const n = await tickOnce({ storage, now: ts + 5 * 60 * 1000, publish: (x) => sent.push(x) });
  assert.equal(n, 1);
  assert.equal(sent[0].title, '刚过一会儿');
  assert.equal(loadQueue(storage).every((x) => x.fired), true, '过期的也标掉，不再反复检查');
});

test('今日计划表单里有时间输入，保存写进任务、列表也显示', () => {
  const today = read('mobile/js/views/today.js');
  assert.ok(today.includes('data-f="time"'), '弹窗里有时间输入');
  assert.ok(today.includes('type="time"'), '用系统的时分选择器');
  assert.ok(today.includes('if(time) await TodayPlan.update(repo,rec.id,{time})'), '新增时把时间存进去');
  assert.ok(today.includes('{title,priority,note,time}'), '编辑时也能改时间');
  assert.ok(today.includes('r.time?'), '列表里显示时间');
});

test('壳里有系统闹钟与到点接收器，App 关着也能响', () => {
  const act = read('mobile/android/java/com/worklife/assistant/MainActivity.java');
  const recv = read('mobile/android/java/com/worklife/assistant/NotifyReceiver.java');
  const build = read('mobile/android/build_apk.py');
  assert.ok(act.includes('public int syncAlarms(String json)'), '桥把清单交给壳');
  assert.ok(act.includes('setExactAndAllowWhileIdle') || act.includes('setAndAllowWhileIdle'), '用系统闹钟');
  assert.ok(act.includes('getStringSet'), '记住排过哪些，下次先撤销');
  assert.ok(recv.includes('class NotifyReceiver extends BroadcastReceiver'));
  assert.ok(recv.includes('Notification.BigTextStyle'), '通知里能看全文');
  assert.ok(build.includes('android:name=\".NotifyReceiver\"'), '清单里注册了接收器');
  assert.ok(build.includes('USE_EXACT_ALARM'), 'Android 13 起免手动授权也能准点');
});

test('启动时重排已有计划；装成 App 时页面不再另起定时器（免得响两遍）', () => {
  const main = read('mobile/js/main.js');
  assert.ok(main.includes('syncPlanReminders'));
  assert.ok(main.includes('startRemindTicker'));
  const remind = read('mobile/js/lib/remind.js');
  assert.ok(remind.includes('if (o.force !== true && nativeBridge()) return null'));
});
