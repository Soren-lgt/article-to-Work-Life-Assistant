// Q8 专项：登录后提供退出登录功能
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  logoutButtonVisible, buildLogoutRowHTML, accountButtonLabel, accountManagerBodyHTML,
} from "../js/app.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const appSrc = readFileSync(join(appDir, "js/app.js"), "utf8");

test("logoutButtonVisible：仅登录态（有当前账号 id）为真", () => {
  assert.equal(logoutButtonVisible(null), false);
  assert.equal(logoutButtonVisible(""), false);
  assert.equal(logoutButtonVisible("u1"), true);
});

test("buildLogoutRowHTML：未登录不渲染；登录态渲染退出按钮", () => {
  assert.equal(buildLogoutRowHTML(null), "");
  assert.equal(buildLogoutRowHTML(""), "");
  const h = buildLogoutRowHTML("u1");
  assert.ok(h.includes('data-act="logout"'));
  assert.ok(h.includes("退出登录"));
  assert.ok(h.includes("danger"));
});

test("退出（currentAccountId=null）后顶栏按钮回显为“登录”", () => {
  assert.equal(accountButtonLabel("", false), "登录");
});

test("账号管理弹窗含退出按钮容器", () => {
  assert.ok(accountManagerBodyHTML().includes('data-el="logout"'));
});

test("app.js 存在退出分支：清空 currentAccountId 并刷新", () => {
  assert.ok(appSrc.includes("act === 'logout'"));
  assert.ok(/currentAccountId:\s*null/.test(appSrc), "退出应把当前账号置空");
  assert.ok(appSrc.includes("refreshAccounts()"), "退出后应刷新顶栏");
});

test("退出按钮位于账号管理弹窗内（动态注入，当前账号才出现）", () => {
  const loggedIn = buildLogoutRowHTML("u1");
  const guest = buildLogoutRowHTML(null);
  assert.notEqual(loggedIn.indexOf("退出登录"), -1);
  assert.equal(guest.includes("退出登录"), false);
});