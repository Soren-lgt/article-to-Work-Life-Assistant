// AI生成
// M8 测试：模块契约 / 页面结构 / 联调验收（跨模块完整流程）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { Accounts } from '../js/lib/accounts.js';
import { TodayPlan } from '../js/lib/todayplan.js';
import { todayStr } from '../js/lib/utils.js';
import { Ledger } from '../js/lib/ledger.js';
import { DevWork } from '../js/lib/devwork.js';
import { Quiz } from '../js/lib/quiz.js';
import { Group, Task } from '../js/lib/group.js';
import { Backup } from '../js/lib/backup.js';
import { gradeQuestion } from '../js/lib/scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const MODULES = ['home', 'today', 'devwork', 'group', 'quiz', 'ledger', 'settings'];

for (const name of MODULES) {
  test(`模块 ${name} 契约完整（route/title/mount）`, async () => {
    const mod = (await import(`../js/modules/${name}.js`)).default;
    assert.equal(typeof mod.route, 'string');
    assert.equal(mod.route, name);
    assert.equal(typeof mod.title, 'string');
    assert.ok(mod.title.length > 0);
    assert.equal(typeof mod.mount, 'function');
  });
}

test('index.html 含 7 个导航项与 7 个模块容器，且与模块一一对应', () => {
  const html = readFileSync(join(appDir, 'index.html'), 'utf8');
  for (const name of MODULES) {
    assert.match(html, new RegExp(`data-route="${name}"`), `缺少导航 ${name}`);
    assert.match(html, new RegExp(`data-module="${name}"`), `缺少模块容器 ${name}`);
  }
  assert.match(html, /id="quickMemo"/);
  assert.match(html, /id="notifyBadge"/);
  assert.match(html, /id="accountBtn"/);
});

test('app.js 注册全部模块并导出关键函数', async () => {
  const src = readFileSync(join(appDir, 'js/app.js'), 'utf8');
  for (const name of MODULES) assert.match(src, new RegExp(name));
  assert.match(src, /export async function refreshAccounts/);
  assert.match(src, /export async function refreshNotify/);
});

test('lib 层关键 API 均可调用', async () => {
  assert.equal(typeof (await import('../js/lib/backup.js')).Backup.exportAll, 'function');
  assert.equal(typeof (await import('../js/lib/group.js')).Group.create, 'function');
  assert.equal(typeof (await import('../js/lib/quiz.js')).Quiz.addBank, 'function');
  assert.equal(typeof (await import('../js/lib/scoring.js')).gradeQuestion, 'function');
});

test('联调：账号 → 今日计划 → 记账 全流程', async () => {
  const r = new Repository(new MemoryAdapter());
  const acc = await Accounts.create(r, { name: '小明' });
  assert.equal((await Accounts.list(r)).length, 1);
  await TodayPlan.add(r, acc.id, { title: '写周报' });
  const done = await TodayPlan.toggle(r, (await TodayPlan.listByDate(r, acc.id, todayStr()))[0].id);
  assert.equal(done.done, true);
  await Ledger.ensureDefaultCards(r, acc.id);
  const card = (await Ledger.listCards(r, acc.id))[0];
  await Ledger.addRecord(r, acc.id, { date: '2026-10-31', cardId: card.id, amount: 12.5 });
  const day = await Ledger.dayTotal(r, acc.id, '2026-10-31');
  assert.equal(day.total, 12.5);
  assert.equal(day.count, 1);
});

test('联调：题库 建库 → 录题 → 抽题 → 判分 → 存成绩', async () => {
  const r = new Repository(new MemoryAdapter());
  const acc = await Accounts.create(r, { name: '小红' });
  const bank = await Quiz.addBank(r, acc.id, 'choice', '基础');
  await Quiz.addQuestion(r, bank.id, { stem: '2+2=?', type: 'single', options: ['3', '4'], answer: '4' });
  await Quiz.addQuestion(r, bank.id, { stem: '地球是圆的', type: 'judge', answer: '对' });
  const qs = await Quiz.listQuestions(r, bank.id);
  const drawn = Quiz.drawQuestions(qs, 2, () => 0.3);
  assert.equal(drawn.length, 2);
  let score = 0;
  const details = drawn.map((q) => {
    const r2 = gradeQuestion(q, q.answer);
    score += r2.score;
    return { questionId: q.id, correct: r2.correct };
  });
  await Quiz.saveAttempt(r, acc.id, { bankId: bank.id, mode: 'exam', score, total: drawn.length, details });
  const atts = await Quiz.listAttempts(r, acc.id);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].score, 2);
});

test('联调：同组 建组 → 邀人 → 项目 → 任务 → 附件 → 审核 → 日志', async () => {
  const r = new Repository(new MemoryAdapter());
  const owner = await Accounts.create(r, { name: '组长' });
  const member = await Accounts.create(r, { name: '成员' });
  const g = await Group.create(r, '研发组', owner.id);
  await Group.invite(r, g.id, owner.id, { accountId: member.id });
  const p = await Task.addProject(r, g.id, owner.id, { name: '官网', deadline: '2026-12-01' });
  const t = await Task.addTask(r, g.id, owner.id, { projectId: p.id, title: '联调', assigneeAccountId: member.id });
  await Task.uploadAttachment(r, t.id, member.id, { name: 'log.txt', content: 'ok' });
  assert.equal((await Task.listTasks(r, g.id))[0].status, 'review');
  await Task.confirmTask(r, g.id, owner.id, t.id);
  assert.equal((await Task.listTasks(r, g.id))[0].status, 'done');
  assert.ok((await Group.listLogs(r, g.id)).length >= 5);
});

test('联调：备份 → 恢复 保真', async () => {
  const r = new Repository(new MemoryAdapter());
  const acc = await Accounts.create(r, { name: '备份用户' });
  await TodayPlan.add(r, acc.id, { title: 'A' });
  const bank = await Quiz.addBank(r, acc.id, 'qa', '答题库');
  await Quiz.addQuestion(r, bank.id, { stem: '什么是变量', answer: '存储单元', keywords: ['存储'] });
  const dump = await Backup.exportAll(r);
  const text = JSON.stringify(dump);
  await Backup.resetAll(r);
  assert.equal((await r.all('accounts')).length, 0);
  await Backup.importFromText(r, text, { mode: 'replace' });
  assert.equal((await r.all('accounts')).length, 1);
  assert.equal((await r.all('question')).length, 1);
  assert.equal((await r.all('question'))[0].stem, '什么是变量');
});

test('全部 lib 模块可被导入（无 DOM 顶层依赖）', async () => {
  const libs = ['db', 'utils', 'schema', 'accounts', 'todayplan', 'memo', 'ledger', 'devwork', 'group', 'quiz', 'scoring', 'backup'];
  for (const name of libs) {
    const m = await import(`../js/lib/${name}.js`);
    assert.ok(Object.keys(m).length >= 1, `${name} 无导出`);
  }
});

test("ctx.app 契约：App 暴露 settings 依赖的刷新方法与 state，且挂载 7 个模块", async () => {
  const { App } = await import("../js/app.js");
  assert.equal(typeof App.refreshAccounts, "function");
  assert.equal(typeof App.refreshNotify, "function");
  assert.ok(App.state, "App.state 必须存在");
  assert.equal(Object.keys(App.modules).length, 7);
  for (const name of MODULES) assert.ok(App.modules[name], `缺少模块 ${name}`);
});