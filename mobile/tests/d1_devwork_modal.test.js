// D1 回归测试：开发工作弹窗重复 mount 不再叠加监听；提交成功后自动关闭（与其他模块一致）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, '..');
const read = (rel) => readFileSync(join(mobileDir, rel), 'utf8');

const dev = read('js/views/devwork.js');
const today = read('js/views/today.js');
const ledger = read('js/views/ledger.js');

test('D1：click 监听在重复 mount 前先移除旧处理器，不叠加', () => {
  assert.ok(
    dev.includes("if(el.__clickHandler) el.removeEventListener('click', el.__clickHandler);"),
    'click 必须先移除旧 __clickHandler'
  );
  assert.ok(
    dev.includes("el.addEventListener('click', onClick); el.__clickHandler=onClick;"),
    'click 处理器须命名并回存到 __clickHandler'
  );
});

test('D1：change 状态下拉监听同样去重（避免切回页面后重复触发）', () => {
  assert.ok(
    dev.includes("if(el.__changeHandler) el.removeEventListener('change', el.__changeHandler);"),
    'change 必须先移除旧 __changeHandler'
  );
  assert.ok(
    dev.includes("el.addEventListener('change', onChange); el.__changeHandler=onChange;"),
    'change 处理器须命名并回存到 __changeHandler'
  );
});

test('D1：回归保护——不得回退到无法移除的匿名叠加监听', () => {
  assert.ok(!/el\.addEventListener\('click',async/.test(dev), 'click 不应使用匿名 async 回调');
  assert.ok(!/el\.addEventListener\('change',async/.test(dev), 'change 不应使用匿名 async 回调');
});

test('D1：任务/Bug/片段/删除四个弹窗提交成功后 return false 自动关闭', () => {
  const closes = dev.match(/await render\(\); return false; \}\}\);/g) || [];
  assert.ok(closes.length >= 4, '至少 4 处提交成功后 return false 触发自动关闭，实际 ' + closes.length);
});

test('D1：与 today / ledger 视图保持同一套监听器去重约定', () => {
  for (const [name, src] of [['today', today], ['ledger', ledger], ['devwork', dev]]) {
    assert.ok(src.includes('__clickHandler'), name + ' 应使用 __clickHandler 去重');
  }
});

test('D1：弹窗统一复用 openModal，不引入原生确认框', () => {
  assert.ok(dev.includes('openModal'), 'devwork 应调用 openModal');
  assert.ok(!/window\.confirm\(/.test(dev), '不应使用原生 confirm');
});
