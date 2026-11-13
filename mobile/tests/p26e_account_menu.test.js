// P26-e 账号管理对齐：移动版顶栏账号菜单与电脑版 7 项完全一致
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_ITEMS, accountMenuHTML } from '../js/accountmenu.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const mMain = read('mobile/js/main.js');
const dMenu = read('app/js/ui/accountmenu.js');
const mPwd = read('mobile/js/password.js');

// 从电脑版源码解析出菜单项（避免在 node 里加载桌面 UI 依赖）
const desktopItems = [...dMenu.matchAll(/\['([a-z]+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);

test('菜单项与电脑版完全一致：数量 / 顺序 / 标识 / 文案', () => {
  assert.deepEqual(MENU_ITEMS, desktopItems);
  assert.equal(MENU_ITEMS.length, 7);
  assert.deepEqual(MENU_ITEMS.map((x) => x[0]), ['theme', 'export', 'import', 'clear', 'logout', 'pwd', 'rename']);
  assert.deepEqual(MENU_ITEMS.map((x) => x[1]),
    ['主题设置', '导出数据', '加载数据', '清空数据', '退出登录', '修改密码', '更改名字']);
});

test('菜单骨架：顶部当前账号名 + 7 个 menu item', () => {
  const html = accountMenuHTML('验收员');
  assert.ok(html.includes('验收员'));
  assert.ok(html.includes('class="acc-menu-head"'));
  for (const [act, label] of MENU_ITEMS) {
    assert.ok(html.includes(`data-act="${act}"`), act);
    assert.ok(html.includes(`>${label}</button>`), label);
  }
  assert.equal((html.match(/class="acc-menu-item"/g) || []).length, 7);
});

test('点账号名：已登录展开下拉菜单，未登录打开登录弹窗', () => {
  assert.ok(mMain.includes('if (AppState.currentAccountId) openAccountMenu({ app: App, anchor: btn, onAction: runMenuAction });'));
  assert.ok(mMain.includes('else openAccountManager();'));
  assert.ok(mMain.includes('import { MENU_ITEMS, accountMenuHTML, openAccountMenu, closeAccountMenu } from \'./accountmenu.js\';'));
});

test('账号弹窗只承担登录/注册，不再有账号列表与删除账号', () => {
  assert.ok(!mMain.includes('accountListHTML'));
  assert.ok(!mMain.includes('data-act="del"'));
  assert.ok(!mMain.includes('删除账号'));
  assert.ok(mMain.includes('data-act="tabLogin"'));
  assert.ok(mMain.includes('data-act="tabRegister"'));
  assert.equal(mMain.includes('data-act="logout"'), false);
});

test('登录/注册失败走弹窗内联提示，不再用原生 alert', () => {
  assert.ok(!mMain.includes('window.alert'));
  assert.ok(mMain.includes('data-el="formError"'));
  assert.ok(mMain.includes("setFormError('密码错误，请重新输入')"));
  assert.ok(mMain.includes("setFormError('请选择要登录的账号')"));
});

test('登录/注册成功后关闭弹窗（对齐电脑版自动关闭）', () => {
  const block = mMain.slice(mMain.indexOf('async function openAccountManager()'), mMain.indexOf('async function runMenuAction'));
  assert.ok((block.match(/ctl\.close\(\);/g) || []).length >= 2);
});

test('7 个动作全部有分支与实现函数', () => {
  for (const act of ['theme', 'export', 'import', 'clear', 'logout', 'pwd', 'rename']) {
    assert.ok(mMain.includes(`if (act === '${act}') return`), act);
  }
  for (const fn of ['openGeneralSettings', 'exportData', 'openLoadData', 'openClearData', 'doLogout', 'openPasswordChange', 'openRename']) {
    assert.ok(mMain.includes(`function ${fn}(`), fn);
  }
});

test('导出 / 清空 / 通用设置 与电脑版同口径', () => {
  assert.ok(mMain.includes('worklife-backup-${stamp}.json'));
  assert.ok(mMain.includes('将清空今日计划、每日记账、开发工作、题库、同组计划的全部数据，账号保留。此操作不可撤销。'));
  assert.ok(mMain.includes('记账初始卡片管理'));
  assert.ok(mMain.includes('站内提醒（顶部铃铛显示未读）'));
  assert.ok(mMain.includes('「覆盖加载」会先清空现有数据再写入；「合并加载」保留现有数据。'));
  assert.ok(mMain.includes('新增初始卡片'));
  assert.ok(dMenu.includes('账号保留'));
});

test('修改密码：三框 + 同一套校验 + 同一标题', () => {
  assert.ok(mPwd.includes('data-f="oldPwd"'));
  assert.ok(mPwd.includes('data-f="newPwd"'));
  assert.ok(mPwd.includes('data-f="confirmPwd"'));
  assert.ok(mPwd.includes("['oldPwd', 'newPwd', 'confirmPwd']"));
  assert.ok(mPwd.includes("title: '修改密码'"));
  assert.ok(dMenu.includes("title: '修改密码'"));
  assert.ok(dMenu.includes('旧密码不正确'));
});

test('更改名字：标题与电脑版一致', () => {
  assert.ok(mMain.includes("title: '更改名字'"));
  assert.ok(dMenu.includes("title: '更改名字'"));
});

test('退出登录与主题设置都会即时作用到界面', () => {
  assert.ok(mMain.includes("AppState.set({ currentAccountId: null, loggedOut: true });"));
  assert.ok(mMain.includes("document.documentElement.setAttribute('data-theme', normalizeTheme(prefs.theme));"));
  assert.ok(mMain.includes("showToast('已退出登录')"));
});

test('菜单与轻提示样式在移动版 CSS 内', () => {
  const css = read('mobile/css/mobile.css');
  assert.ok(css.includes('.acc-menu{'));
  assert.ok(css.includes('.acc-menu-item{'));
  assert.ok(css.includes('.acc-menu-item:active'));
  assert.ok(css.includes('.toast{'));
  assert.ok(css.includes('.field-error{'));
});
