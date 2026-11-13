// P27-c：通用设置里「记账初始卡片管理」标题后直接放「新增初始卡片」按钮，新建的卡每天出现
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCardVisibleOn } from '../../app/js/lib/ledger.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');

test('「记账初始卡片管理」标题行右侧就是「新增初始卡片」按钮', () => {
  const head = src.indexOf('记账初始卡片管理');
  const btn = src.indexOf('data-act="addInitCard"');
  assert.ok(head > 0 && btn > head);
  // 两者处在同一个 row between 容器内，中间不隔其它字段
  const seg = src.slice(head, btn);
  assert.ok(!seg.includes('data-el="ledgerCards"'), '按钮必须在列表之前');
  assert.ok(seg.includes('<button class="btn sm"'));
});

test('按钮点击后调用 addInitialCard（preset 卡，非当天卡）', () => {
  const i = src.indexOf('addInitBtn.onclick');
  const block = src.slice(i, i + 1400);
  assert.ok(block.includes('addInitBtn.onclick'));
  assert.ok(block.includes('Ledger.addInitialCard(App.repo, accId, name)'));
  assert.ok(block.includes("showToast('请先登录账号')"));
});

test('列表底部不再重复放新增按钮，空态也能新增', () => {
  assert.ok(!src.includes('box.appendChild(addBtn)'));
  assert.ok(!src.includes("addBtn.textContent = '新增初始卡片'"));
  const head = src.indexOf('记账初始卡片管理');
  const emptyIdx = src.indexOf('暂无初始卡片');
  assert.ok(head > 0 && emptyIdx > head);
});

test('初始卡片每一天都可见（preset 与日期无关）', () => {
  const card = { id: 'x', name: '交通', preset: true };
  assert.equal(isCardVisibleOn(card, '2026-11-13'), true);
  assert.equal(isCardVisibleOn(card, '2026-12-31'), true);
  assert.equal(isCardVisibleOn(card, '2027-01-01'), true);
});
