// AI生成
// M3 测试：每日记账
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { Ledger } from '../js/lib/ledger.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }

test('ensureDefaultCards 创建三张预置卡且幂等', async () => {
  const r = makeRepo();
  const c1 = await Ledger.ensureDefaultCards(r, 'u1');
  assert.equal(c1.length, 3);
  assert.deepEqual(c1.map((c) => c.name), ['早餐', '中餐', '晚餐']);
  const c2 = await Ledger.ensureDefaultCards(r, 'u1');
  assert.equal(c2.length, 3);
  assert.equal((await Ledger.listCards(r, 'u1')).length, 3);
});

test('不同账号卡片隔离', async () => {
  const r = makeRepo();
  await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.ensureDefaultCards(r, 'u2');
  assert.equal((await Ledger.listCards(r, 'u1')).length, 3);
  assert.equal((await r.all('ledgerCategory')).length, 6);
});

test('addCard 空名报错；排序递增', async () => {
  const r = makeRepo();
  await Ledger.ensureDefaultCards(r, 'u1');
  await assert.rejects(() => Ledger.addCard(r, 'u1', '  '), /不能为空/);
  const c = await Ledger.addCard(r, 'u1', '夜宵');
  assert.equal(c.sort, 4);
});

test('renameCard 生效并校验', async () => {
  const r = makeRepo();
  const [breakfast] = await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.renameCard(r, breakfast.id, '早点');
  assert.equal((await r.get('ledgerCategory', breakfast.id)).name, '早点');
  await assert.rejects(() => Ledger.renameCard(r, breakfast.id, ''), /不能为空/);
});

test('addRecord：金额可空；缺少分类/日期报错', async () => {
  const r = makeRepo();
  const [b] = await Ledger.ensureDefaultCards(r, 'u1');
  await assert.rejects(() => Ledger.addRecord(r, 'u1', { cardId: '', date: '2026-10-31' }), /请选择消费分类/);
  await assert.rejects(() => Ledger.addRecord(r, 'u1', { cardId: b.id }), /缺少日期/);
  const rec = await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: '', note: '记账不留金额', date: '2026-10-31' });
  assert.equal(rec.amount, null);
  assert.equal(rec.note, '记账不留金额');
  const rec2 = await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: '8.5', date: '2026-10-31' });
  assert.equal(rec2.amount, 8.5);
});

test('listByDate 账号与日期隔离', async () => {
  const r = makeRepo();
  const [b] = await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 5, date: '2026-10-31' });
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 6, date: '2026-11-01' });
  await Ledger.addRecord(r, 'u2', { cardId: b.id, amount: 7, date: '2026-10-31' });
  assert.equal((await Ledger.listByDate(r, 'u1', '2026-10-31')).length, 1);
});

test('dayTotal 求和忽略空金额；dayByCard 分类统计', async () => {
  const r = makeRepo();
  const [b, lunch] = await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 12, date: '2026-10-31' });
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: '', date: '2026-10-31' });
  await Ledger.addRecord(r, 'u1', { cardId: lunch.id, amount: 20, date: '2026-10-31' });
  const t = await Ledger.dayTotal(r, 'u1', '2026-10-31');
  assert.equal(t.total, 32);
  assert.equal(t.count, 3);
  const byCard = await Ledger.dayByCard(r, 'u1', '2026-10-31');
  assert.equal(byCard.find((c) => c.cardId === b.id).total, 12);
  assert.equal(byCard.find((c) => c.cardId === b.id).count, 2);
  assert.equal(byCard.find((c) => c.cardId === lunch.id).total, 20);
});

test('monthSummary 月度分类与合计', async () => {
  const r = makeRepo();
  const [b, lunch] = await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 12, date: '2026-10-31' });
  await Ledger.addRecord(r, 'u1', { cardId: lunch.id, amount: 20, date: '2026-10-05' });
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 99, date: '2026-11-01' });
  const s = await Ledger.monthSummary(r, 'u1', '2026-10');
  assert.equal(s.total, 32);
  assert.equal(s.count, 2);
  assert.equal(s.perCard.find((c) => c.cardId === b.id).total, 12);
});

test('listDates 返回有记录的日期倒序', async () => {
  const r = makeRepo();
  const [b] = await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 1, date: '2026-10-30' });
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 1, date: '2026-10-31' });
  assert.deepEqual(await Ledger.listDates(r, 'u1'), ['2026-10-31', '2026-10-30']);
});

test('removeCard 连带删除其记录', async () => {
  const r = makeRepo();
  const [b] = await Ledger.ensureDefaultCards(r, 'u1');
  await Ledger.addRecord(r, 'u1', { cardId: b.id, amount: 5, date: '2026-10-31' });
  await Ledger.removeCard(r, b.id);
  assert.equal(await r.get('ledgerCategory', b.id), null);
  assert.equal((await r.all('ledgerRecord')).length, 0);
});

test("removeRecord 删除单条记录且不影响同日其他记录", async () => {
  const r = makeRepo();
  const [b] = await Ledger.ensureDefaultCards(r, "u1");
  const r1 = await Ledger.addRecord(r, "u1", { cardId: b.id, amount: 5, date: "2026-10-31" });
  const r2 = await Ledger.addRecord(r, "u1", { cardId: b.id, amount: 6, date: "2026-10-31" });
  await Ledger.removeRecord(r, r1.id);
  assert.equal(await r.get("ledgerRecord", r1.id), null);
  const left = await Ledger.listByDate(r, "u1", "2026-10-31");
  assert.equal(left.length, 1);
  assert.equal(left[0].id, r2.id);
});

test("removeRecord 不存在记录不报错", async () => {
  const r = makeRepo();
  await Ledger.ensureDefaultCards(r, "u1");
  await Ledger.removeRecord(r, "missing-id");
  assert.equal((await r.all("ledgerRecord")).length, 0);
});