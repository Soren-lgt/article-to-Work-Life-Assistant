// AI生成
// M7 测试：数据备份 / 恢复 / 清理 / 概览
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { STORES } from '../js/lib/schema.js';
import { Backup } from '../js/lib/backup.js';
import { Accounts } from '../js/lib/accounts.js';
import { TodayPlan } from '../js/lib/todayplan.js';
import { Ledger } from '../js/lib/ledger.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }
const newAcc = (r, name) => Accounts.create(r, { name });

test('exportAll 包含全部仓库键与元信息', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, '张三');
  await TodayPlan.add(r, acc.id, { title: '写文档' });
  const dump = await Backup.exportAll(r);
  assert.equal(dump.version, 1);
  assert.equal(dump.app, 'worklife-app');
  assert.deepEqual(Object.keys(dump.stores).sort(), Object.keys(STORES).sort());
  assert.equal(dump.stores.accounts.length, 1);
  assert.equal(dump.stores.todoplan.length, 1);
});

test('stats 返回各仓库数量', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, 'A');
  await TodayPlan.add(r, acc.id, { title: 'x' });
  await TodayPlan.add(r, acc.id, { title: 'y' });
  const s = await Backup.stats(r);
  assert.equal(s.accounts, 1);
  assert.equal(s.todoplan, 2);
  assert.equal(s.group, 0);
  assert.equal(Object.keys(s).length, Object.keys(STORES).length);
});

test('importAll replace 模式覆盖既有数据', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, '旧账号');
  const dump = { version: 1, stores: { accounts: [{ id: 'a9', name: '导入账号', createdAt: 1 }], todoplan: [{ id: 't1', accountId: 'a9', title: '导入任务', date: '2026-10-31', done: false }] } };
  await Backup.importAll(r, dump, { mode: 'replace' });
  const accs = await r.all('accounts');
  assert.equal(accs.length, 1);
  assert.equal(accs[0].name, '导入账号');
  assert.equal(acc.id !== 'a9', true);
  assert.equal((await r.all('todoplan')).length, 1);
});

test('importAll merge 模式保留既有数据', async () => {
  const r = makeRepo();
  await newAcc(r, '原有');
  await Backup.importAll(r, { stores: { accounts: [{ id: 'n1', name: '新增' }] } }, { mode: 'merge' });
  assert.equal((await r.all('accounts')).length, 2);
});

test('importFromText 解析 JSON 并校验', async () => {
  const r = makeRepo();
  await Backup.importFromText(r, JSON.stringify({ stores: { accounts: [{ id: 'x', name: 'X' }] } }), { mode: 'replace' });
  assert.equal((await r.all('accounts'))[0].name, 'X');
  await assert.rejects(() => Backup.importFromText(r, 'not json'), /不是有效的 JSON/);
  await assert.rejects(() => Backup.importAll(r, {}), /格式无效/);
  await assert.rejects(() => Backup.importAll(r, { stores: { accounts: {} } }), /应为数组/);
  await assert.rejects(() => Backup.importAll(r, { stores: { accounts: [{ name: '无id' }] } }), /缺少 id/);
});

test('clearStore 只清指定仓库', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, 'A');
  await TodayPlan.add(r, acc.id, { title: 'x' });
  await Backup.clearStore(r, 'todoplan');
  assert.equal((await r.all('todoplan')).length, 0);
  assert.equal((await r.all('accounts')).length, 1);
  await assert.rejects(() => Backup.clearStore(r, 'nope'), /未知的仓库/);
});

test('clearModule 按模块清理', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, 'A');
  await Ledger.ensureDefaultCards(r, acc.id);
  const card = (await Ledger.listCards(r, acc.id))[0];
  await Ledger.addRecord(r, acc.id, { date: '2026-10-31', cardId: card.id, amount: 10 });
  await Backup.clearModule(r, 'ledger');
  assert.equal((await r.all('ledgerCategory')).length, 0);
  assert.equal((await r.all('ledgerRecord')).length, 0);
  assert.equal((await r.all('accounts')).length, 1);
  await assert.rejects(() => Backup.clearModule(r, 'bad'), /未知的模块/);
});

test('resetAll 清空全部仓库', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, 'A');
  await TodayPlan.add(r, acc.id, { title: 'x' });
  await Backup.resetAll(r);
  for (const name of Object.keys(STORES)) assert.equal((await r.all(name)).length, 0, name);
});

test('导出 → 恢复 往返一致', async () => {
  const r = makeRepo();
  const acc = await newAcc(r, '往返');
  await TodayPlan.add(r, acc.id, { title: '任务1' });
  const dump = await Backup.exportAll(r);
  await Backup.resetAll(r);
  assert.equal((await r.all('accounts')).length, 0);
  await Backup.importAll(r, dump, { mode: 'replace' });
  assert.equal((await r.all('accounts'))[0].name, '往返');
  assert.equal((await r.all('todoplan'))[0].title, '任务1');
});