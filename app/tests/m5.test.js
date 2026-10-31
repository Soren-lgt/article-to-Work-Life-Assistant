// AI生成
// M5 测试：题库（判分 / 题库 / 题目 / 抽题 / 成绩）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { Quiz, CHOICE_TYPES } from '../js/lib/quiz.js';
import { gradeChoice, gradeQa, gradeQuestion, sameSet } from '../js/lib/scoring.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }

test('sameSet 忽略顺序与重复', () => {
  assert.equal(sameSet(['a', 'b'], ['b', 'a']), true);
  assert.equal(sameSet(['a', 'a'], ['a']), true);
  assert.equal(sameSet(['a'], ['a', 'b']), false);
});

test('gradeChoice 单选/判断', () => {
  assert.equal(gradeChoice({ type: 'single', answer: 'A' }, 'A'), 1);
  assert.equal(gradeChoice({ type: 'single', answer: 'A' }, 'B'), 0);
  assert.equal(gradeChoice({ type: 'judge', answer: '对' }, '对'), 1);
});

test('gradeChoice 多选集合相等', () => {
  const q = { type: 'multiple', answer: ['A', 'C'] };
  assert.equal(gradeChoice(q, ['C', 'A']), 1);
  assert.equal(gradeChoice(q, ['A']), 0);
  assert.equal(gradeChoice(q, ['A', 'B', 'C']), 0);
  assert.equal(gradeChoice(q, []), 0);
});

test('gradeQa 命中全部关键词才算对', () => {
  const q = { keywords: ['列表', '切片'] };
  assert.deepEqual(gradeQa(q, '列表就是切片'), { correct: true, hit: 2, total: 2 });
  assert.deepEqual(gradeQa(q, '列表'), { correct: false, hit: 1, total: 2 });
  assert.equal(gradeQa({ keywords: [] }, '随便').correct, false);
});

test('gradeQuestion 按类别分派；代码类不自动判分', () => {
  assert.equal(gradeQuestion({ categoryKey: 'choice', type: 'single', answer: 'A' }, 'A').score, 1);
  assert.equal(gradeQuestion({ categoryKey: 'qa', keywords: ['x'] }, 'x').correct, true);
  const code = gradeQuestion({ categoryKey: 'code' }, 'print(1)');
  assert.equal(code.manual, true);
  assert.equal(code.correct, null);
});

test('ensureCategories 固定三类且幂等', async () => {
  const r = makeRepo();
  await Quiz.ensureCategories(r);
  await Quiz.ensureCategories(r);
  const cats = await r.all('category');
  assert.equal(cats.length, 3);
  assert.deepEqual(cats.map((c) => c.key).sort(), ['choice', 'code', 'qa']);
});

test('addBank 校验名称与类别；listBanks 隔离', async () => {
  const r = makeRepo();
  await assert.rejects(() => Quiz.addBank(r, 'u1', 'choice', '  '), /不能为空/);
  await assert.rejects(() => Quiz.addBank(r, 'u1', 'bad', '题库'), /非法题目类别/);
  await Quiz.addBank(r, 'u1', 'choice', 'Python基础题库');
  await Quiz.addBank(r, 'u1', 'qa', '网络题库');
  await Quiz.addBank(r, 'u2', 'choice', '别人的题库');
  assert.equal((await Quiz.listBanks(r, 'u1')).length, 2);
  assert.equal((await Quiz.listBanks(r, 'u1', 'choice')).length, 1);
});

test('addQuestion 选择类：题型/选项/答案校验', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'choice', '选择题库');
  await assert.rejects(() => Quiz.addQuestion(r, bank.id, { stem: '' }), /题干不能为空/);
  await assert.rejects(() => Quiz.addQuestion(r, bank.id, { stem: 'x', type: 'single', options: ['A'] }), /至少需要 2 个选项/);
  await assert.rejects(() => Quiz.addQuestion(r, bank.id, { stem: 'x', type: 'single', options: ['A', 'B'] }), /请设置正确答案/);
  const q = await Quiz.addQuestion(r, bank.id, { stem: '1+1=?', type: 'single', options: ['1', '2'], answer: '2', analysis: '基础' });
  assert.equal(q.categoryKey, 'choice');
  assert.equal(q.answer, '2');
  assert.equal(q.options.length, 2);
});

test('addQuestion 选择题默认判断题选项；多选答案数组', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'choice', 'X');
  const judge = await Quiz.addQuestion(r, bank.id, { stem: '天是蓝的', type: 'judge', answer: '对' });
  assert.deepEqual(judge.options, ['对', '错']);
  const multi = await Quiz.addQuestion(r, bank.id, { stem: '多选', type: 'multiple', options: ['A', 'B', 'C'], answer: ['A', 'B'] });
  assert.deepEqual(multi.answer, ['A', 'B']);
});

test('addQuestion 问答类：关键词至少一个', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'qa', '问答库');
  await assert.rejects(() => Quiz.addQuestion(r, bank.id, { stem: '什么是列表', answer: '...', keywords: [] }), /至少填写一个关键词/);
  const q = await Quiz.addQuestion(r, bank.id, { stem: '什么是列表', answer: '有序集合', keywords: ['有序', '可变'] });
  assert.deepEqual(q.keywords, ['有序', '可变']);
});

test('addQuestion 代码类：保存语言/参考代码/提示', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'code', '代码库');
  const q = await Quiz.addQuestion(r, bank.id, { stem: '写个求和', lang: 'python', refCode: 'sum()', hint: '用内置函数' });
  assert.equal(q.lang, 'python');
  assert.equal(q.refCode, 'sum()');
});

test('drawQuestions 抽题数量与不重复', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'choice', 'X');
  for (let i = 0; i < 5; i++) await Quiz.addQuestion(r, bank.id, { stem: 'Q' + i, type: 'judge', answer: '对' });
  const all = await Quiz.listQuestions(r, bank.id);
  const drawn = Quiz.drawQuestions(all, 3, () => 0.5);
  assert.equal(drawn.length, 3);
  assert.equal(new Set(drawn.map((q) => q.id)).size, 3);
  assert.equal(Quiz.drawQuestions(all, 10).length, 5);
});

test('removeBank 连带删除题目', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'choice', 'X');
  await Quiz.addQuestion(r, bank.id, { stem: 'Q', type: 'judge', answer: '对' });
  await Quiz.removeBank(r, bank.id);
  assert.equal(await r.get('bank', bank.id), null);
  assert.equal((await r.all('question')).length, 0);
});

test('saveAttempt / listAttempts 成绩记录', async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, 'u1', 'choice', 'X');
  await Quiz.saveAttempt(r, 'u1', { bankId: bank.id, mode: 'practice', score: 1, total: 1, details: [{ questionId: 'q1', correct: true }] });
  await new Promise((res) => setTimeout(res, 2));
  await Quiz.saveAttempt(r, 'u1', { bankId: bank.id, mode: 'exam', score: 2, total: 3, details: [] });
  await Quiz.saveAttempt(r, 'u2', { bankId: bank.id, mode: 'exam', score: 3, total: 3, details: [] });
  const list = await Quiz.listAttempts(r, 'u1');
  assert.equal(list.length, 2);
  assert.equal(list[0].mode, 'exam');
  assert.deepEqual(CHOICE_TYPES, ['single', 'multiple', 'judge']);
});

test("filterWrong 仅挑出判错题，排除正确与人工批改", async () => {
  const { filterWrong, accuracy } = await import("../js/lib/scoring.js");
  const results = [{ correct: true }, { correct: false }, { correct: null, manual: true }];
  assert.equal(filterWrong(results).length, 1);
  assert.equal(filterWrong([]).length, 0);
  assert.equal(accuracy(3, 4), 0.75);
  assert.equal(accuracy(0, 0), 0);
});

test("saveAttempt 保存 startedAt 与 timeSpent 作答时间", async () => {
  const r = makeRepo();
  const bank = await Quiz.addBank(r, "u1", "choice", "X");
  await Quiz.saveAttempt(r, "u1", {
    bankId: bank.id, mode: "exam", score: 1, total: 2, details: [],
    startedAt: 1000, timeSpent: 95000,
  });
  const a = (await Quiz.listAttempts(r, "u1"))[0];
  assert.equal(a.startedAt, 1000);
  assert.equal(a.timeSpent, 95000);
});