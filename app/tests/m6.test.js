// AI生成
// M6 测试：同组计划（小组 / 角色 / 入组 / 项目 / 任务状态机 / 日志 / 通知）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { Group, Task, roleOf, TASK_STATUS } from '../js/lib/group.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }

async function setup() {
  const r = makeRepo();
  const g = await Group.create(r, '研发一组', 'owner1');
  return { r, g };
}

test('创建小组：创建者为组长且写日志', async () => {
  const { r, g } = await setup();
  assert.equal(g.name, '研发一组');
  assert.equal(await roleOf(r, g.id, 'owner1'), 'owner');
  assert.equal((await Group.listLogs(r, g.id)).length, 1);
  await assert.rejects(() => Group.create(r, '  ', 'x'), /不能为空/);
});

test('listForAccount 返回我的小组与角色', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  const list = await Group.listForAccount(r, 'm1');
  assert.equal(list.length, 1);
  assert.equal(list[0].role, 'member');
});

test('转让组长：仅组长可转让，原组长变普通成员', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await assert.rejects(() => Group.transferOwner(r, g.id, 'm1', 'm1'), /只有组长/);
  await Group.transferOwner(r, g.id, 'owner1', 'm1');
  assert.equal(await roleOf(r, g.id, 'm1'), 'owner');
  assert.equal(await roleOf(r, g.id, 'owner1'), 'member');
  assert.equal((await Group.get(r, g.id)).ownerAccountId, 'm1');
});

test('设副组长：仅组长可设；最多 2 名', async () => {
  const { r, g } = await setup();
  for (const id of ['a', 'b', 'c']) await Group.invite(r, g.id, 'owner1', { accountId: id });
  await assert.rejects(() => Group.setDeputy(r, g.id, 'a', 'b'), /只有组长/);
  await Group.setDeputy(r, g.id, 'owner1', 'a');
  await Group.setDeputy(r, g.id, 'owner1', 'b');
  assert.equal(await roleOf(r, g.id, 'a'), 'deputy');
  await assert.rejects(() => Group.setDeputy(r, g.id, 'owner1', 'c'), /最多 2 名/);
  await Group.removeDeputy(r, g.id, 'owner1', 'a');
  assert.equal(await roleOf(r, g.id, 'a'), 'member');
  await Group.setDeputy(r, g.id, 'owner1', 'c');
  assert.equal(await roleOf(r, g.id, 'c'), 'deputy');
});

test('移除成员：权限与保护', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await Group.invite(r, g.id, 'owner1', { accountId: 'm2' });
  await assert.rejects(() => Group.removeMember(r, g.id, 'm1', 'm2'), /只有组长或副组长/);
  await assert.rejects(() => Group.removeMember(r, g.id, 'owner1', 'owner1'), /不能移除组长/);
  await Group.removeMember(r, g.id, 'owner1', 'm2');
  assert.equal(await roleOf(r, g.id, 'm2'), null);
});

test('删除小组：仅组长；连带清理数据', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await assert.rejects(() => Group.deleteGroup(r, g.id, 'm1'), /只有组长/);
  await Group.deleteGroup(r, g.id, 'owner1');
  assert.equal(await Group.get(r, g.id), null);
  assert.equal((await r.all('groupMember')).length, 0);
});

test('入组：邀请直接加入；申请需审核', async () => {
  const { r, g } = await setup();
  await assert.rejects(() => Group.invite(r, g.id, 'owner1', {}), /请选择/);
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  assert.equal(await roleOf(r, g.id, 'm1'), 'member');
  await assert.rejects(() => Group.invite(r, g.id, 'owner1', { accountId: 'm1' }), /已在小组/);

  const req = await Group.requestJoin(r, g.id, { accountId: 'm2', name: '小明' });
  assert.equal(await roleOf(r, g.id, 'm2'), null);
  assert.equal((await Group.listJoinRequests(r, g.id)).length, 1);
  await assert.rejects(() => Group.handleJoinRequest(r, g.id, 'm1', req.id, true), /只有组长或副组长/);
  await Group.handleJoinRequest(r, g.id, 'owner1', req.id, true);
  assert.equal(await roleOf(r, g.id, 'm2'), 'member');
  await assert.rejects(() => Group.handleJoinRequest(r, g.id, 'owner1', req.id, true), /已处理/);
});

test('入组申请拒绝', async () => {
  const { r, g } = await setup();
  const req = await Group.requestJoin(r, g.id, { accountId: 'mX' });
  await Group.handleJoinRequest(r, g.id, 'owner1', req.id, false);
  assert.equal(await roleOf(r, g.id, 'mX'), null);
  assert.equal((await Group.listJoinRequests(r, g.id, 'rejected')).length, 1);
});

test('项目：仅组长/副组长可增删', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await assert.rejects(() => Task.addProject(r, g.id, 'm1', { name: 'P' }), /只有组长或副组长/);
  const p = await Task.addProject(r, g.id, 'owner1', { name: '官网改版', deadline: '2026-12-01' });
  assert.equal((await Task.listProjects(r, g.id)).length, 1);
  await Task.removeProject(r, g.id, 'owner1', p.id);
  assert.equal((await Task.listProjects(r, g.id)).length, 0);
});

test('任务状态机：成员上传附件自动进入待审核并通知组长/副组', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await Group.setDeputy(r, g.id, 'owner1', 'm1');
  await Group.invite(r, g.id, 'owner1', { accountId: 'm2' });
  const p = await Task.addProject(r, g.id, 'owner1', { name: 'P' });
  await assert.rejects(() => Task.addTask(r, g.id, 'm2', { title: 'T' }), /只有组长或副组长/);
  const task = await Task.addTask(r, g.id, 'owner1', { projectId: p.id, title: '接口联调', assigneeAccountId: 'm2' });
  assert.equal(task.status, 'todo');
  // 被指派人收到通知
  assert.equal((await Group.listNotifications(r, g.id, 'm2')).some((n) => n.title.includes('分配')), true);

  await Task.uploadAttachment(r, task.id, 'm2', { name: '截图.txt', content: 'done' });
  assert.equal((await Task.listTasks(r, g.id))[0].status, 'review');
  // 组长与副组长都收到待审核通知
  assert.equal((await Group.listNotifications(r, g.id, 'owner1')).some((n) => n.title.includes('待审核')), true);
  assert.equal((await Group.listNotifications(r, g.id, 'm1')).some((n) => n.title.includes('待审核')), true);
});

test('成员不能修改任务状态；组长/副组长可确认与驳回', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  const task = await Task.addTask(r, g.id, 'owner1', { title: 'T', assigneeAccountId: 'm1' });
  await assert.rejects(() => Task.setTaskStatus(r, g.id, 'm1', task.id, 'done'), /成员不能修改任务状态/);
  await Task.uploadAttachment(r, task.id, 'm1', { name: 'a.txt' });
  await assert.rejects(() => Task.setTaskStatus(r, g.id, 'owner1', task.id, 'bad'), /非法任务状态/);
  await Task.confirmTask(r, g.id, 'owner1', task.id);
  assert.equal((await Task.listTasks(r, g.id))[0].status, 'done');
  await Task.rejectTask(r, g.id, 'owner1', task.id);
  assert.equal((await Task.listTasks(r, g.id))[0].status, 'todo');
});

test('删除任务：仅组长/副组长；连带附件', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  const task = await Task.addTask(r, g.id, 'owner1', { title: 'T' });
  await Task.uploadAttachment(r, task.id, 'm1', { name: 'a' });
  await assert.rejects(() => Task.removeTask(r, g.id, 'm1', task.id), /只有组长或副组长/);
  await Task.removeTask(r, g.id, 'owner1', task.id);
  assert.equal((await Task.listTasks(r, g.id)).length, 0);
  assert.equal((await r.all('attachment')).length, 0);
});

test('操作日志记录关键动作', async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await Group.setDeputy(r, g.id, 'owner1', 'm1');
  await Task.addProject(r, g.id, 'owner1', { name: 'P' });
  const actions = (await Group.listLogs(r, g.id)).map((l) => l.action);
  assert.ok(actions.includes('group.create'));
  assert.ok(actions.includes('member.invite'));
  assert.ok(actions.includes('member.setDeputy'));
  assert.ok(actions.includes('project.create'));
});

test('通知已读标记', async () => {
  const { r, g } = await setup();
  const task = await Task.addTask(r, g.id, 'owner1', { title: 'T', assigneeAccountId: 'owner1' });
  const n = (await Group.listNotifications(r, g.id, 'owner1'))[0];
  await Group.markNotificationRead(r, n.id);
  assert.equal((await Group.listNotifications(r, g.id, 'owner1'))[0].read, true);
});

test('组间隔离：不同小组数据互不干扰', async () => {
  const r = makeRepo();
  const g1 = await Group.create(r, 'A组', 'u1');
  const g2 = await Group.create(r, 'B组', 'u1');
  await Task.addTask(r, g1.id, 'u1', { title: 'A任务' });
  await Task.addTask(r, g2.id, 'u1', { title: 'B任务' });
  assert.equal((await Task.listTasks(r, g1.id)).length, 1);
  assert.equal((await Task.listTasks(r, g1.id))[0].title, 'A任务');
  assert.deepEqual(TASK_STATUS.todo, '待办');
});

test("加入码往返：组长生成 → 成员解析并申请入组成功", async () => {
  const { buildJoinCode, parseJoinCode } = await import("../js/lib/group.js");
  const { r, g } = await setup();
  const code = buildJoinCode(g.id);
  assert.match(code, /^WL-/);
  const gid = parseJoinCode(code);
  assert.equal(gid, g.id);
  assert.equal(parseJoinCode(""), null);
  assert.equal(parseJoinCode("abc"), null);
  const req = await Group.requestJoin(r, gid, { accountId: "joiner", name: "申请员" });
  assert.equal(req.status, "pending");
  await Group.handleJoinRequest(r, g.id, "owner1", req.id, true);
  assert.equal(await roleOf(r, g.id, "joiner"), "member");
});