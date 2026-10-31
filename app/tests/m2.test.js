// AI生成
// M2 测试：今日计划 + 快速备忘
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { TodayPlan } from '../js/lib/todayplan.js';
import { Memo } from '../js/lib/memo.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }

test('TodayPlan.add 空标题报错', async () => {
  const r = makeRepo();
  await assert.rejects(() => TodayPlan.add(r, 'u1', { title: '  ' }), /不能为空/);
});

test('TodayPlan.add 默认字段（done=false / priority=中 / date=today）', async () => {
  const r = makeRepo();
  const it = await TodayPlan.add(r, 'u1', { title: '写周报' });
  assert.equal(it.done, false);
  assert.equal(it.priority, '中');
  assert.ok(it.date);
  assert.ok(it.id);
});

test('TodayPlan 非法优先级回落为 中', async () => {
  const r = makeRepo();
  const it = await TodayPlan.add(r, 'u1', { title: 'A', priority: '紧急' });
  assert.equal(it.priority, '中');
});

test('TodayPlan.listByDate 按账号与日期隔离', async () => {
  const r = makeRepo();
  await TodayPlan.add(r, 'u1', { title: 'A', date: '2026-10-31' });
  await TodayPlan.add(r, 'u1', { title: 'B', date: '2026-11-01' });
  await TodayPlan.add(r, 'u2', { title: 'C', date: '2026-10-31' });
  const u1 = await TodayPlan.listByDate(r, 'u1', '2026-10-31');
  assert.equal(u1.length, 1);
  assert.equal(u1[0].title, 'A');
});

test('TodayPlan.toggle 切换完成状态', async () => {
  const r = makeRepo();
  const it = await TodayPlan.add(r, 'u1', { title: 'A' });
  await TodayPlan.toggle(r, it.id);
  assert.equal((await r.get('todoplan', it.id)).done, true);
  await TodayPlan.toggle(r, it.id);
  assert.equal((await r.get('todoplan', it.id)).done, false);
});

test('TodayPlan.update 校验空标题；remove 生效', async () => {
  const r = makeRepo();
  const it = await TodayPlan.add(r, 'u1', { title: 'A' });
  await assert.rejects(() => TodayPlan.update(r, it.id, { title: '   ' }), /不能为空/);
  await TodayPlan.update(r, it.id, { title: 'A2', priority: '高' });
  const got = await r.get('todoplan', it.id);
  assert.equal(got.title, 'A2');
  assert.equal(got.priority, '高');
  await TodayPlan.remove(r, it.id);
  assert.equal(await r.get('todoplan', it.id), null);
});

test('TodayPlan.removeByDate 清空某天', async () => {
  const r = makeRepo();
  await TodayPlan.add(r, 'u1', { title: 'A', date: '2026-10-31' });
  await TodayPlan.add(r, 'u1', { title: 'B', date: '2026-10-31' });
  await TodayPlan.add(r, 'u1', { title: 'C', date: '2026-11-01' });
  const n = await TodayPlan.removeByDate(r, 'u1', '2026-10-31');
  assert.equal(n, 2);
  assert.equal((await r.all('todoplan')).length, 1);
});

test('Memo.add 空内容报错', async () => {
  const r = makeRepo();
  await assert.rejects(() => Memo.add(r, 'u1', '   '), /不能为空/);
});

test('Memo.list 倒序且支持 limit', async () => {
  const r = makeRepo();
  await Memo.add(r, 'u1', '第一条');
  await new Promise((res) => setTimeout(res, 2));
  await Memo.add(r, 'u1', '第二条');
  await new Promise((res) => setTimeout(res, 2));
  await Memo.add(r, 'u1', '第三条');
  await Memo.add(r, 'u2', '别人的');
  const list = await Memo.list(r, 'u1', 2);
  assert.deepEqual(list.map((m) => m.text), ['第三条', '第二条']);
  const all = await Memo.list(r, 'u1', 0);
  assert.equal(all.length, 3);
});

test("add 保存备注 note；monthSummary 按月汇总完成/未完成并按天聚合", async () => {
  const r = makeRepo();
  const a = await TodayPlan.add(r, "u1", { title: "A", date: "2026-10-31", note: "周报模板" });
  assert.equal(a.note, "周报模板");
  await TodayPlan.add(r, "u1", { title: "B", date: "2026-10-31" });
  await TodayPlan.add(r, "u1", { title: "C", date: "2026-11-01" });
  await TodayPlan.toggle(r, (await TodayPlan.listByDate(r, "u1", "2026-10-31"))[0].id);
  const s = await TodayPlan.monthSummary(r, "u1", "2026-10");
  assert.equal(s.total, 2);
  assert.equal(s.done, 1);
  assert.equal(s.undone, 1);
  assert.equal(s.byDay["2026-10-31"].total, 2);
  assert.equal(s.byDay["2026-10-31"].done, 1);
  assert.ok(!s.byDay["2026-11-01"], "11 月记录不计入 10 月");
});

test("monthSummary 空月份返回零值结构", async () => {
  const r = makeRepo();
  const s = await TodayPlan.monthSummary(r, "u1", "2026-09");
  assert.equal(s.total, 0);
  assert.equal(s.done, 0);
  assert.deepEqual(s.byDay, {});
});