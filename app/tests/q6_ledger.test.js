// Q6 记账改造专项测试：按钮文案 / 金额校验 / 去（今天）与改名 / 卡片点击弹窗 / 骨架
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { Ledger } from "../js/lib/ledger.js";
import ledger, { ledgerHomeButtonLabel, ledgerAmountFromInput, newConsumeFormHTML, removeCardConfirmHTML, resolveLedgerOp } from "../js/modules/ledger.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const moduleSrc = readFileSync(join(appDir, "js/modules/ledger.js"), "utf8");
const settingsSrc = readFileSync(join(appDir, "js/modules/settings.js"), "utf8");

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

test("R7：新增消费表单含名称、金额、备注，金额为数字输入", () => {
  const h = newConsumeFormHTML();
  assert.ok(h.includes('data-f="name"'));
  assert.ok(h.includes('data-f="amt"'));
  assert.ok(h.includes('data-f="note"'));
  assert.ok(h.includes('type="number"'), "金额应为数字输入框");
});

test("R7：删除消费确认纯函数含名称与确认提示", () => {
  const h = removeCardConfirmHTML("餐饮");
  assert.ok(h.includes("餐饮"));
  assert.ok(h.includes("确认删除"));
});

test("R7：自建消费卡 preset=false，预置卡 preset=true（不进初始卡片管理）", async () => {
  const r = new Repository(new MemoryAdapter());
  await Ledger.ensureDefaultCards(r, "u1");
  const presets = await Ledger.listCards(r, "u1");
  assert.ok(presets.every((c) => c.preset === true));
  const custom = await Ledger.addCard(r, "u1", "夜宵");
  assert.equal(custom.preset, false);
});

test("R7：按钮改名新增消费、卡片 hover 类；移除当天记录明细与原生弹窗", () => {
  assert.ok(moduleSrc.includes("+ 新增消费"), "按钮应为新增消费");
  assert.ok(!moduleSrc.includes("新建分类") && !moduleSrc.includes("新增分类"), "不再使用分类旧称");
  assert.ok(moduleSrc.includes("ledger-card"), "消费卡片应有 hover 类");
  assert.ok(!moduleSrc.includes("当天记录"), "不应再渲染当天记录明细模块");
  assert.ok(!moduleSrc.includes('data-el="records"'), "不应再有记录明细容器");
  assert.ok(!moduleSrc.includes('op="delrec"'), "不应再有记录删除操作");
  assert.ok(!moduleSrc.includes("window.prompt"));
  assert.ok(!moduleSrc.includes("window.confirm"));
});

test("R7：设置页初始卡片管理仅列预置卡，不暴露自建新增入口", () => {
  assert.ok(settingsSrc.includes("preset === true"), "只展示预置初始卡片");
  assert.ok(!settingsSrc.includes("新增卡片"), "初始卡片管理不再提供自建卡片新增");
});

test("R3-T8：点卡片子元素归到卡片记账；点删除按钮归到删除；空目标安全返回", () => {
  const pickCard = { dataset: { op: "pick", id: "c1", name: "餐饮" }, closest: () => pickCard };
  const innerStrong = { tagName: "STRONG", closest: () => pickCard };
  assert.equal(resolveLedgerOp(innerStrong).op, "pick", "点卡片标题等子元素应进入记账");
  assert.equal(resolveLedgerOp(innerStrong).id, "c1");
  const delBtn = { dataset: { op: "delcard", id: "c1", name: "餐饮" }, closest: () => delBtn };
  assert.equal(resolveLedgerOp(delBtn).op, "delcard", "删除按钮应优先识别为删除");
  assert.equal(resolveLedgerOp(null).op, null);
});

test("R3-T9：新增消费/删除弹窗重挂载不重复绑定，取消一次关闭", () => {
  assert.ok(moduleSrc.includes("removeEventListener('click', el.__clickHandler)"), "重挂载应移除旧点击监听");
  assert.ok(moduleSrc.includes("el.__clickHandler = onClick"), "处理器应命名保存");
  assert.ok(moduleSrc.includes("openModal"), "新增消费与删除确认均走可靠模态");
});