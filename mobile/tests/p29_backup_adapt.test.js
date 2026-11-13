// P29：外部设备导出的备份加载进当前账号（账号字段统一归到当前账号，不覆盖现有账号）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBackupForAccount, loadBackupForAccount } from '../js/lib/importadapt.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const backupPath = join(root, 'mobile/seed/worklife-mobile-backup-20261113.json');
const backupText = readFileSync(backupPath, 'utf8');
const ACC = 'accounts_mvxnhsls_1_2wr7tk';

function memoryRepo() {
  const data = new Map();
  const rowsOf = (s) => data.get(s) || [];
  return {
    data,
    async put(s, row) {
      const arr = rowsOf(s);
      const i = arr.findIndex((r) => r.id === row.id);
      if (i >= 0) arr[i] = row; else arr.push(row);
      data.set(s, arr);
      return row;
    },
    async all(s) { return rowsOf(s).slice(); },
    async remove(s, id) {
      const arr = rowsOf(s);
      const i = arr.findIndex((r) => r.id === id);
      if (i >= 0) arr.splice(i, 1);
      return true;
    },
  };
}

test('适配后业务记录的账号字段全部归到当前账号，条数不变', () => {
  const data = JSON.parse(backupText);
  const adapted = adaptBackupForAccount(data, ACC);
  for (const name of Object.keys(adapted.stores)) {
    const before = data.stores[name].length;
    if (name === 'groupMember') {
      // 两个账号并成一个人后，同组同人只留一条成员记录
      assert.ok(adapted.stores[name].length <= before, 'groupMember 只会减少不会增加');
    } else {
      assert.equal(adapted.stores[name].length, before, `${name} 条数应保持`);
    }
  }
  const accounts = new Set();
  for (const name of Object.keys(adapted.stores)) {
    for (const row of adapted.stores[name]) {
      if (row.accountId != null) accounts.add(row.accountId);
    }
  }
  assert.deepEqual([...accounts], [ACC]);
  // 关键表条数（原备份里 todoplan 19、ledgerRecord 42）
  assert.equal(adapted.stores.todoplan.length, 19);
  assert.equal(adapted.stores.ledgerRecord.length, 42);
  assert.equal(adapted.stores.ledgerCategory.length, 16);
});

test('账号表不参与导入，现有账号与登录态不会被覆盖', () => {
  const data = JSON.parse(backupText);
  const adapted = adaptBackupForAccount(data, ACC);
  assert.equal(adapted.stores.accounts, undefined);
  assert.equal(adapted.skippedAccounts, 2);
});

test('关联人字段（组主 / 创建人 / 负责人 / 处理人 / 通知对象）也归到当前账号', () => {
  const data = JSON.parse(backupText);
  const adapted = adaptBackupForAccount(data, ACC);
  for (const g of adapted.stores.group) assert.equal(g.ownerAccountId, ACC);
  for (const t of adapted.stores.task) {
    assert.equal(t.createdBy, ACC);
    assert.equal(t.assigneeAccountId, ACC);
  }
  for (const r of adapted.stores.joinRequest) assert.equal(r.handledBy, ACC);
  for (const l of adapted.stores.opLog) assert.equal(l.actorAccountId, ACC);
  for (const n of adapted.stores.notification) assert.equal(n.toAccountId, ACC);
});

test('同一个小组成员并到同一账号后，组内不会留下重复成员（owner 优先保留）', () => {
  const data = JSON.parse(backupText);
  const adapted = adaptBackupForAccount(data, ACC);
  const seen = new Map();
  for (const m of adapted.stores.groupMember) {
    const key = m.groupId + '|' + m.accountId;
    const prev = seen.get(key);
    if (prev) assert.equal(prev.role === 'owner' || m.role !== 'owner', true, '重复成员应已被合并');
    seen.set(key, m);
  }
  assert.ok(adapted.stores.groupMember.length < data.stores.groupMember.length);
});

test('适配是纯函数，不修改传入的备份对象', () => {
  const data = JSON.parse(backupText);
  const before = JSON.stringify(data.stores.todoplan[0]);
  adaptBackupForAccount(data, ACC);
  assert.equal(JSON.stringify(data.stores.todoplan[0]), before);
});

test('未登录（缺 accountId）或数据格式错误时给出明确报错', () => {
  const data = JSON.parse(backupText);
  assert.throws(() => adaptBackupForAccount(data, null), /请先登录账号/);
  assert.throws(() => adaptBackupForAccount({}, ACC), /备份数据格式无效/);
});

test('加载进仓库后，当前账号马上能看到这些数据（合并模式保留原数据）', async () => {
  const repo = memoryRepo();
  await repo.put('todoplan', { id: 'keep1', accountId: ACC, title: '已有的计划', date: '2026-11-13' });
  const res = await loadBackupForAccount(repo, backupText, { mode: 'merge', accountId: ACC });
  assert.ok(res.imported > 100, '导入条数应大于 100，实际 ' + res.imported);
  const plans = (await repo.all('todoplan')).filter((r) => r.accountId === ACC);
  assert.equal(plans.length, 20); // 原有 1 条 + 备份 19 条
  assert.ok(plans.some((r) => r.id === 'keep1'), '合并模式应保留原有记录');
  const records = (await repo.all('ledgerRecord')).filter((r) => r.accountId === ACC);
  assert.equal(records.length, 42);
});
