// Q2 今日计划改造专项测试：按钮文案纯函数 + 通用模态关闭逻辑 + 模块骨架
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { Accounts } from "../js/lib/accounts.js";
import today, { todayHomeButtonLabel, taskFormHTML, confirmDeleteHTML } from "../js/modules/today.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const todaySrc = readFileSync(join(here, "..", "js/modules/today.js"), "utf8");
import { openModal, isOverlayClick } from "../js/ui/modal.js";

test("todayHomeButtonLabel：当天=今天，非当天=返回今天", () => {
  assert.equal(todayHomeButtonLabel(true), "今天");
  assert.equal(todayHomeButtonLabel(false), "返回今天");
});

test("isOverlayClick：仅点遮罩本体才关闭，点弹窗内容不关闭", () => {
  const overlay = { id: "ov" };
  assert.equal(isOverlayClick(overlay, overlay), true);
  assert.equal(isOverlayClick(overlay, { inside: true }), false);
  assert.equal(isOverlayClick(null, overlay), false);
});

function stubEl() {
  return {
    innerHTML: "", textContent: "", value: "", dataset: {},
    addEventListener() {}, remove() {}, appendChild() {}, removeChild() {},
    querySelector() { return stubEl(); },
  };
}

test("openModal 可打开、close 幂等且关闭不抛错（修复弹窗关不掉）", () => {
  const body = stubEl();
  const doc = { createElement: () => stubEl(), body };
  let closedCount = 0;
  const ctl = openModal({ document: doc, title: "测试", onClose: () => { closedCount += 1; } });
  assert.ok(ctl, "应返回控制器");
  assert.equal(typeof ctl.close, "function");
  ctl.close();
  ctl.close(); // 重复关闭不应报错
  assert.equal(closedCount, 1, "关闭回调只应触发一次");
});

test("today 模块契约完整", () => {
  assert.equal(today.route, "today");
  assert.equal(typeof today.mount, "function");
});

// ---- 以下为 mount 骨架渲染（轻量 DOM 桩）----
function makeState() {
  return { currentAccountId: "u1", subscribe() { return () => {}; }, set() {}, emit() {}, get() { return undefined; } };
}
function installGlobals() {
  globalThis.window = { alert() {}, confirm: () => true, prompt: () => null, location: { hash: "" } };
  globalThis.document = { createElement: () => stubEl(), body: stubEl(), head: stubEl(), getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [] };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
function uninstallGlobals() { for (const k of ["window", "document", "localStorage"]) delete globalThis[k]; }

test("today 骨架：不再含（今天）后缀；添加任务按钮与月度概览按钮并存", async () => {
  installGlobals();
  try {
    const repo = new Repository(new MemoryAdapter());
    await Accounts.create(repo, { name: "u1" });
    const el = stubEl();
    await today.mount(el, { repo, state: makeState(), app: { state: makeState(), refreshAccounts: async () => {} } });
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(!el.innerHTML.includes("（今天）"), "不应再出现（今天）后缀");
    assert.ok(el.innerHTML.includes('data-act="add"'), "应有添加任务按钮");
    assert.ok(el.innerHTML.includes('data-act="toggleView"'), "应有月度概览按钮");
    assert.ok(el.innerHTML.includes("月度概览"), "月度概览文案存在");
  } finally { uninstallGlobals(); }
});

test("R3：任务表单纯函数含标题/优先级/备注，编辑可回显备注与优先级", () => {
  const blank = taskFormHTML({});
  assert.ok(blank.includes('data-f="title"'));
  assert.ok(blank.includes('data-f="priority"'));
  assert.ok(blank.includes('data-f="note"'), "表单应含备注输入框");
  const filled = taskFormHTML({ title: "买药", priority: "高", note: "晚上买" });
  assert.ok(filled.includes('value="买药"'));
  assert.ok(filled.includes('value="晚上买"'));
  assert.ok(filled.includes('<option selected>高</option>'));
});

test("R3：删除确认纯函数包含任务标题", () => {
  const h = confirmDeleteHTML("买牛奶");
  assert.ok(h.includes("买牛奶"));
  assert.ok(h.includes("确认删除"));
});

test("R3：添加/编辑/删除均走可靠模态，不再使用原生 prompt/confirm", () => {
  assert.ok(!todaySrc.includes("window.prompt"));
  assert.ok(!todaySrc.includes("window.confirm"));
  assert.equal((todaySrc.match(/const ctl = openModal/g) || []).length, 3, "添加/编辑/删除三处弹窗");
  assert.ok(todaySrc.includes("openEditModal"));
  assert.ok(todaySrc.includes("openDeleteModal"));
});