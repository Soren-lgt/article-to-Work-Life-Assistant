// AI生成
// M0 测试：数据层、模型、工具、页面骨架
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { STORES, QUIZ_CATEGORIES, DEFAULT_LEDGER_CARDS } from '../js/lib/schema.js';
import { MemoryAdapter, Repository, createRepository } from '../js/lib/db.js';
import { genId, todayStr, monthStr, monthOf, formatAmount } from '../js/lib/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

test('schema 定义了全部对象仓库，keyPath 均为 id', () => {
  const required = [
    'accounts', 'memo', 'todoplan', 'ledgerCategory', 'ledgerRecord',
    'devTask', 'devBug', 'devSnippet', 'category', 'bank', 'question', 'attempt',
    'group', 'groupMember', 'joinRequest', 'project', 'task', 'attachment', 'opLog', 'notification',
  ];
  for (const name of required) {
    assert.ok(STORES[name], '缺少对象仓库: ' + name);
    assert.equal(STORES[name].keyPath, 'id');
  }
  assert.equal(QUIZ_CATEGORIES.length, 3);
  assert.deepEqual(QUIZ_CATEGORIES.map((c) => c.key), ['choice', 'qa', 'code']);
  assert.equal(DEFAULT_LEDGER_CARDS.length, 3);
});

test('genId 生成唯一 ID', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) ids.add(genId('t'));
  assert.equal(ids.size, 2000);
});

test('日期工具格式正确', () => {
  const d = new Date(2026, 9, 31, 12, 0, 0); // 2026-10-31
  assert.equal(todayStr(d), '2026-10-31');
  assert.equal(monthStr(d), '2026-10');
  assert.equal(monthOf('2026-10-31'), '2026-10');
});

test('formatAmount 处理空值与数字', () => {
  assert.equal(formatAmount(''), '');
  assert.equal(formatAmount(null), '');
  assert.equal(formatAmount(12), '12.00');
  assert.equal(formatAmount('3.5'), '3.50');
  assert.equal(formatAmount('abc'), '');
});

test('MemoryAdapter 基础 CRUD', async () => {
  const a = new MemoryAdapter();
  await a.put('accounts', { id: 'a1', name: 'me' });
  assert.deepEqual(await a.get('accounts', 'a1'), { id: 'a1', name: 'me' });
  assert.equal((await a.all('accounts')).length, 1);
  await a.delete('accounts', 'a1');
  assert.equal(await a.get('accounts', 'a1'), null);
  await a.put('accounts', { id: 'a2', name: 'x' });
  await a.clear('accounts');
  assert.equal((await a.all('accounts')).length, 0);
});

test('Repository 自动分配 id 并按账号过滤', async () => {
  const repo = new Repository(new MemoryAdapter());
  const r1 = await repo.put('todoplan', { accountId: 'u1', title: 'A' });
  const r2 = await repo.put('todoplan', { accountId: 'u2', title: 'B' });
  const r3 = await repo.put('todoplan', { accountId: 'u1', title: 'C' });
  assert.ok(r1.id && r2.id && r3.id);
  assert.notEqual(r1.id, r2.id);
  const u1 = await repo.byAccount('todoplan', 'u1');
  assert.equal(u1.length, 2);
  assert.deepEqual(u1.map((x) => x.title).sort(), ['A', 'C']);
  assert.equal(await repo.count('todoplan'), 3);
  const removed = await repo.removeWhere('todoplan', (r) => r.accountId === 'u1');
  assert.equal(removed, 2);
  assert.equal(await repo.count('todoplan'), 1);
});

test('createRepository 可传入内存适配器并可用', async () => {
  const repo = await createRepository(new MemoryAdapter());
  await repo.put('memo', { accountId: 'u1', text: 'hi' });
  assert.equal((await repo.all('memo')).length, 1);
});

test('index.html 含 7 个导航项与 7 个模块容器', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const m of ['home', 'today', 'devwork', 'group', 'quiz', 'ledger', 'settings']) {
    assert.ok(html.includes('data-route="' + m + '"'), '缺少导航项: ' + m);
    assert.ok(html.includes('data-module="' + m + '"'), '缺少模块容器: ' + m);
  }
});