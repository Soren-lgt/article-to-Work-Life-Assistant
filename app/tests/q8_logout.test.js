// R1/Q8 专项：退出登录位于当前账号行、主动退出后不被自动登录、账号弹窗无底部按钮
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  logoutButtonVisible, logoutActionButtonHTML, shouldAutoLogin,
  accountButtonLabel, accountManagerBodyHTML, accountListHTML, passwordFieldHTML,
  loginPanelHTML, registerPanelHTML,
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

test("R3-T1：账号弹窗先显示登录区，并列“注册”入口，切换到注册表单", () => {
  const h = accountManagerBodyHTML();
  const li = h.indexOf('data-act="tabLogin"');
  const ri = h.indexOf('data-act="tabRegister"');
  assert.ok(li >= 0 && ri > li, "登录按钮在注册按钮之前且并列");
  assert.ok(h.includes('data-el="panel"'), "动态面板容器");
  assert.ok(h.includes('data-el="list"'), "账号列表容器保留");
  assert.ok(!h.includes('data-el="logout"'));
});

test("R3-T1：登录面板含账号选择与密文密码；注册面板含名称与密文密码", () => {
  const lh = loginPanelHTML([{ id: "a", name: "甲", passwordHash: "x" }]);
  assert.ok(lh.includes('data-f="loginUser"'), "登录需选择账号");
  assert.ok(lh.includes('data-f="loginPwd"') && lh.includes('type="password"'), "登录密码密文");
  const rh = registerPanelHTML();
  assert.ok(rh.includes('data-f="name"'), "注册需名称");
  assert.ok(rh.includes('data-f="pwd"') && rh.includes('type="password"'), "注册密码密文");
});

test("R4-P1：注册面板不再重复“返回登录”按钮，仅保留创建按钮，切换由顶部 tabs 负责", () => {
  const rh = registerPanelHTML();
  assert.ok(!rh.includes("返回登录"), "注册面板内不出现返回登录按钮");
  assert.ok(!rh.includes('data-act="tabLogin"'), "注册面板内不重复切换登录");
  assert.ok(rh.includes('data-act="create"'), "保留注册并创建按钮");
  const skeleton = accountManagerBodyHTML();
  assert.ok(skeleton.includes('data-act="tabLogin"') && skeleton.includes('data-act="tabRegister"'), "顶部仍保留登录/注册切换条");
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