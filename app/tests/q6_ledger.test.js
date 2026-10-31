// Q6 记账改造专项测试：按钮文案 / 金额校验 / 去（今天）与改名 / 卡片点击弹窗 / 骨架
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { Ledger } from "../js/lib/ledger.js";
import ledger, { ledgerHomeButtonLabel, ledgerAmountFromInput } from "../js/modules/ledger.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const moduleSrc = readFileSync(join(appDir, "js/modules/ledger.js"), "utf8");

test("ledgerHomeButtonLabel：当天=今天，非当天=返回今天", () => {
  assert.equal(ledgerHomeButtonLabel(true), "今天");
  assert.equal(ledgerHomeButtonLabel(false), "返回今天");
});

test("ledgerAmountFromInput：必填且为有效数字", () => {
  assert.equal(ledgerAmountFromInput("").ok, false);
  assert.equal(ledgerAmountFromInput("abc").ok, false);
  assert.equal(ledgerAmountFromInput("12.5").value, 12.5);
  assert.equal(ledgerAmountFromInput(" 8 ").value, 8);
});

test("源码不再含（今天）后缀与卡片改名按钮", () => {
  assert.ok(!moduleSrc.includes("（今天）"), "不应再出现（今天）");
  assert.ok(!moduleSrc.includes("改名"), "卡片不应再有改名功能");
  assert.ok(moduleSrc.includes('data-op="pick"'), "卡片应可点击记账");
  assert.ok(moduleSrc.includes("openModal"), "应使用可靠模态弹窗");
});

test("弹窗金额入库为数字（lib 链路）", async () => {
  const r = new Repository(new MemoryAdapter());
  await Ledger.ensureDefaultCards(r, "u1");
  const [b] = await Ledger.listCards(r, "u1");
  const rec = await Ledger.addRecord(r, "u1", { cardId: b.id, amount: 12.5, date: "2026-10-31" });
  assert.equal(rec.amount, 12.5);
});

test("ledger 模块契约完整", () => {
  assert.equal(ledger.route, "ledger");
  assert.equal(typeof ledger.mount, "function");
});

function stubEl() {
  return {
    innerHTML: "", textContent: "", value: "", dataset: {}, hidden: false,
    addEventListener() {}, onclick: null, remove() {}, appendChild() {}, removeChild() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
  };
}
function makeState() {
  return { currentAccountId: "u1", currentDate: null, subscribe() { return () => {}; }, set() {}, emit() {}, get() { return undefined; } };
}
function installGlobals() {
  globalThis.window = { alert() {}, confirm: () => true, prompt: () => null, location: { hash: "" } };
  globalThis.document = { createElement: () => stubEl(), body: stubEl(), head: stubEl(), getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [] };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
function uninstallGlobals() { for (const k of ["window", "document", "localStorage"]) delete globalThis[k]; }

test("ledger mount 骨架不抛错且含日期切换/视图切换/新建分类", async () => {
  installGlobals();
  try {
    const repo = new Repository(new MemoryAdapter());
    const el = stubEl();
    await ledger.mount(el, { repo, state: makeState(), app: { state: makeState(), refreshAccounts: async () => {} } });
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(el.innerHTML.includes('data-act="today"'));
    assert.ok(el.innerHTML.includes('data-act="toggleView"'));
    assert.ok(el.innerHTML.includes('data-act="addCard"'));
  } finally { uninstallGlobals(); }
});