// Q3 开发工作改造专项测试：代码片段表单为多行代码框 + 片段数据链路 + 模块骨架
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { DevWork } from "../js/lib/devwork.js";
import devwork, { snippetFormHTML, taskFormHTML, bugFormHTML, devConfirmHTML } from "../js/modules/devwork.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const devSrc = readFileSync(join(here, "..", "js/modules/devwork.js"), "utf8");

test("snippetFormHTML：代码区为多行 textarea，含标题/语言/代码/描述字段", () => {
  const html = snippetFormHTML({});
  assert.ok(html.includes("<textarea"), "代码必须是多行 textarea 输入框");
  assert.ok(html.includes('data-f="code"'), "应有代码字段");
  assert.ok(html.includes('data-f="title"'));
  assert.ok(html.includes('data-f="lang"'));
  assert.ok(html.includes('data-f="desc"'));
});

test("snippetFormHTML：编辑预填值回填到表单（含多行代码）", () => {
  const prefill = { title: "排序", lang: "js", code: "const a = 1;\nconst b = 2;", desc: "示例" };
  const html = snippetFormHTML(prefill);
  assert.ok(html.includes("const a = 1;"));
  assert.ok(html.includes("const b = 2;"), "多行代码应整体回填");
  assert.ok(html.includes("排序"));
});

test("addSnippet 保存多行 code 与 desc；updateSnippet 可更新 code", async () => {
  const r = new Repository(new MemoryAdapter());
  const s = await DevWork.addSnippet(r, "u1", { title: "片段", lang: "js", code: "line1\nline2", desc: "说明" });
  assert.equal(s.code, "line1\nline2");
  assert.equal(s.desc, "说明");
  await DevWork.updateSnippet(r, s.id, { code: "renewed" });
  assert.equal((await r.get("devSnippet", s.id)).code, "renewed");
});

test("devwork 模块契约完整", () => {
  assert.equal(devwork.route, "devwork");
  assert.equal(typeof devwork.mount, "function");
});

function stubEl() {
  return {
    innerHTML: "", textContent: "", value: "", dataset: {},
    addEventListener() {}, remove() {}, appendChild() {}, removeChild() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
  };
}
function makeState() {
  return { currentAccountId: "u1", subscribe() { return () => {}; }, set() {}, emit() {}, get() { return undefined; } };
}
function installGlobals() {
  globalThis.window = { alert() {}, confirm: () => true, prompt: () => null, location: { hash: "" } };
  globalThis.document = { createElement: () => stubEl(), body: stubEl(), head: stubEl(), getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [] };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
function uninstallGlobals() { for (const k of ["window", "document", "localStorage"]) delete globalThis[k]; }

test("devwork 骨架含开发任务/Bug/代码片段三个 Tab", async () => {
  installGlobals();
  try {
    const repo = new Repository(new MemoryAdapter());
    const el = stubEl();
    await devwork.mount(el, { repo, state: makeState(), app: { state: makeState(), refreshAccounts: async () => {} } });
    await new Promise((r) => setTimeout(r, 40));
    for (const tab of ["开发任务", "Bug 记录", "代码片段"]) assert.ok(el.innerHTML.includes(tab), `缺少 Tab：${tab}`);
  } finally { uninstallGlobals(); }
});

test("R4：任务表单含标题与所属项目字段并可回填", () => {
  const blank = taskFormHTML({});
  assert.ok(blank.includes('data-f="title"'));
  assert.ok(blank.includes('data-f="projectName"'));
  const filled = taskFormHTML({ title: "登录模块", projectName: "WMS" });
  assert.ok(filled.includes('value="登录模块"'));
  assert.ok(filled.includes('value="WMS"'));
});

test("R4：Bug 表单含标题与多行现象描述并可回填", () => {
  const html = bugFormHTML({ title: "崩溃", symptom: "步骤一" });
  assert.ok(html.includes('data-f="title"'));
  assert.ok(html.includes('data-f="symptom"'));
  assert.ok(html.includes("<textarea"));
  assert.ok(html.includes("步骤一"));
});

test("R4：删除确认纯函数含类型与标题", () => {
  const h = devConfirmHTML("任务", "重构");
  assert.ok(h.includes("任务"));
  assert.ok(h.includes("重构"));
  assert.ok(h.includes("确认删除"));
});

test("R4：五类操作（新建任务/记Bug/代码笔记/编辑/删除）均走可靠模态，无原生 prompt/confirm", () => {
  assert.ok(!devSrc.includes("window.prompt"), "不应再使用 window.prompt");
  assert.ok(!devSrc.includes("window.confirm"), "不应再使用 window.confirm");
  for (const fn of ["openTaskModal", "openBugModal", "openSnippetModal", "openRemoveModal"]) {
    assert.ok(devSrc.includes(fn), `应存在弹窗函数 ${fn}`);
  }
});