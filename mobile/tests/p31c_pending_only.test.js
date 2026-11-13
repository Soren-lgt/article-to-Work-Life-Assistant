// P31-c：铃铛只提醒未完成 / 正在完成的内容
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pushNotice, listNotices, unreadCount, isPending, pruneNotices,
} from '../js/lib/notifycenter.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const today = readFileSync(join(root, 'mobile/js/views/today.js'), 'utf8');
const devwork = readFileSync(join(root, 'mobile/js/views/devwork.js'), 'utf8');

const ACC = 'accounts_x';

// 多 store 的内存仓库：notification / todoplan / devTask / devBug
function multiRepo(seed = {}) {
  const stores = {
    notification: seed.notification || [],
    todoplan: seed.todoplan || [],
    devTask: seed.devTask || [],
    devBug: seed.devBug || [],
    devSnippet: seed.devSnippet || [],
  };
  const api = {
    stores,
    async list(store, pred) { return (stores[store] || []).filter((r) => (!pred || pred(r))); },
    async put(store, row) {
      const arr = stores[store] || (stores[store] = []);
      const i = arr.findIndex((r) => r.id === row.id);
      if (i >= 0) arr[i] = { ...row }; else arr.push({ ...row });
      return row;
    },
    async get(store, id) { return (stores[store] || []).find((r) => r.id === id) || null; },
  };
  return api;
}

test('未完成的计划要提醒，完成的计划不再提醒', async () => {
  const repo = multiRepo({ todoplan: [
    { id: 'p1', accountId: ACC, title: '复习', done: false },
    { id: 'p2', accountId: ACC, title: '交表', done: true },
  ] });
  assert.equal(await isPending(repo, { refType: 'plan', refId: 'p1' }), true);
  assert.equal(await isPending(repo, { refType: 'plan', refId: 'p2' }), false);
  assert.equal(await isPending(repo, { refType: 'plan', refId: 'gone' }), false, '对象没了也就不再提醒');
});

test('开发任务：待开始/进行中提醒，已完成不提醒', async () => {
  const repo = multiRepo({ devTask: [
    { id: 't1', status: '待开始' },
    { id: 't2', status: '进行中' },
    { id: 't3', status: '已完成' },
  ] });
  assert.equal(await isPending(repo, { refType: 'task', refId: 't1' }), true);
  assert.equal(await isPending(repo, { refType: 'task', refId: 't2' }), true);
  assert.equal(await isPending(repo, { refType: 'task', refId: 't3' }), false);
});

test('Bug：待处理/处理中提醒，已修复/已关闭不提醒', async () => {
  const repo = multiRepo({ devBug: [
    { id: 'b1', status: '待处理' },
    { id: 'b2', status: '处理中' },
    { id: 'b3', status: '已修复' },
    { id: 'b4', status: '已关闭' },
  ] });
  assert.equal(await isPending(repo, { refType: 'bug', refId: 'b1' }), true);
  assert.equal(await isPending(repo, { refType: 'bug', refId: 'b2' }), true);
  assert.equal(await isPending(repo, { refType: 'bug', refId: 'b3' }), false);
  assert.equal(await isPending(repo, { refType: 'bug', refId: 'b4' }), false);
});

test('同组等没有关联对象的通知照常提醒', async () => {
  const repo = multiRepo();
  assert.equal(await isPending(repo, { groupId: 'group_1', title: '有任务分配给你' }), true);
});

test('列表默认只给还要做的；要历史就把 onlyPending 关掉', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p1', done: false }, { id: 'p2', done: true }],
    notification: [
      { id: 'n1', kind: 'plan', accountId: ACC, toAccountId: ACC, refType: 'plan', refId: 'p1', title: '新增计划：A', read: false, createdAt: 100 },
      { id: 'n2', kind: 'plan', accountId: ACC, toAccountId: ACC, refType: 'plan', refId: 'p2', title: '新增计划：B', read: false, createdAt: 200 },
      { id: 'n3', kind: 'group', accountId: ACC, toAccountId: ACC, title: '入组申请已通过', groupId: 'g1', read: false, createdAt: 300 },
    ],
  });
  const pending = await listNotices(repo, ACC);
  assert.deepEqual(pending.map((n) => n.id), ['n3', 'n1']);
  assert.equal(await unreadCount(repo, ACC), 2, '做完的那条不计入未读');

  const all = await listNotices(repo, ACC, { onlyPending: false });
  assert.equal(all.length, 3);
});

test('对象完成后 pruneNotices 把它的通知收掉（历史留档、不再占未读）', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p9', done: false }],
    notification: [
      { id: 'n1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '新增计划：A', read: false, createdAt: 1 },
      { id: 'n2', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '修改计划：A2', read: false, createdAt: 2 },
      { id: 'n3', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p9', title: '别的计划', read: false, createdAt: 3 },
    ],
  });
  assert.equal(await pruneNotices(repo, { refId: 'p1', refType: 'plan' }), 2);
  const rows = repo.stores.notification;
  assert.equal(rows.find((r) => r.id === 'n1').read, true);
  assert.equal(rows.find((r) => r.id === 'n3').read, false);
  assert.equal(await unreadCount(repo, ACC), 1, '剩下的未读只有别的计划那条');
});

test('计划：勾成完成就收通知，取消完成才重新提醒', () => {
  const block = today.slice(today.indexOf("op==='toggle'"), today.indexOf("op==='del'"));
  assert.ok(block.includes('if(!row.done) await pruneNotices(repo,{refId:id,refType:\'plan\'})'), '勾成完成才收通知');
  assert.ok(block.includes("title:'计划待完成：'+row.title"));
  assert.ok(!block.includes('完成计划：'), '完成后不该再提醒');
  // 新增 / 修改都带 refId，删除不发提醒
  assert.ok(today.includes("refType:'plan',refId:rec&&rec.id"));
  assert.ok(today.includes("refType:'plan',refId:task.id"));
  assert.ok(!today.includes('删除计划：'));
  assert.ok(today.includes('pruneNotices(repo,{refId:task.id,refType:\'plan\'})'));
});

test('开发：完成态收通知，片段不进提醒，删除不发提醒', () => {
  assert.ok(devwork.includes("if(e.target.value==='已完成'){ await pruneNotices"), '完成态收通知');
  assert.ok(devwork.includes("state.emit(); }"), '收通知后刷新铃铛角标');
  assert.ok(devwork.includes("if(e.target.value==='已修复'||e.target.value==='已关闭'){ await pruneNotices"), 'Bug 修好即收通知');
  assert.ok(devwork.includes("'task',rec&&rec.id"));
  assert.ok(devwork.includes("'bug',rec&&rec.id"));
  assert.ok(!devwork.includes('新增代码片段：'), '代码片段没有完成状态，不进提醒');
  assert.ok(!devwork.includes("'删除'+label+'：'+title"), '删除不发提醒');
});

test('同一个待办只占一份角标：多条通知合并成最新一条', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p1', done: false }, { id: 'p2', done: false }],
    notification: [
      { id: 'a1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '新增计划：写周报', read: false, createdAt: 10 },
      { id: 'a2', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '修改计划：写周报', read: false, createdAt: 20 },
      { id: 'a3', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '计划待完成：写周报', read: false, createdAt: 30 },
      { id: 'b1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p2', title: '新增计划：交表', read: false, createdAt: 40 },
    ],
  });
  const rows = await listNotices(repo, ACC);
  assert.equal(rows.length, 2, '两个待办 = 两条提醒');
  assert.equal(rows.find((n) => n.refId === 'p1').id, 'a3', '同一待办取最新那条');
  assert.equal(await unreadCount(repo, ACC), 2, '角标按待办份数算');
});

test('完成一个待办，角标只减那一份', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p1', done: false }, { id: 'p2', done: false }],
    notification: [
      { id: 'a1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '新增计划：写周报', read: false, createdAt: 10 },
      { id: 'a2', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '修改计划：写周报', read: false, createdAt: 20 },
      { id: 'b1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p2', title: '新增计划：交表', read: false, createdAt: 30 },
    ],
  });
  assert.equal(await unreadCount(repo, ACC), 2);
  await pruneNotices(repo, { refId: 'p1', refType: 'plan' });
  assert.equal(await unreadCount(repo, ACC), 1, '只少了写周报那一份，交表还在');
});
