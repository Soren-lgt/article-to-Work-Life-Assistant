// P31-a：铃铛不只记同组消息，计划与开发的关键动作也进通知中心
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pushNotice, listNotices, unreadCount, markRead, kindOf, kindLabel, formatNoticeTime,
} from '../js/lib/notifycenter.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const today = readFileSync(join(root, 'mobile/js/views/today.js'), 'utf8');
const devwork = readFileSync(join(root, 'mobile/js/views/devwork.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');

function memoryRepo(rows = []) {
  return {
    rows,
    async list(store, pred) { return rows.filter((r) => (!pred || pred(r))); },
    async put(store, row) {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows[i] = { ...row }; else rows.push({ ...row });
      return row;
    },
    async get(store, id) { return rows.find((r) => r.id === id) || null; },
    async remove(store, id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); return true; },
  };
}

const ACC = 'accounts_x';

test('计划动作写进通知表，带 kind=plan、未读、归属当前账号', async () => {
  const repo = memoryRepo();
  const n = await pushNotice(repo, { accountId: ACC, kind: 'plan', title: '新增计划：复习算法', body: '2026-11-13 · 高' });
  assert.ok(n && n.id);
  assert.equal(n.kind, 'plan');
  assert.equal(n.read, false);
  assert.equal(n.toAccountId, ACC);
  assert.equal(n.accountId, ACC);
  assert.equal(repo.rows.length, 1);
});

test('开发动作写进通知表，kind=dev', async () => {
  const repo = memoryRepo();
  await pushNotice(repo, { accountId: ACC, kind: 'dev', title: '记录 Bug：登录弹窗不消失' });
  assert.equal(repo.rows[0].kind, 'dev');
  assert.equal(repo.rows[0].body, '');
});

test('同一账号的通知全都在列表里（含同组通知），按时间倒序', async () => {
  const repo = memoryRepo([
    { id: 'g1', groupId: 'group_1', toAccountId: ACC, title: '你已被邀请加入小组', body: '', read: false, createdAt: 300 },
    { id: 'p1', kind: 'plan', accountId: ACC, toAccountId: ACC, title: '新增计划：A', body: '', read: false, createdAt: 100 },
    { id: 'd1', kind: 'dev', accountId: ACC, toAccountId: ACC, title: '记录 Bug：B', body: '', read: false, createdAt: 200 },
    { id: 'x1', kind: 'plan', accountId: 'other', toAccountId: 'other', title: '别人的', body: '', read: false, createdAt: 400 },
  ]);
  const list = await listNotices(repo, ACC);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((n) => n.id), ['g1', 'd1', 'p1']);
  // 同组通知没有 kind，按 groupId 认成同组
  assert.equal(kindOf(list[0]), 'group');
  assert.equal(kindLabel(list[1]), '开发');
  assert.equal(kindLabel(list[2]), '计划');
});

test('未读数只算未读；单条已读能生效', async () => {
  const repo = memoryRepo([
    { id: 'a', kind: 'plan', accountId: ACC, toAccountId: ACC, title: 'A', body: '', read: false, createdAt: 1 },
    { id: 'b', kind: 'dev', accountId: ACC, toAccountId: ACC, title: 'B', body: '', read: false, createdAt: 2 },
    { id: 'c', kind: 'plan', accountId: ACC, toAccountId: ACC, title: 'C', body: '', read: true, createdAt: 3 },
  ]);
  assert.equal(await unreadCount(repo, ACC), 2);
  assert.equal(await markRead(repo, 'a'), true);
  assert.equal(await unreadCount(repo, ACC), 1);
  await markRead(repo, 'b');
  assert.equal(await unreadCount(repo, ACC), 0);
  assert.equal(await markRead(repo, 'nope'), false);
});

test('通知时间显示成 MM-DD HH:mm', () => {
  const t = new Date(2026, 10, 13, 9, 5).getTime();
  assert.equal(formatNoticeTime(t), '11-13 09:05');
  assert.equal(formatNoticeTime(0), '');
});

test('今日计划的新增 / 修改 / 勾选（重新待办）会记通知', () => {
  assert.ok(today.includes("import { pushNotice, pruneNotices } from '../lib/notifycenter.js';"));
  assert.ok(today.includes("kind:'plan',refType:'plan',refId:rec&&rec.id"));
  assert.ok(today.includes("title:'新增计划：'+title"));
  assert.ok(today.includes("kind:'plan',refType:'plan',refId:task.id"));
  assert.ok(today.includes("title:'修改计划：'+title"));
  assert.ok(today.includes("title:'计划待完成：'+row.title"));
});

test('开发工作的新建 / 编辑 / 状态变更会记通知', () => {
  assert.ok(devwork.includes("import { pushNotice, pruneNotices } from '../lib/notifycenter.js';"));
  assert.ok(devwork.includes("kind:'dev'"));
  assert.ok(devwork.includes("'新建开发任务：'+title"));
  assert.ok(devwork.includes("'记录 Bug：'+title"));
  assert.ok(devwork.includes("'任务状态：'+e.target.value"));
  assert.ok(devwork.includes("'Bug 状态：'+e.target.value"));
});

test('铃铛角标按整账号的待办份数统计，点开是通知中心（不再直接跳同组页）', () => {
  assert.ok(mainSrc.includes('await pendingCount(App.repo, accId)'));
  assert.ok(!mainSrc.includes('Group.listNotifications(App.repo, g.id, accId)'));
  assert.ok(mainSrc.includes('openNotifyCenter();'), '铃铛应打开通知中心');
  assert.ok(!mainSrc.includes("location.hash = '#group';"), '铃铛不应再直接跳同组页');
  assert.ok(mainSrc.includes("title: '通知'"));
  assert.equal(mainSrc.includes('data-act="allread"'), false, 'P31-d 去掉了全部已读');
});
