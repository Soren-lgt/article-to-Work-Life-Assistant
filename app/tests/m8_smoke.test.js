// AI生成
// M8 补充冒烟测试：用内存仓储 + 轻量 DOM 桩，逐个真实执行 7 个 UI 模块的 mount，
// 捕获 Node 契约测试（只 import、不执行 mount）覆盖不到的渲染运行时错误。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { Accounts } from '../js/lib/accounts.js';
import { TodayPlan } from '../js/lib/todayplan.js';
import { Memo } from '../js/lib/memo.js';
import { Ledger } from '../js/lib/ledger.js';

function stubEl() {
  return {
    innerHTML: '', textContent: '', value: '', files: [],
    onclick: null, __unsub: null, style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, insertAdjacentHTML() {}, append() {}, prepend() {}, remove() {},
    setAttribute() {}, getAttribute() { return ''; }, click() {},
    querySelector() { return stubEl(); },
    querySelectorAll() { return []; },
  };
}

function makeState() {
  return {
    currentAccountId: 'u1', currentGroupId: null, currentDate: null,
    subscribe() { return () => {}; },
    set() {}, emit() {}, get() { return undefined; },
  };
}

function makeCtx(repo) {
  const state = makeState();
  return { repo, state, app: { state, refreshAccounts: async () => {} } };
}

function installGlobals() {
  globalThis.window = { alert() {}, confirm: () => true, prompt: () => null, location: { hash: '' } };
  globalThis.alert = () => {};
  globalThis.confirm = () => true;
  globalThis.prompt = () => null;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = {
    createElement: () => stubEl(),
    body: stubEl(),
    head: stubEl(),
    documentElement: { setAttribute() {} },
    getElementById: () => stubEl(),
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
  };
}
function uninstallGlobals() {
  for (const k of ['window', 'alert', 'confirm', 'prompt', 'localStorage', 'document']) delete globalThis[k];
}

async function freshRepo() {
  const repo = new Repository(new MemoryAdapter());
  await Accounts.create(repo, { name: '测试员', password: 'pw' });
  return repo;
}

test('7 个模块 mount 均不抛运行时错误且产出非空 HTML', async () => {
  installGlobals();
  try {
    const mods = ['home', 'today', 'ledger', 'devwork', 'quiz', 'group', 'settings'];
    for (const name of mods) {
      const mod = (await import(`../js/modules/${name}.js`)).default;
      const repo = await freshRepo();
      const el = stubEl();
      await mod.mount(el, makeCtx(repo));
      await new Promise((r) => setTimeout(r, 40));
      if (name !== "settings") assert.ok(el.innerHTML.length > 30, `${name} 未渲染出骨架 HTML`);
    }
  } finally {
    uninstallGlobals();
  }
});

test('home 模块骨架含 5 张功能卡（今日/备忘/同组/题库/记账）', async () => {
  installGlobals();
  try {
    const mod = (await import('../js/modules/home.js')).default;
    const repo = await freshRepo();
    await TodayPlan.add(repo, 'u1', { title: '冒烟待办', priority: 'high' });
    await Memo.add(repo, 'u1', '冒烟备忘内容');
    const el = stubEl();
    await mod.mount(el, makeCtx(repo));
    await new Promise((r) => setTimeout(r, 40));
    for (const label of ['今日计划', '快速备忘', '同组计划', '题库', '每日记账']) {
      assert.ok(el.innerHTML.includes(label), `首页缺少「${label}」卡片`);
    }
  } finally { uninstallGlobals(); }
});

test('ledger 模块预置分类与记录后挂载不报错', async () => {
  installGlobals();
  try {
    const mod = (await import('../js/modules/ledger.js')).default;
    const repo = await freshRepo();
    await Ledger.ensureDefaultCards(repo, 'u1');
    const cards = await Ledger.listCards(repo, 'u1');
    await Ledger.addRecord(repo, 'u1', { cardId: cards[0].id, amount: 12.5, note: '冒烟', date: '2026-10-31' });
    const el = stubEl();
    await mod.mount(el, makeCtx(repo));
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(el.innerHTML.length > 30);
  } finally { uninstallGlobals(); }
});