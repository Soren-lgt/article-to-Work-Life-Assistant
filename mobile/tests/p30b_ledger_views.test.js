// P30-b：记账三种状态——按天查看 / 月度汇总 / 年度汇总
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shiftMonth, shiftYear, monthRange, summarizeYear } from '../js/lib/ledgerperiod.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/js/views/ledger.js'), 'utf8');

test('月份前后移动能跨年', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-11', 0), '2026-11');
  assert.equal(shiftMonth('2026-11', -1), '2026-10');
});

test('年份前后移动', () => {
  assert.equal(shiftYear('2026', 1), '2027');
  assert.equal(shiftYear('2026', -1), '2025');
});

test('一年固定 12 个月，月份补零', () => {
  const list = monthRange('2026');
  assert.equal(list.length, 12);
  assert.deepEqual(list.slice(0, 2), ['2026-01', '2026-02']);
  assert.equal(list[11], '2026-12');
});

test('年度汇总按月列出并把同一张卡的各地金额合并', () => {
  const list = [
    { month: '2026-01', count: 2, total: 12.3, perCard: [{ cardId: 'c1', name: '早餐', count: 1, total: 2 }, { cardId: 'c2', name: '中餐', count: 1, total: 10.3 }] },
    { month: '2026-02', count: 1, total: 0.1, perCard: [{ cardId: 'c1', name: '早餐', count: 1, total: 0.1 }] },
    { month: '2026-03', count: 0, total: 0, perCard: [] },
  ];
  const s = summarizeYear(list);
  assert.equal(s.months.length, 3);
  assert.equal(s.count, 3);
  assert.equal(s.total, 12.4);
  const morning = s.perCard.find((c) => c.cardId === 'c1');
  assert.equal(morning.count, 2);
  assert.equal(morning.total, 2.1, '浮点相加要收成两位小数');
});

test('三种状态的切换按钮文案：月度汇总 → 年度汇总 → 按天查看', () => {
  assert.ok(src.includes("viewBtn.textContent = view==='day'?'月度汇总':(view==='month'?'年度汇总':'按天查看');"));
  assert.ok(src.includes("view = view==='day'?'month':(view==='month'?'year':'day');"));
});

test('月度汇总状态下日期栏是前一个月 / 2026-11 / 后一个月 / 本月', () => {
  assert.ok(src.includes("prevBtn.textContent='前一个月'; nextBtn.textContent='后一个月';"));
  assert.ok(src.includes("dateLabel.textContent=month;"));
  assert.ok(src.includes("todayBtn.textContent = month===monthStr()?'本月':'返回本月';"));
});

test('年度汇总状态下日期栏是前一年 / 2026 / 后一年 / 今年', () => {
  assert.ok(src.includes("prevBtn.textContent='前一年'; nextBtn.textContent='后一年';"));
  assert.ok(src.includes("dateLabel.textContent=year;"));
  assert.ok(src.includes("todayBtn.textContent = year===todayStr().slice(0,4)?'今年':'返回今年';"));
});

test('按天状态保持原来的前一天 / 日期 / 后一天 / 今天', () => {
  assert.ok(src.includes("prevBtn.textContent='前一天'; nextBtn.textContent='后一天';"));
  assert.ok(src.includes("todayBtn.textContent = date===todayStr()?'今天':'返回今天';"));
});

test('三个视图容器都在，年度视图按月汇总数据', () => {
  assert.ok(src.includes('data-el="dayView"'));
  assert.ok(src.includes('data-el="monthView"'));
  assert.ok(src.includes('data-el="yearView"'));
  const yearFn = src.slice(src.indexOf('async function renderYear'), src.indexOf('async function render()'));
  assert.ok(yearFn.includes('Ledger.monthSummary(repo,accId,m)'));
  assert.ok(yearFn.includes('monthRange(year)'));
  assert.ok(yearFn.includes('全年合计'));
});

test('年视图里点某个月可以下钻到该月的月度汇总', () => {
  assert.ok(src.includes('data-op="pickmonth"'));
  assert.ok(src.includes("else if(op==='pickmonth'){ month=hit.dataset.month; view='month'; await render(); }"));
});

test('月度 / 年度状态下点日期分别挑月份和年份', () => {
  assert.ok(src.includes("openModal({title:'选择月份'"));
  assert.ok(src.includes('type="month"'));
  assert.ok(src.includes("openModal({title:'选择年份'"));
  assert.ok(src.includes('type="number" min="2000" max="2100"'));
});
