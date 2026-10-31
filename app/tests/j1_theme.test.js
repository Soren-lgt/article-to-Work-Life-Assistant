// J1 外观主题：主题名归一化纯函数单测（不触碰 DOM / 业务逻辑）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_LIST, THEME_OPTIONS, DEFAULT_THEME, normalizeTheme } from '../js/lib/theme.js';

test('主题集合固定为 5 套，且选项值与列表一一对应', () => {
  assert.equal(THEME_LIST.length, 5);
  assert.deepEqual(THEME_OPTIONS.map(([v]) => v), THEME_LIST);
});

test('合法主题名原样返回', () => {
  for (const t of THEME_LIST) assert.equal(normalizeTheme(t), t);
});

test('旧值 light / dark 向后兼容映射到新主题', () => {
  assert.equal(normalizeTheme('light'), 'classic');
  assert.equal(normalizeTheme('dark'), 'night');
});

test('空值、非法值、非字符串一律回退默认主题 forest', () => {
  for (const bad of [undefined, null, '', 'midnight', 'LIGHT', 123]) {
    assert.equal(normalizeTheme(bad), DEFAULT_THEME);
  }
});

test('默认主题在主题集合之内', () => {
  assert.ok(THEME_LIST.includes(DEFAULT_THEME));
});

test('applyTheme 新主题：写入对应 data-theme，仅 night 挂 body.dark（旧 light/dark 契约不变）', async () => {
  const calls = [];
  globalThis.document = {
    documentElement: { setAttribute: (k, v) => calls.push(['html', k, v]) },
    body: { classList: { toggle: (c, on) => calls.push(['body', c, on]) } },
  };
  try {
    const { applyTheme } = await import('../js/modules/settings.js');
    applyTheme('indigo');
    applyTheme('night');
    applyTheme('classic');
    applyTheme('dark');
    applyTheme('light');
  } finally {
    delete globalThis.document;
  }
  assert.deepEqual(calls, [
    ['html', 'data-theme', 'indigo'], ['body', 'dark', false],
    ['html', 'data-theme', 'night'], ['body', 'dark', true],
    ['html', 'data-theme', 'classic'], ['body', 'dark', false],
    ['html', 'data-theme', 'dark'], ['body', 'dark', true],
    ['html', 'data-theme', 'light'], ['body', 'dark', false],
  ]);
});