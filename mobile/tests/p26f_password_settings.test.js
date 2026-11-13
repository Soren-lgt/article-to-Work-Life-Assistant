// P26-f 修改密码收进「设置 → 数据与设置」；与顶栏菜单共用同一份实现
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { passwordChangeError, passwordChangeResetState, passwordChangeHTML } from '../js/password.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const mMain = read('mobile/js/main.js');
const dMenu = read('app/js/ui/accountmenu.js');

test('改密窗口：三框 + 标题 + 失败提示元素', () => {
  const html = passwordChangeHTML();
  assert.ok(html.includes('data-f="oldPwd"'));
  assert.ok(html.includes('data-f="newPwd"'));
  assert.ok(html.includes('data-f="confirmPwd"'));
  assert.ok(html.includes('data-el="pwdError"'));
  assert.ok(html.includes('data-act="changePwd"'));
  assert.ok(html.includes('修改'));
});

test('改密校验与电脑版同一套文案', () => {
  assert.equal(passwordChangeError(false, 'n1', 'n1'), '旧密码不正确');
  assert.equal(passwordChangeError(true, '   ', '   '), '新密码不能为空');
  assert.equal(passwordChangeError(true, 'n1', 'n2'), '两次输入的密码不一致');
  assert.equal(passwordChangeError(true, 'n1', 'n1'), '');
  assert.ok(dMenu.includes('旧密码不正确'));
  assert.ok(dMenu.includes('新密码不能为空'));
});

test('失败后三框清空（含旧密码框）', () => {
  assert.deepEqual(passwordChangeResetState(), { oldPwd: '', newPwd: '', confirmPwd: '' });
  const mPwd = read('mobile/js/password.js');
  assert.ok(mPwd.includes("bodyEl.querySelector('[data-f=\"oldPwd\"]').focus()"));
  assert.ok(mPwd.includes("fields.forEach"));
});

test('账号菜单第 6 项是修改密码，点它打开同一个改密窗口', () => {
  const mMenu = read('mobile/js/accountmenu.js');
  assert.ok(mMenu.includes("['pwd', '修改密码']"));
  assert.ok(mMain.includes("if (act === 'pwd') return openPasswordChange();"));
  assert.ok(mMain.includes("import { openPasswordChange as openPasswordChangeModal } from './password.js';"));
});

test('改密窗口：三框带框内提示 + 修改按钮', () => {
  const mPwd = read('mobile/js/password.js');
  assert.ok(mPwd.includes('placeholder="旧密码"'));
  assert.ok(mPwd.includes('placeholder="新密码"'));
  assert.ok(mPwd.includes('placeholder="确定密码"'));
  assert.ok(mPwd.includes('data-act="changePwd"'));
  assert.ok(mPwd.includes('>修改</button>'));
});

test('改密成功直接关窗并提示修改成功；失败三框恢复初始', () => {
  const mPwd = read('mobile/js/password.js');
  assert.ok(mPwd.includes('ctl.close();'));
  assert.ok(mPwd.includes("showToast('修改成功')"));
  assert.ok(mPwd.includes('resetFields();'));
  assert.ok(mPwd.includes('setError(err);'));
});

test('改密成功走轻提示，不用原生 alert', () => {
  const mPwd = read('mobile/js/password.js');
  assert.ok(!mPwd.includes('window.alert'));
  assert.ok(mPwd.includes("showToast('修改成功')"));
});
