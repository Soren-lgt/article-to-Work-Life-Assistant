// P31-d：铃铛数字=待办份数（做完才减一），通知里不再有"全部已读"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pendingCount, unreadCount, listNotices, markRead, markAllRead } from '../js/lib/notifycenter.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const mainSrc = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');
const swSrc = readFileSync(join(root, 'mobile/sw.js'), 'utf8');
const ACC = 'accounts_x';

function multiRepo(seed = {}) {
  const stores = {
    notification: seed.notification || [],
    todoplan: seed.todoplan || [],
    devTask: seed.devTask || [],
    devBug: seed.devBug || [],
  };
  return {
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
}

test('数字只跟待办份数走：点开过（已读）也算，做完才减一', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p1', done: false }, { id: 'p2', done: false }],
    notification: [
      { id: 'n1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '新增计划：A', read: true, createdAt: 1 },
      { id: 'n2', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p2', title: '新增计划：B', read: false, createdAt: 2 },
    ],
  });
  assert.equal(await pendingCount(repo, ACC), 2, '一条已读一条未读，数字仍是 2');
  assert.equal(await unreadCount(repo, ACC), 1, '未读口径另算，不再用于角标');

  // 补一份已读通知，数字不变
  repo.stores.notification.push({ id: 'n3', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '修改计划：A', read: true, createdAt: 3 });
  assert.equal(await pendingCount(repo, ACC), 2, '同一个待办多条也只算一份');

  // 全部标已读也不掉数字
  await markAllRead(repo, ACC);
  assert.equal(await pendingCount(repo, ACC), 2, '标已读不减少数字');

  // 做完一个才 -1
  repo.stores.todoplan.find((r) => r.id === 'p1').done = true;
  assert.equal(await pendingCount(repo, ACC), 1, '完成一件才少一份');
  repo.stores.todoplan.find((r) => r.id === 'p2').done = true;
  assert.equal(await pendingCount(repo, ACC), 0, '都做完就没有数字');
});

test('通知弹窗里没有"全部已读"，点条目也不再标已读', () => {
  assert.equal(mainSrc.includes('data-act="allread"'), false, '去掉全部已读按钮');
  assert.equal(mainSrc.includes('全部已读'), false);
  assert.equal(mainSrc.includes('data-act="read"'), false, '条目不再当已读按钮点');
  assert.equal(mainSrc.includes('markAllRead'), false);
  assert.ok(mainSrc.includes('if (!n.refType && !n.read) await markRead(App.repo, n.id)'), '同组消息看过就收掉，任务类的不动');
});

test('角标改用待办份数，且列表头说清"做完就自动消失"', () => {
  assert.ok(mainSrc.includes('await pendingCount(App.repo, accId)'), '角标读待办份数');
  assert.equal(mainSrc.includes('await unreadCount(App.repo, accId)'), false);
  assert.ok(mainSrc.includes('条待办'));
  assert.ok(mainSrc.includes('做完就自动消失'));
});

test('列表本身就是待办清单（只有未完成/进行中的），且缓存版本已升', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p1', done: false }, { id: 'p2', done: true }],
    notification: [
      { id: 'n1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: 'A', read: false, createdAt: 1 },
      { id: 'n2', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p2', title: 'B', read: false, createdAt: 2 },
    ],
  });
  const rows = await listNotices(repo, ACC);
  assert.deepEqual(rows.map((n) => n.id), ['n1']);
  assert.ok(/worklife-mobile-v\d+/.test(swSrc));
});

test('同组消息进列表但不占铃铛数字，看过之后不再出现', async () => {
  const repo = multiRepo({
    todoplan: [{ id: 'p1', done: false }],
    notification: [
      { id: 'g1', accountId: ACC, toAccountId: ACC, kind: 'group', groupId: 'g', title: '有任务分配给你', read: false, createdAt: 5 },
      { id: 'g2', accountId: ACC, toAccountId: ACC, kind: 'group', groupId: 'g', title: '入组申请已通过', read: true, createdAt: 4 },
      { id: 'n1', accountId: ACC, toAccountId: ACC, kind: 'plan', refType: 'plan', refId: 'p1', title: '新增计划：A', read: false, createdAt: 3 },
    ],
  });
  const rows = await listNotices(repo, ACC);
  assert.deepEqual(rows.map((n) => n.id), ['g1', 'n1'], '未读同组消息 + 待办');
  assert.equal(await pendingCount(repo, ACC), 1, '数字只算待办');

  await markRead(repo, 'g1');
  const after = await listNotices(repo, ACC);
  assert.deepEqual(after.map((n) => n.id), ['n1'], '同组看过后不再占位');
  assert.equal(await pendingCount(repo, ACC), 1, '数字不受影响');
});
