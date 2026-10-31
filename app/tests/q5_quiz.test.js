// Q5 题库改造专项测试：按钮排布 / 题库进入删除行 / 判断对错选项 / 动态选项行 / 契约骨架
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { Quiz } from "../js/lib/quiz.js";
import quiz, { buildTopActionsHTML, buildBankRowHTML, buildJudgeOptionHTML, buildChoiceOptionRowHTML, buildHistoryRowHTML, historyDetailHTML, startupBlockReason } from "../js/modules/quiz.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const quizSrc = readFileSync(join(here, "..", "js/modules/quiz.js"), "utf8");

test("顶部动作：顺序练习、考试模式在新建题库左侧且三者相邻，按钮恒可点击（不再被禁用静默无反应）", () => {
  const h = buildTopActionsHTML();
  const i1 = h.indexOf("顺序练习");
  const i2 = h.indexOf("考试模式");
  const i3 = h.indexOf("新建题库");
  assert.ok(i1 >= 0 && i2 > i1 && i3 > i2, "顺序练习 < 考试模式 < 新建题库");
  assert.ok(!h.includes("disabled"), "顶部训练/考试按钮不应 disabled，点击应给出反馈");
});

test("R3-T6：startupBlockReason 区分未选题库 / 题库无题 / 可开始三态", () => {
  assert.ok(startupBlockReason(null, 3), "未进入题库时给出引导");
  assert.ok(startupBlockReason("b1", 0), "题库无题时给出提示");
  assert.equal(startupBlockReason("b1", 3), null, "选题库且有题时可直接开始");
});

test("题库行：名称 + 进入按钮 + 进入右侧删除按钮", () => {
  const h = buildBankRowHTML({ id: "b1", name: "数据结构" }, null);
  assert.ok(h.includes("数据结构"));
  assert.match(h, /data-enter="b1"/);
  assert.match(h, /data-delbank="b1"/);
  const enter = h.indexOf("进入");
  const del = h.indexOf("删除");
  assert.ok(del > enter, "删除按钮在进入按钮右侧");
});

test("判断题固定给出正确/错误两个单选项", () => {
  const h = buildJudgeOptionHTML();
  assert.ok(h.includes("正确"));
  assert.ok(h.includes("错误"));
  assert.equal((h.match(/type="radio"/g) || []).length, 2);
});

test("单选/多选选项行含文本输入与正确标记，支持动态添加", () => {
  const h = buildChoiceOptionRowHTML();
  assert.ok(h.includes("data-opttext"));
  assert.ok(h.includes("data-optok"));
  assert.ok(h.includes("data-rowdel"));
});

test("题库分类隔离：choice 题库不混入 qa 题库", async () => {
  const r = new Repository(new MemoryAdapter());
  await Quiz.addBank(r, "u1", "choice", "选择库");
  await Quiz.addBank(r, "u1", "qa", "问答库");
  assert.equal((await Quiz.listBanks(r, "u1", "choice")).length, 1);
  assert.equal((await Quiz.listBanks(r, "u1", "qa")).length, 1);
});

test("判断题入库答案为对/错；多选可保存多选项答案", async () => {
  const r = new Repository(new MemoryAdapter());
  const bank = await Quiz.addBank(r, "u1", "choice", "C");
  const judge = await Quiz.addQuestion(r, bank.id, { stem: "判断", type: "judge", answer: "对" });
  assert.deepEqual(judge.options, ["对", "错"]);
  const multi = await Quiz.addQuestion(r, bank.id, { stem: "多选", type: "multiple", options: ["A", "B"], answer: ["A", "B"] });
  assert.deepEqual(multi.answer, ["A", "B"]);
});

test("quiz 模块契约完整", () => {
  assert.equal(quiz.route, "quiz");
  assert.equal(typeof quiz.mount, "function");
});

function stubEl() {
  return {
    innerHTML: "", textContent: "", value: "", dataset: {},
    addEventListener() {}, onclick: null, remove() {}, appendChild() {}, removeChild() {},
    insertAdjacentHTML() {}, lastElementChild: null,
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

test("quiz mount 骨架不抛错且渲染三类入口", async () => {
  installGlobals();
  try {
    const repo = new Repository(new MemoryAdapter());
    const el = stubEl();
    await quiz.mount(el, { repo, state: makeState(), app: { state: makeState(), refreshAccounts: async () => {} } });
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(el.innerHTML.includes('data-el="cats"'), "应有分类栏锚点");
    assert.ok(el.innerHTML.includes('data-el="main"'), "应有主内容锚点");
  } finally { uninstallGlobals(); }
});

test("R6：同一分类下不同题库的题目严格隔离，抽题只来自当前题库", async () => {
  const r = new Repository(new MemoryAdapter());
  const bA = await Quiz.addBank(r, "u1", "choice", "A库");
  const bB = await Quiz.addBank(r, "u1", "choice", "B库");
  await Quiz.addQuestion(r, bA.id, { stem: "A1", type: "single", options: ["x", "y"], answer: "x" });
  await Quiz.addQuestion(r, bB.id, { stem: "B1", type: "single", options: ["x", "y"], answer: "x" });
  const qA = await Quiz.listQuestions(r, bA.id);
  const qB = await Quiz.listQuestions(r, bB.id);
  assert.equal(qA.length, 1);
  assert.equal(qB.length, 1);
  assert.equal(qA[0].stem, "A1");
  assert.equal(qB[0].stem, "B1");
  assert.equal(Quiz.drawQuestions(qA, 1)[0].stem, "A1");
});

test("R6：removeAttempt 可删除单条成绩历史", async () => {
  const r = new Repository(new MemoryAdapter());
  const bank = await Quiz.addBank(r, "u1", "choice", "c");
  const a = await Quiz.saveAttempt(r, "u1", { bankId: bank.id, mode: "practice", score: 1, total: 1, details: [] });
  assert.equal((await Quiz.listAttempts(r, "u1")).length, 1);
  await Quiz.removeAttempt(r, a.id);
  assert.equal((await Quiz.listAttempts(r, "u1")).length, 0);
});

test("R6：历史行含查看与删除按钮", () => {
  const row = buildHistoryRowHTML({ id: "h1", mode: "exam", createdAt: Date.now(), score: 3, total: 5 }, 0);
  assert.match(row, /data-histview="h1"/);
  assert.match(row, /data-histdel="h1"/);
  assert.ok(row.includes("查看"));
  assert.ok(row.includes("删除"));
});

test("R6：历史明细为只读，展示题干/我的答案/参考答案", () => {
  const h = historyDetailHTML({
    mode: "practice", score: 2, total: 3,
    details: [{ stem: "题干一", categoryKey: "choice", correct: true, userAnswer: "A", answer: "A" }],
  });
  assert.ok(h.includes("题干一"));
  assert.ok(h.includes("我的答案"));
  assert.ok(h.includes("参考答案"));
  assert.ok(h.includes("只读"));
});

test("R6：练习/考试界面提供退出入口，不局限于结束训练/交卷", () => {
  assert.ok(quizSrc.includes('data-act="quit"'), "答题界面应有退出按钮");
});