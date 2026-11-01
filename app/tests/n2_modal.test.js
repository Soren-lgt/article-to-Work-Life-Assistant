// N2 测试：弹窗关闭一次生效——只挂载一次、关闭即移出、遮罩双通道、关闭按钮热区
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openModal, isOverlayClick } from '../js/ui/modal.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');

function makeNode() {
  return {
    tagName: 'DIV', dataset: {}, listeners: {}, children: [], parentNode: null,
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { c.parentNode = null; this.children = this.children.filter((x) => x !== c); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector() { return makeNode(); },
    querySelectorAll() { return []; },
    innerHTML: '',
  };
}

function makeEnv() {
  const overlay = makeNode();
  const buttons = {};
  overlay.querySelector = (sel) => { if (!buttons[sel]) buttons[sel] = makeNode(); return buttons[sel]; };
  const body = {
    appendCount: 0, children: [],
    appendChild(c) { this.appendCount += 1; c.parentNode = this; this.children.push(c); },
    removeChild(c) { c.parentNode = null; this.children = this.children.filter((x) => x !== c); },
  };
  const doc = { createElement: () => overlay, body };
  return { overlay, body, buttons, doc };
}

test('N2：打开时遮罩只挂载一次（不重复 appendChild）', () => {
  const { doc, body } = makeEnv();
  openModal({ document: doc, title: 't' });
  assert.equal(body.appendCount, 1, '同一遮罩只应被 append 一次');
});

test('N2：close 一次即移出 body，onClose 仅一次，重复 close 不报错', () => {
  const { doc, overlay, body } = makeEnv();
  let closed = 0;
  openModal({ document: doc, title: 't', onClose: () => { closed += 1; } });
  assert.equal(overlay.parentNode, body);
  // 取 close：重新打开一个独立实例以便拿到 ctl
  const env2 = makeEnv();
  let closed2 = 0;
  const ctl = openModal({ document: env2.doc, title: 't', onClose: () => { closed2 += 1; } });
  ctl.close();
  assert.equal(env2.overlay.parentNode, null, '关闭后应脱离 body');
  assert.equal(env2.body.children.length, 0);
  assert.equal(closed2, 1);
  ctl.close(); ctl.close();
  assert.equal(closed2, 1, '重复关闭不应重复回调');
  assert.equal(closed, 0);
});

test('N2：遮罩 mousedown 与 click 双通道；点遮罩本体可关，点内部不关', () => {
  const a = makeEnv();
  openModal({ document: a.doc, title: 't' });
  const md = a.overlay.listeners['mousedown'] || [];
  assert.ok(md.length >= 1, '遮罩绑定 mousedown 关闭');
  md[0]({ target: a.overlay });
  assert.equal(a.overlay.parentNode, null, 'mousedown 点遮罩应关闭');

  const b = makeEnv();
  openModal({ document: b.doc, title: 't' });
  const ck = b.overlay.listeners['click'] || [];
  assert.ok(ck.length >= 1, '遮罩绑定 click 关闭');
  ck[0]({ target: b.overlay });
  assert.equal(b.overlay.parentNode, null, 'click 点遮罩应关闭');

  const c = makeEnv();
  openModal({ document: c.doc, title: 't' });
  const inner = makeNode();
  (c.overlay.listeners['mousedown'] || [])[0]({ target: inner });
  assert.notEqual(c.overlay.parentNode, null, '点弹窗内部不应关闭');
});

test('N2：关闭按钮与取消按钮均绑定 click 关闭', () => {
  const env = makeEnv();
  openModal({ document: env.doc, title: 't' });
  const closeBtn = env.buttons['[data-m-close]'];
  const cancelBtn = env.buttons['[data-m-cancel]'];
  assert.ok(closeBtn.listeners['click'].length >= 1, '× 绑定 click 关闭');
  assert.ok(cancelBtn.listeners['click'].length >= 1, '取消绑定 click 关闭');
});

test('N2：关闭按钮具备足够点击热区（不小于 32px）', () => {
  const css = readFileSync(join(appDir, 'css/app.css'), 'utf8');
  const rule = css.match(/\.modal-x\s*\{[^}]*\}/)[0];
  assert.match(rule, /min-height:\s*32px/);
  assert.match(rule, /padding:\s*8px 10px/);
});

test('isOverlayClick：仅遮罩本体触发关闭（回归保护）', () => {
  const overlay = makeNode();
  assert.equal(isOverlayClick(overlay, overlay), true);
  assert.equal(isOverlayClick(overlay, makeNode()), false);
});
