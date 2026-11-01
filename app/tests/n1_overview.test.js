// N1 测试：数据概览不展示「首页·今日计划与备忘」统计行；其余模块按 store 汇总
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewRows, OVERVIEW_HIDDEN_KEYS } from '../js/modules/settings.js';

const MODULES = {
  today: ['todoplan', 'memo'],
  ledger: ['ledgerCategory', 'ledgerRecord'],
  quiz: ['question'],
};
const labels = { today: '首页·今日计划与备忘', ledger: '每日记账', quiz: '题库' };

test('数据概览不展示 today（首页·今日计划与备忘）统计行', () => {
  const stats = { todoplan: 3, memo: 2, ledgerCategory: 1, ledgerRecord: 5, question: 10 };
  const rows = buildOverviewRows(MODULES, labels, stats);
  assert.ok(!rows.some((r) => r.key === 'today'), 'today 不应出现在概览行');
  assert.ok(!rows.some((r) => r.label.includes('备忘')), '概览不应出现备忘文案');
});

test('其余模块按所属 store 条数汇总计数', () => {
  const stats = { ledgerCategory: 1, ledgerRecord: 5, question: 10 };
  const rows = buildOverviewRows(MODULES, labels, stats);
  assert.equal(rows.find((r) => r.key === 'ledger').count, 6);
  assert.equal(rows.find((r) => r.key === 'quiz').count, 10);
});

test("缺失 store 计数按 0 兜底，不抛错", () => {
  const rows = buildOverviewRows(MODULES, labels, {});
  assert.ok(rows.every((r) => r.count === 0));
});

test("OVERVIEW_HIDDEN_KEYS 至少包含 today", () => {
  assert.ok(OVERVIEW_HIDDEN_KEYS.includes('today'));
});
