// D3 回归测试：题库录题弹窗中“单选”题型的正确项互斥（同一组 radio，只能勾一个）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const quiz = readFileSync(join(here, '..', 'js/views/quiz.js'), 'utf8');

test('D3：新建题目弹窗的单选 radio 带统一 name（同组互斥）', () => {
  const addForm = quiz.match(/function renderChoiceOptions[\s\S]*?function collectQuestion/)[0];
  assert.ok(addForm.includes("name=\"rec-ok\""), '新建分支单选 radio 必须有 name 才能互斥');
});

test('D3：编辑题目弹窗回填的单选 radio 同样带统一 name', () => {
  const editForm = quiz.slice(quiz.indexOf("function openEditQuestionModal"));
  assert.ok(editForm.includes("name=\"rec-ok\""), '编辑分支单选 radio 必须有 name');
});

test('D3：多选题型仍使用 checkbox（允许勾选多个），且不被强制互斥', () => {
  assert.ok(quiz.includes("type==='multiple'?'checkbox':'radio'"), '多选应保持 checkbox / 单选 radio 的类型选择');
  const addForm = quiz.match(/function renderChoiceOptions[\s\S]*?function collectQuestion/)[0];
  assert.ok(addForm.includes("${type==='multiple'?'checkbox':'radio'}"));
});

test('D3：提交答案时单选取单个 correct[0]，多选取数组 correct', () => {
  assert.ok(quiz.includes("data.answer=type==='multiple'?correct:correct[0]"),
    '单选答案应为单值 correct[0]，多选应为数组 correct');
});

test('D3：回归——判断题仍用 name=jok，答题界面仍用 name=opt（不被本次改动影响）', () => {
  assert.ok(quiz.includes('name="jok"'), '判断题 radio 分组名 jok 应保留');
  assert.ok(quiz.includes('name="opt"'), '答题界面 radio 分组名 opt 应保留');
});
