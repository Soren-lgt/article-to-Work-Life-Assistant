// D2 回归测试：同组计划顶部小组按钮的“(组长)”颜色与小组名一致（继承按钮文字色，不再变灰）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, '..');
const group = readFileSync(join(mobileDir, 'js/views/group.js'), 'utf8');
const css = readFileSync(join(mobileDir, 'css/mobile.css'), 'utf8');

test('D2：顶部小组切换按钮的角色标注使用 role-inline（与组名同色）', () => {
  const topBtn = group.match(/data-g="\$\{g\.id\}">.*<\/button>/)[0];
  assert.ok(topBtn.includes('class="role-inline"'), '顶部按钮角色标注应为 role-inline');
  assert.ok(!topBtn.includes('class="muted"'), '顶部按钮角色标注不得再使用 muted 灰色');
});

test('D2：role-inline 规则继承按钮颜色与字号（不单独变灰/缩小）', () => {
  assert.ok(css.includes('.role-inline{ color:inherit; font-size:inherit; }'), '应声明 color/font-size 均继承');
});

test('D2：组长/副组长/成员三种角色文案仍完整渲染', () => {
  for (const label of ['组长', '副组长', '成员']) assert.ok(group.includes(label), '缺少角色文案 ' + label);
});

test('D2：成员列表页角色标注本次不改动（范围精确，仅顶部切换按钮变同色）', () => {
  assert.ok(group.includes('class="muted">${Group.ROLES[m.role]}'), '成员页角色标注应保持原 muted 样式');
});
