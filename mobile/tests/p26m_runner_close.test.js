// AI生成
// P26-m：手机版点右上角 × 关掉答题窗，要和点「退出」一样干净，不能卡住下一次开始
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openModal } from '../../app/js/ui/modal.js';

const here = dirname(fileURLToPath(import.meta.url));
const quiz = readFileSync(join(here, '..', 'js/views/quiz.js'), 'utf8');

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
    children: [],
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { c.parentNode = null; this.children = this.children.filter((x) => x !== c); },
  };
  return { overlay, body, buttons, doc: { createElement: () => overlay, body } };
}

test('手机版答题窗：句柄已关闭时会重建，不复用已移除的 DOM', () => {
  assert.match(quiz, /if\(runnerCtl && !runnerCtl\.closed\(\)\) return;/);
  assert.match(quiz, /runnerCtl=null;\n      runnerCtl=openModal\(/);
});

test('手机版答题窗：接管关闭回调，点 × 等同取消（回题库管理、清空本场）', () => {
  const seg = quiz.slice(quiz.indexOf('function openRunnerModal'), quiz.indexOf('function cleanupRunner'));
  assert.match(seg, /onClose:\(\)=>\{/);
  assert.match(seg, /if\(runnerClosing\)\{ runnerClosing=false; return; \}/, '代码主动关闭时不回退页面');
  assert.match(seg, /cleanupRunner\(\)/);
  assert.match(seg, /v\.screen='manage'/, '用户关窗后回到题库管理');
  assert.match(seg, /v\.qs=\[\]; v\.i=0;/, '清掉本场题目与进度');
  assert.doesNotMatch(seg, /saveAttempt/, '点 × 不应写成绩');
});

test('手机版统一收尾：停考试计时、断开句柄', () => {
  const seg = quiz.slice(quiz.indexOf('function cleanupRunner'), quiz.indexOf('function closeRunner'));
  assert.match(seg, /clearInterval\(el\.__timer\)/);
  assert.match(seg, /el\.__timer=null/);
  assert.match(seg, /runnerCtl=null/);
});

test('手机版代码主动关闭：先置标志再清句柄，最后关弹窗', () => {
  const seg = quiz.slice(quiz.indexOf('function closeRunner'), quiz.indexOf('function startRunner'));
  assert.match(seg, /runnerClosing=true;/);
  assert.match(seg, /cleanupRunner\(\)/);
  assert.match(seg, /c\.close\(\)/);
});

test('手机版回归：退出按钮仍走 closeRunner + 回管理页', () => {
  const line = quiz.split("\n").find((l) => l.includes('data-act="quit"') && l.includes('onclick'));
  assert.ok(line, '退出按钮必须绑定点击');
  assert.ok(line.includes('closeRunner()'), '退出要走统一收尾');
  assert.ok(line.includes("v.screen='manage'"), '退出要回题库管理');
  assert.ok(line.includes('refresh()'));
});

test('所依赖的 closed() 界面：关闭后返回 true，重复关闭不抛错', () => {
  const env = makeEnv();
  const ctl = openModal({ document: env.doc, title: 't' });
  assert.equal(ctl.closed(), false);
  ctl.close();
  assert.equal(ctl.closed(), true);
  ctl.close();
  assert.equal(ctl.closed(), true);
});

test('手机版点 × 与退出走同一套清理：清理逻辑只写一份', () => {
  const openSeg = quiz.slice(quiz.indexOf('function openRunnerModal'), quiz.indexOf('function cleanupRunner'));
  const quitLine = quiz.split("\n").find((l) => l.includes('data-act="quit"') && l.includes('onclick'));
  assert.ok(openSeg.includes('cleanupRunner()'), '× 关闭要清理');
  assert.ok(quitLine.includes('closeRunner()'), '退出要清理');
  assert.ok(quiz.includes('function cleanupRunner'), '清理逻辑要集中在一处');
  const segs = quiz.split('clearInterval(el.__timer)').length - 1;
  assert.ok(segs >= 2, '停计时的入口：模块挂载、换题重置、统一收尾');
  const cleanSeg = quiz.slice(quiz.indexOf('function cleanupRunner'), quiz.indexOf('function closeRunner'));
  assert.equal(cleanSeg.split('clearInterval(el.__timer)').length - 1, 1, '清理函数里停一次就够');
});
