// P30-a：点日期文字可以自己挑一天（前一天 / 后一天 / 今天 之外的任意日期）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/js/views/ledger.js'), 'utf8');

test('日期文字带 pickdate 动作，可以点击', () => {
  assert.ok(src.includes('data-el="dateLabel" data-act="pickdate"'));
  assert.ok(src.includes("else if(act==='pickdate'){ openPickDate(); }"));
});

test('点日期打开「选择日期」弹窗，里面是原生日期输入', () => {
  assert.ok(src.includes("openModal({title:'选择日期'"));
  const seg = src.slice(src.indexOf("openModal({title:'选择日期'"), src.indexOf("function openNewCard"));
  assert.ok(seg.includes('type="date"'));
  assert.ok(seg.includes('value="${date}"'), '应带出当前日期作为默认值');
});

test('选定日期后跳到那一天，并把视图切回按天查看', () => {
  assert.ok(src.includes('date=v; month=v.slice(0,7); view=\'day\'; await render();'));
});

test('非法日期不跳转，给出提示', () => {
  assert.ok(src.includes('/^\\d{4}-\\d{2}-\\d{2}$/'));
  assert.ok(src.includes("window.alert('请选择有效日期')"));
});

test('选择日期弹窗的确认按钮文案是「确认」', () => {
  const seg = src.slice(src.indexOf("openModal({title:'选择日期'"), src.indexOf('function openNewCard'));
  assert.ok(seg.includes("submitText:'确认'"));
  assert.ok(!seg.includes('跳到该日'));
});

test('未登录时点日期先要求登录，不弹选择框', () => {
  const seg = src.slice(src.indexOf('function openPickDate'), src.indexOf('function openNewCard'));
  assert.ok(seg.includes("if(!accId){ window.alert('请先登录账号'); return; }"));
});
