// P26-g：手机版去掉「数据与设置」模块，所有设置项收进账号下拉（顺序与电脑版一致）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const mHtml = read('mobile/index.html');
const mMain = read('mobile/js/main.js');
const mMenu = read('mobile/js/accountmenu.js');
const dMenu = read('app/js/ui/accountmenu.js');

test('底部导航不再有「设置」入口', () => {
  assert.ok(!mHtml.includes('data-route="settings"'));
  const routes = mHtml.match(/data-route="[a-z]+"/g) || [];
  assert.deepEqual(
    routes.map((r) => r.slice(12, -1)),
    ['home', 'today', 'devwork', 'group', 'quiz', 'ledger'],
  );
});

test('页面里不再有设置模块容器', () => {
  assert.ok(!mHtml.includes('data-module="settings"'));
  const modules = mHtml.match(/data-module="[a-z]+"/g) || [];
  assert.equal(modules.length, 6);
});

test('设置页源码已删除，main.js 不再加载它', () => {
  assert.equal(existsSync(join(root, 'mobile/js/views/settings.js')), false);
  assert.ok(!mMain.includes("from './views/settings.js'"));
  assert.ok(mMain.includes('const MODULES = { home, today, devwork, group, quiz, ledger };'));
});

test('「默认打开页」不再提供设置页选项', () => {
  assert.ok(!mMain.includes("['settings', '设置']"));
  assert.ok(mMain.includes("['ledger', '每日记账']"));
});

test('账号下拉 7 项顺序与电脑版逐项一致', () => {
  const expected = "const MENU_ITEMS = [['theme', '主题设置'], ['export', '导出数据'], ['import', '加载数据'], ['clear', '清空数据'], ['logout', '退出登录'], ['pwd', '修改密码'], ['rename', '更改名字']];";
  assert.ok(dMenu.includes("['theme', '主题设置']"));
  const order = [...mMenu.matchAll(/\[['"](theme|export|import|clear|logout|pwd|rename)['"],\s*['"]([^'"]+)['"]\]/g)]
    .map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(order, [
    'theme:主题设置', 'export:导出数据', 'import:加载数据', 'clear:清空数据',
    'logout:退出登录', 'pwd:修改密码', 'rename:更改名字',
  ]);
  assert.ok(expected.includes('清空数据'));
});

test('登录后点账号名走下拉，未登录才打开登录弹窗', () => {
  assert.ok(mMain.includes('if (AppState.currentAccountId) openAccountMenu({ app: App, anchor: btn, onAction: runMenuAction });'));
  assert.ok(mMain.includes('else openAccountManager();'));
});

test('主题设置打开「通用设置」窗口，含主题/默认打开页/站内提醒/记账初始卡片', () => {
  assert.ok(mMain.includes("if (act === 'theme') return openGeneralSettings();"));
  assert.ok(mMain.includes("openModal({ title: '通用设置'"));
  assert.ok(mMain.includes('data-f="theme"'));
  assert.ok(mMain.includes('data-f="defaultRoute"'));
  assert.ok(mMain.includes('data-f="notify"'));
  assert.ok(mMain.includes('记账初始卡片管理'));
});

test('数据与设置里的能力都在下拉里：导出/加载/清空/改名', () => {
  const acts = mMain.match(/if \(act === '[a-zA-Z]+'\)/g) || [];
  for (const a of ['theme', 'export', 'import', 'clear', 'logout', 'pwd', 'rename']) {
    assert.ok(acts.some((line) => line.includes("'" + a + "'")), 'missing menu branch: ' + a);
  }
  assert.ok(mMain.includes('worklife-backup-'));
});
