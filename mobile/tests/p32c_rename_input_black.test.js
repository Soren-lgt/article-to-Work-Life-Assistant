// P32-c：更改名字（以及卡片改名这类输入弹窗）里输入的新内容是黑色
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const css = readFileSync(join(root, 'mobile/css/mobile.css'), 'utf8');
const mainSrc = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');

function rule(selector, body) {
  return css.includes(selector) && (body ? css.includes(body) : true);
}

test('弹窗输入框的文字颜色被固定成黑色', () => {
  assert.ok(css.includes('.modal-body input[data-f="v"]'), '有专门的规则');
  const block = css.slice(css.indexOf('.modal-body input[data-f="v"]'));
  const rules = block.slice(0, block.indexOf('}'));
  assert.ok(/color:\s*#000/i.test(rules), 'color:#000');
  assert.ok(/-webkit-text-fill-color:\s*#000/i.test(rules), 'iOS 上也按黑色渲染');
});

test('黑字不影响其它表单（.field input 仍跟随主题）', () => {
  const fieldBlock = css.slice(css.indexOf('.field input,'), css.indexOf('.field textarea'));
  assert.equal(/#000/.test(fieldBlock), false, '.field 输入框没有改成死黑');
});

test('"更改名字"走的是这个弹窗输入（data-f="v"）', () => {
  assert.ok(mainSrc.includes("if (act === 'rename') return openRename();"));
  assert.ok(mainSrc.includes("openPrompt({ title: '更改名字', label: '新名称'"));
  // openPrompt 生成的输入框就是 data-f="v"（app/js/ui/modal.js 里）
  const modal = readFileSync(join(root, 'app/js/ui/modal.js'), 'utf8');
  assert.ok(modal.includes('data-f=\\"v\\"') || modal.includes('data-f="v"'), 'prompt 输入框标记一致');
});

test('夜间主题下也是黑字（规则用固定色，不用主题变量）', () => {
  const block = css.slice(css.indexOf('.modal-body input[data-f="v"]'));
  const rules = block.slice(0, block.indexOf('}'));
  assert.equal(rules.includes('var(--fg)'), false, '不跟随主题前景色');
  assert.equal(rules.includes('--muted'), false, '不是灰色');
});

test('输入框本身可见：有白底和边框，不靠主题背景色', () => {
  const block = css.slice(css.indexOf('.modal-body input[data-f="v"]'));
  const rules = block.slice(0, block.indexOf('}'));
  assert.ok(/background:\s*#fff/i.test(rules));
  assert.ok(/border:\s*1px solid/i.test(rules));
  assert.ok(rule('.modal-body input[data-f="v"]'));
});
