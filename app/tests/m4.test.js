// AI生成
// M4 测试：开发工作（开发任务 / Bug / 代码片段）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { DevWork, TASK_STATUS, BUG_STATUS } from '../js/lib/devwork.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }

test('addTask 空标题报错；默认项目与状态', async () => {
  const r = makeRepo();
  await assert.rejects(() => DevWork.addTask(r, 'u1', { title: '  ' }), /不能为空/);
  const t = await DevWork.addTask(r, 'u1', { title: '接口联调' });
  assert.equal(t.projectName, '未分组');
  assert.equal(t.status, '待开始');
});

test('addTask 非法状态回落；自定义项目', async () => {
  const r = makeRepo();
  const t = await DevWork.addTask(r, 'u1', { title: 'A', status: '瞎写', projectName: '项目A' });
  assert.equal(t.status, '待开始');
  assert.equal(t.projectName, '项目A');
});

test('groupTasksByProject 分组正确', async () => {
  const r = makeRepo();
  await DevWork.addTask(r, 'u1', { title: 'A', projectName: '项目A' });
  await DevWork.addTask(r, 'u1', { title: 'B', projectName: '项目A' });
  await DevWork.addTask(r, 'u1', { title: 'C', projectName: '项目B' });
  await DevWork.addTask(r, 'u2', { title: 'D', projectName: '项目A' });
  const groups = await DevWork.groupTasksByProject(r, 'u1');
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.projectName === '项目A').tasks.length, 2);
});

test('setTaskStatus 校验状态与存在性', async () => {
  const r = makeRepo();
  const t = await DevWork.addTask(r, 'u1', { title: 'A' });
  await DevWork.setTaskStatus(r, t.id, '进行中');
  assert.equal((await r.get('devTask', t.id)).status, '进行中');
  await assert.rejects(() => DevWork.setTaskStatus(r, t.id, '乱写'), /非法任务状态/);
  assert.deepEqual(TASK_STATUS, ['待开始', '进行中', '已完成']);
});

test('Bug：addBug 校验与 setBugStatus', async () => {
  const r = makeRepo();
  await assert.rejects(() => DevWork.addBug(r, 'u1', { title: ' ' }), /不能为空/);
  const b = await DevWork.addBug(r, 'u1', { title: '登录报错', symptom: '点击登录无响应' });
  assert.equal(b.status, '待处理');
  await DevWork.setBugStatus(r, b.id, '已修复');
  assert.equal((await r.get('devBug', b.id)).status, '已修复');
  await assert.rejects(() => DevWork.setBugStatus(r, b.id, '随便'), /非法 Bug 状态/);
  assert.equal(BUG_STATUS.length, 4);
});

test('Snippet：addSnippet 校验与 list 倒序', async () => {
  const r = makeRepo();
  await assert.rejects(() => DevWork.addSnippet(r, 'u1', { title: '' }), /不能为空/);
  await DevWork.addSnippet(r, 'u1', { title: '读JSON', lang: 'py', code: 'import json' });
  await new Promise((res) => setTimeout(res, 2));
  await DevWork.addSnippet(r, 'u1', { title: '分页组件', lang: 'js', code: 'function p(){}' });
  const list = await DevWork.listSnippets(r, 'u1');
  assert.deepEqual(list.map((s) => s.title), ['分页组件', '读JSON']);
});

test('账号隔离：三类数据互不串号', async () => {
  const r = makeRepo();
  await DevWork.addTask(r, 'u1', { title: 'A' });
  await DevWork.addBug(r, 'u1', { title: 'B' });
  await DevWork.addSnippet(r, 'u1', { title: 'C' });
  await DevWork.addTask(r, 'u2', { title: 'D' });
  assert.equal((await DevWork.listTasks(r, 'u1')).length, 1);
  assert.equal((await DevWork.listBugs(r, 'u1')).length, 1);
  assert.equal((await DevWork.listSnippets(r, 'u1')).length, 1);
  assert.equal((await DevWork.listTasks(r, 'u2')).length, 1);
  assert.equal((await DevWork.listBugs(r, 'u2')).length, 0);
});

test('remove 各类数据', async () => {
  const r = makeRepo();
  const t = await DevWork.addTask(r, 'u1', { title: 'A' });
  const b = await DevWork.addBug(r, 'u1', { title: 'B' });
  const s = await DevWork.addSnippet(r, 'u1', { title: 'C' });
  await DevWork.removeTask(r, t.id);
  await DevWork.removeBug(r, b.id);
  await DevWork.removeSnippet(r, s.id);
  assert.equal((await r.all('devTask')).length, 0);
  assert.equal((await r.all('devBug')).length, 0);
  assert.equal((await r.all('devSnippet')).length, 0);
});

test("updateBug 修改标题/现象并校验空标题；过滤非法状态", async () => {
  const r = makeRepo();
  const b = await DevWork.addBug(r, "u1", { title: "旧标题", symptom: "现象1" });
  await DevWork.updateBug(r, b.id, { title: "新标题", symptom: "现象2", status: "处理中" });
  let got = await r.get("devBug", b.id);
  assert.equal(got.title, "新标题");
  assert.equal(got.symptom, "现象2");
  assert.equal(got.status, "处理中");
  await assert.rejects(() => DevWork.updateBug(r, b.id, { title: " " }), /不能为空/);
  await DevWork.updateBug(r, b.id, { status: "乱写" });
  got = await r.get("devBug", b.id);
  assert.equal(got.status, "处理中");
});

test("updateTask 修改标题/项目并过滤非法状态", async () => {
  const r = makeRepo();
  const t = await DevWork.addTask(r, "u1", { title: "A", projectName: "P1" });
  await DevWork.updateTask(r, t.id, { title: "A2", projectName: "P2", status: "乱写" });
  const got = await r.get("devTask", t.id);
  assert.equal(got.title, "A2");
  assert.equal(got.projectName, "P2");
  assert.equal(got.status, "待开始");
});

test("编辑不存在的记录抛出异常", async () => {
  const r = makeRepo();
  await assert.rejects(() => DevWork.updateTask(r, "missing", { title: "x" }), /不存在/);
  await assert.rejects(() => DevWork.updateBug(r, "missing", { title: "x" }), /不存在/);
});