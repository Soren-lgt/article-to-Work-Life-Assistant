// AI生成
// 手机版与电脑版功能对齐：首页卡片、账号改密、预置卡片
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { passwordChangeError } from '../js/main.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const appHome = read('app/js/modules/home.js');
const mHome = read('mobile/js/views/home.js');
const mMain = read('mobile/js/main.js');
const mPwd = read('mobile/js/password.js');

const gotos = (s) => (s.match(/data-goto="#[a-z]+"/g) || []).sort();

test('手机版首页：卡片与电脑版一一对应（不少开发工作卡）', () => {
  assert.deepEqual(gotos(mHome), gotos(appHome));
  assert.ok(mHome.includes("from '../../../app/js/lib/devwork.js'"));
  assert.ok(mHome.includes("data-goto=\"#devwork\""));
});

test('手机版首页：开发工作卡显示进行中/待开始与任务清单，口径同电脑版', () => {
  assert.ok(mHome.includes('进行中 ${doing} · 待开始 ${todo}'));
  assert.ok(mHome.includes("t.status !== '已完成'"));
  assert.ok(mHome.includes('未完成 ${openTasks.length} 项 / 共 ${devTasks.length} 项'));
  assert.ok(mHome.includes('暂无开发任务。'));
});

test('手机版账号：改密为旧/新/确认三框，与电脑版同款校验', () => {
  assert.ok(mPwd.includes('data-f="oldPwd"'));
  assert.ok(mPwd.includes('data-f="newPwd"'));
  assert.ok(mPwd.includes('data-f="confirmPwd"'));
  assert.ok(mPwd.includes("title: '修改密码'"));
  assert.ok(read('mobile/js/accountmenu.js').includes("['pwd', '修改密码']"));
  assert.ok(!mMain.includes('设置本地密码'));
});

test('手机版账号：改密失败清空三个框并把焦点回到旧密码', () => {
  assert.ok(mPwd.includes("['oldPwd', 'newPwd', 'confirmPwd']"));
  assert.ok(mPwd.includes("querySelector('[data-f=\"oldPwd\"]').focus()"));
});

test('改密校验：旧密码错 / 新密码空 / 两次不一致 / 通过', () => {
  assert.equal(passwordChangeError(false, 'new1', 'new1'), '旧密码不正确');
  assert.equal(passwordChangeError(true, '  ', '  '), '新密码不能为空');
  assert.equal(passwordChangeError(true, 'new1', 'new2'), '两次输入的密码不一致');
  assert.equal(passwordChangeError(true, 'new1', 'new1'), '');
});

test('通用设置窗口：预置卡片可新增初始卡片（对齐电脑版）', () => {
  assert.ok(mMain.includes('data-act="addInitCard">新增初始卡片'));
  assert.ok(mMain.includes('Ledger.addInitialCard(App.repo, accId, name)'));
  assert.ok(mMain.includes("openPrompt({ title: '新增初始卡片'"));
});

test('通用设置窗口：没有预置卡片时也要能看到新增按钮', () => {
  // 按钮在标题行里，与列表是否为空无关，空态照样能新增
  assert.ok(mMain.includes('data-act="addInitCard">新增初始卡片'));
  assert.ok(mMain.includes('暂无初始卡片，点上方「新增初始卡片」添加。'));
});

test('手机版文案与电脑版同口径：首页摘要', () => {
  assert.ok(mHome.includes('待完成 ${undone.length} 项 / 共 ${rows.length} 项'));
  assert.ok(mHome.includes('我的小组：<strong>${groups.length}</strong> 个'));
  assert.ok(mHome.includes('待我审核：${pendingReview} · 我的任务：${myTodo}'));
  assert.ok(mHome.includes('题库：<strong>${banks.length}</strong> 个'));
  assert.ok(mHome.includes('最近成绩：${last.score}'));
  assert.ok(mHome.includes('今日合计：<strong>¥'));
  assert.ok(mHome.includes('本月合计：¥'));
});

test('手机版文案与电脑版同口径：同组计划加入码与已读', () => {
  const mGroup = read('mobile/js/views/group.js');
  assert.ok(mGroup.includes('加入码（复制给组员，10位数字）'));
  assert.ok(mGroup.includes('>标记已读</button>'));
  assert.ok(mGroup.includes('粘贴 10 位数字加入码，或直接输入小组ID：'));
  assert.ok(mGroup.includes('仅组长/副组长可管理项目'));
  assert.ok(mGroup.includes('你还没有加入任何小组'));
  assert.ok(mGroup.includes('发给组员在「加入小组」粘贴即可申请'));
});

test('未登录提示不再指向已删除的设置模块', () => {
  const mLedger = read('mobile/js/views/ledger.js');
  const mDev = read('mobile/js/views/devwork.js');
  assert.ok(mLedger.includes('请先登录账号'));
  assert.ok(mDev.includes('请先登录账号'));
  assert.ok(!mLedger.includes('请先在设置中'));
  assert.ok(!mDev.includes('请先在设置中'));
});
