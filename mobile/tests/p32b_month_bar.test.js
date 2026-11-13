// P32-b：月度概览里的日期栏改成按月翻（前一个月/后一个月、本月），中间只显示月份
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/js/views/today.js'), 'utf8');

// 把真实实现里的 shiftMonth 抽出来跑（不是抄一份假的）
const pad = (n) => String(n).padStart(2, '0');
const body = src.slice(src.indexOf('function shiftMonth'), src.indexOf('function escapeHtml'));
const shiftMonth = new Function('pad', `${body}\nreturn shiftMonth;`)(pad);

test('月度概览里翻页按钮说"前一个月 / 后一个月"，回今天的按钮说"本月"', () => {
  assert.ok(src.includes("prevBtn.textContent='前一个月'; nextBtn.textContent='后一个月';"));
  assert.ok(src.includes("todayBtn.textContent = month===monthStr()?'本月':'返回本月';"));
});

test('按天视图仍是"前一天 / 后一天 / 今天"，两套文案都在', () => {
  assert.ok(src.includes("prevBtn.textContent='前一天'; nextBtn.textContent='后一天';"));
  assert.ok(src.includes("todayBtn.textContent = date===todayStr()?'今天':'返回今天';"));
});

test('中间那段只显示 2026-11，不再拖一个"月度概览"尾巴', () => {
  assert.equal(src.includes("+' 月度概览'"), false);
  assert.ok(src.includes("dateLabel.textContent=month;"), '月度态只写月份');
});

test('月度里的前后翻走月份，不是退化成某一天', () => {
  assert.ok(src.includes("if(view==='month'){ month=shiftMonth(month,-1); }"));
  assert.ok(src.includes("if(view==='month'){ month=shiftMonth(month,1); }"));
  assert.ok(src.includes("if(view==='month'){ month=monthStr(); }"));
});

test('shiftMonth 算得对（含跨年、闰年 2 月）', () => {
  assert.equal(shiftMonth('2026-11', 1), '2026-12');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2024-03', -1), '2024-02');
  assert.equal(shiftMonth('2026-11', -1), '2026-10');
});
