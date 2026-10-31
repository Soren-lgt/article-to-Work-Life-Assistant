// AI生成
// M8-UI 测试：界面自检（主题切换真正生效 / 界面规范组件 / 顶部工具条 / 防溢出 / 模块页齐备）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');

test('app.css 定义深色主题变量与元素适配（body.dark）', () => {
  const css = readFileSync(join(appDir, 'css/app.css'), 'utf8');
  assert.match(css, /body\.dark\s*\{/);
  assert.match(css, /--panel:\s*#/);
  assert.match(css, /--bg:\s*#/);
  assert.match(css, /--text:\s*#/);
  assert.match(css, /body\.dark\s+input/);
});

test('app.css 含界面规范组件类（卡片/按钮/导航/顶栏/徽标）', () => {
  const css = readFileSync(join(appDir, 'css/app.css'), 'utf8');
  for (const cls of ['.card', '.btn', '.btn.primary', '.nav-item', '.topbar', '.badge']) {
    assert.ok(css.includes(cls), `缺少组件样式 ${cls}`);
  }
});

test('app.css 对超长文本设防溢出（overflow-wrap）', () => {
  const css = readFileSync(join(appDir, 'css/app.css'), 'utf8');
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('index.html 顶部工具条含账号切换/通知/快速备忘三要素与三层框架', () => {
  const html = readFileSync(join(appDir, 'index.html'), 'utf8');
  assert.match(html, /id="accountBtn"/);
  assert.match(html, /id="notifyBell"/);
  assert.match(html, /id="notifyBadge"/);
  assert.match(html, /id="quickMemo"/);
  assert.match(html, /class="sidebar"/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="content"/);
});

test('applyTheme 同时切换 data-theme 与 body.dark（深色真正生效）', async () => {
  const calls = [];
  globalThis.document = {
    documentElement: { setAttribute: (k, v) => calls.push(['html', k, v]) },
    body: { classList: { toggle: (c, on) => calls.push(['body', c, on]) } },
  };
  try {
    const { applyTheme } = await import('../js/modules/settings.js');
    applyTheme('dark');
    applyTheme('light');
  } finally {
    delete globalThis.document;
  }
  assert.deepEqual(calls[0], ['html', 'data-theme', 'dark']);
  assert.deepEqual(calls[1], ['body', 'dark', true]);
  assert.deepEqual(calls[2], ['html', 'data-theme', 'light']);
  assert.deepEqual(calls[3], ['body', 'dark', false]);
});

test('计划 §9：7 个模块页文件齐备且契约完整', async () => {
  const mods = ['home', 'today', 'devwork', 'group', 'quiz', 'ledger', 'settings'];
  for (const name of mods) {
    const m = (await import(`../js/modules/${name}.js`)).default;
    assert.equal(m.route, name);
    assert.equal(typeof m.mount, 'function');
  }
});