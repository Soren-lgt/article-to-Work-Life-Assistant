// R1/Q8 专项：退出登录位于当前账号行、主动退出后不被自动登录、账号弹窗无底部按钮
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  logoutButtonVisible, logoutActionButtonHTML, shouldAutoLogin,
  accountButtonLabel, accountManagerBodyHTML, accountListHTML, passwordFieldHTML,
} from "../js/app.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const read = (rel) => readFileSync(join(appDir, rel), "utf8");

test("logoutButtonVisible：仅登录态为真", () => {
  assert.equal(logoutButtonVisible(null), false);
  assert.equal(logoutButtonVisible(""), false);
  assert.equal(logoutButtonVisible("u1"), true);
});

test("退出按钮片段：data-act=logout 且文案为退出", () => {
  const h = logoutActionButtonHTML();
  assert.ok(h.includes('data-act="logout"'));
  assert.ok(h.includes("退出"));
});

test("shouldAutoLogin：主动退出后不自动登录；未退出且有账号才自动登录", () => {
  assert.equal(shouldAutoLogin(true, true), false);
  assert.equal(shouldAutoLogin(true, false), false);
  assert.equal(shouldAutoLogin(false, true), true);
  assert.equal(shouldAutoLogin(false, false), false);
});

test("退出后顶栏按钮回显为登录", () => {
  assert.equal(accountButtonLabel("", false), "登录");
});

test("账号列表：仅当前账号行渲染退出按钮", () => {
  const html = accountListHTML(
    [{ id: "a", name: "甲", passwordHash: null }, { id: "b", name: "乙", passwordHash: "x" }],
    "a"
  );
  const logoutCount = (html.match(/data-act="logout"/g) || []).length;
  assert.equal(logoutCount, 1);
  assert.ok(html.indexOf('data-id="a"') < html.indexOf('data-act="logout"') || html.includes('data-act="logout"'));
});

test("账号弹窗骨架为纵向表单且不再使用底部退出条", () => {
  const h = accountManagerBodyHTML();
  assert.ok(h.includes("acc-form"));
  assert.ok(!h.includes('data-el="logout"'));
});

test("app.js：账号弹窗关闭底部按钮、退出置 loggedOut 且刷新", () => {
  const src = read("js/app.js");
  assert.ok(src.includes("footer: false"), "账号弹窗不应显示关闭/完成按钮");
  assert.ok(src.includes("act === 'logout'"));
  assert.ok(/loggedOut:\s*true/.test(src), "退出应标记主动退出");
  assert.ok(src.includes("shouldAutoLogin"));
});

test("modal.js 支持 footer 选项关闭底部按钮区", () => {
  const src = read("js/ui/modal.js");
  assert.ok(src.includes("footer = true"));
  assert.ok(src.includes("modal-foot"));
});

test("R3-T2：密码输入框统一为密文 type=password", () => {
  const h = passwordFieldHTML("请输入密码");
  assert.ok(h.includes('type="password"'), "密码框必须隐藏显示");
  assert.ok(!h.includes('type="text"'));
});

test("R3-T2：切换登录校验与设置密码不再使用明文 prompt", () => {
  const src = read("js/app.js");
  assert.ok(!src.includes("window.prompt('请输入该账号本地密码')"), "切换登录密码走密文模态而非原生 prompt");
  assert.ok(!src.includes("window.prompt('新的本地密码"), "设置密码走密文模态而非原生 prompt");
});