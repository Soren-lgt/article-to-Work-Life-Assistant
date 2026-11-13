// P32-a：今日计划的日期可以自己点着改（不再只能前后翻一天）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/js/views/today.js'), 'utf8');

test('中间的日期本身能点，点了打开日期选择', () => {
  assert.ok(src.includes('data-el="dateLabel" data-act="pickdate"'), '日期标签挂上 pickdate');
  assert.ok(src.includes("if(act==='pickdate'){ openPickDate(); }"), '点击有对应处理');
  assert.ok(src.includes('function openPickDate()'), '有日期选择弹窗');
});

test('日期选择用原生日期框，确认后跳到那一天', () => {
  assert.ok(src.includes('type="date"'), '原生日期框');
  assert.ok(src.includes('请选择有效日期'));
  assert.ok(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/.test(src), '校验 YYYY-MM-DD 格式');
  assert.ok(src.includes('date=v; month=v.slice(0,7); await refresh();'), '跳转后日期和月份一起对');
});

test('不会把点日期误当成前后翻页', () => {
  const pick = src.indexOf("if(act==='pickdate')");
  const prev = src.indexOf("else if(act==='prev')");
  const next = src.indexOf("else if(act==='next')");
  assert.ok(pick > -1 && prev > pick && next > prev, 'pickdate 单独一支，前后翻页仍各自独立');
  assert.ok(src.includes("else if(act==='prev'){") && src.includes("else if(act==='next'){"));
});

test('月度概览里点日期也是选月份（不会把月度跳成某一天）', () => {
  assert.ok(src.includes("if(view==='month'){ month=v.slice(0,7); await refresh(); return false; }"), '月度态只改月份');
  assert.ok(src.includes("view==='month'?month+'-01':date"), '默认值按当前状态给');
});
