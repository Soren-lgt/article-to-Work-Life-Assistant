// P26-i：手机版顺序练习跨题库按题型排序、考试按 20/5/10/5/2 配额随机抽取
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSequentialQuestions,
  drawExamQuestions,
  examPlanText,
  typeCounts,
  questionTypeKey,
  QUESTION_TYPE_ORDER,
} from '../../app/js/lib/quiz.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const mQuiz = read('mobile/js/views/quiz.js');
const dump = JSON.parse(read('mobile/seed/deep-learning-quiz.json'));
const banks = dump.stores.bank;
const qs = dump.stores.question;

test('顺序练习不再要求先进入某个题库，改为跨全部题库取题', () => {
  assert.ok(mQuiz.includes('Quiz.practiceQuestions(repo,state.currentAccountId)'));
  assert.ok(!mQuiz.includes('请先进入一个题库再开始练习'));
  assert.ok(!mQuiz.includes('const list=await currentQuestions();\n        if(!v.bankId)'));
});

test('顺序练习：选择第一个题库 → 代码最后一个题库，题型按 单选/多选/判断/问答/代码 排', () => {
  const seq = buildSequentialQuestions(banks, qs);
  assert.equal(seq.length, qs.length);
  assert.equal(seq[0].bankId, 'dl-bank-1');
  assert.equal(seq[seq.length - 1].bankId, 'dl-bank-4');
  // 题型严格单调不回退
  const ranks = seq.map((q) => QUESTION_TYPE_ORDER.indexOf(questionTypeKey(q)));
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] >= ranks[i - 1]);
  // 同题型内题库顺序不变：单选先 bank1 再 bank2
  const singleBanks = seq.filter((q) => questionTypeKey(q) === 'single').map((q) => q.bankId);
  const firstBank2 = singleBanks.indexOf('dl-bank-2');
  assert.ok(firstBank2 > 0);
  assert.ok(singleBanks.slice(0, firstBank2).every((b) => b === 'dl-bank-1'));
  assert.ok(singleBanks.slice(firstBank2).every((b) => b === 'dl-bank-2'));
});

test('顺序练习的题型分布与题库数据一致', () => {
  const counts = typeCounts(buildSequentialQuestions(banks, qs));
  assert.deepEqual(counts, { single: 25, multiple: 8, judge: 12, qa: 6, code: 3 });
});

test('考试模式：按题型配额抽取 20 单选 / 5 多选 / 10 判断 / 5 问答 / 2 代码', () => {
  const draw = drawExamQuestions(qs);
  assert.equal(draw.total, 42);
  assert.deepEqual(
    draw.detail.map((d) => [d.type, d.want, d.got]),
    [['single', 20, 20], ['multiple', 5, 5], ['judge', 10, 10], ['qa', 5, 5], ['code', 2, 2]],
  );
  const counts = typeCounts(draw.list);
  assert.deepEqual(counts, { single: 20, multiple: 5, judge: 10, qa: 5, code: 2 });
  // 抽出的题目不重复
  assert.equal(new Set(draw.list.map((q) => q.id)).size, 42);
});

test('考试配额文案与电脑版一致', () => {
  assert.equal(examPlanText(), '20 单选 / 5 多选 / 10 判断 / 5 问答 / 2 代码（共 42 题）');
  assert.ok(mQuiz.includes('Quiz.examPlanText()'));
  assert.ok(mQuiz.includes('Quiz.typeCounts(allQs)'));
});

test('考试模式界面不再让用户手填抽题数', () => {
  assert.ok(!mQuiz.includes('data-el="cnt"'));
  assert.ok(!mQuiz.includes('data-el="cnt" type="number"'));
  assert.ok(mQuiz.includes('考试按题型随机抽取：'));
  assert.ok(mQuiz.includes('现有题目：'));
  assert.ok(mQuiz.includes('时长(分钟)'));
});

test('考试开始真正走配额抽取，题不足时给提示', () => {
  assert.ok(mQuiz.includes('const draw=Quiz.drawExamQuestions(all);'));
  assert.ok(mQuiz.includes('题目不足，无法开始考试。'));
  assert.ok(!mQuiz.includes('Quiz.drawQuestions(list,cnt)'));
});

test('深度学习题库：4 个题库、54 题、题型齐全且可导入', () => {
  assert.equal(banks.length, 4);
  assert.deepEqual(banks.map((b) => b.categoryKey), ['choice', 'choice', 'qa', 'code']);
  assert.equal(qs.length, 54);
  const counts = typeCounts(qs);
  assert.ok(counts.single >= 20 && counts.multiple >= 5 && counts.judge >= 10 && counts.qa >= 5 && counts.code >= 2);
  assert.equal(new Set(qs.map((q) => q.id)).size, 54);
  assert.equal(new Set(qs.map((q) => q.bankId)).size, 4);
  for (const q of qs) {
    assert.equal(q.accountId, '__IMPORT__');
    assert.ok(String(q.stem || '').length > 0);
    if (q.categoryKey === 'choice') {
      assert.ok(['single', 'multiple', 'judge'].includes(q.type));
      assert.ok(Array.isArray(q.options) && q.options.length >= 2);
      assert.ok(q.answer != null);
      if (q.type === 'multiple') assert.ok(Array.isArray(q.answer) && q.answer.length > 0);
      else assert.ok(q.options.includes(q.answer));
    } else if (q.categoryKey === 'qa') {
      assert.ok(String(q.answer || '').length > 0);
      assert.ok(Array.isArray(q.keywords) && q.keywords.length > 0);
    } else {
      assert.ok(String(q.refCode || '').length > 0);
    }
  }
});
