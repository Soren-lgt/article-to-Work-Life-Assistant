// P27-a：记账日期栏只留「前一天 / 日期 / 后一天 / 今天」，删掉重复的日期选择框
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/js/views/ledger.js'), 'utf8');

test('日期栏里不再内联日期选择框（改点日期后弹窗选择）', () => {
  assert.ok(!src.includes('data-el="datePicker"'));
  assert.ok(!src.includes('datePicker.addEventListener'));
  const bar = src.slice(src.indexOf('data-act="prev"'), src.indexOf('data-el="dayView"'));
  assert.ok(!bar.includes('type="date"'), '日期栏内不应再出现日期选择框');
});

test('前一天 / 日期 / 后一天 三个元素挨在一起，顺序固定', () => {
  const prev = src.indexOf('data-act="prev"');
  const label = src.indexOf('data-el="dateLabel"');
  const next = src.indexOf('data-act="next"');
  assert.ok(prev > 0 && label > prev && next > label);
  // 三者必须处在同一个 .row wrap 容器内（中间不出现新的容器起点）
  const seg = src.slice(prev, next);
  assert.ok(!seg.includes('<div'), '中间不应插入新的分组容器');
});

test('今天按钮仍在日期组内，用于回到当天', () => {
  const today = src.indexOf('data-act="today"');
  assert.ok(today > src.indexOf('data-act="next"'));
  assert.ok(src.includes("todayBtn.textContent = date===todayStr()?'今天':'返回今天'"));
});

test('日期文字仍随当前日期刷新', () => {
  assert.ok(src.includes('dateLabel.textContent=date'));
});
