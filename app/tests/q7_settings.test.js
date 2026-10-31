// Q7 专项：账号管理收进顶栏登录弹窗、设置页移除账号卡片
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { Accounts } from "../js/lib/accounts.js";
import {
  accountButtonLabel, accountManagerBodyHTML, accountListHTML,
} from "../js/app.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const read = (rel) => readFileSync(join(appDir, rel), "utf8");

test("accountButtonLabel：未登录=登录，已登录=账号名", () => {
  assert.equal(accountButtonLabel("", false), "登录");
  assert.equal(accountButtonLabel("", true), "登录");
  assert.equal(accountButtonLabel("张三", false), "登录");
  assert.equal(accountButtonLabel("张三", true), "张三");
});

test("账号管理弹窗骨架：登录/注册切换 + 动态面板 + 列表容器", () => {
  const h = accountManagerBodyHTML();
  assert.ok(h.includes('data-act="tabLogin"'), "登录切换入口");
  assert.ok(h.includes('data-act="tabRegister"'), "注册切换入口");
  assert.ok(h.includes('data-el="panel"'), "动态表单面板");
  assert.ok(h.includes('data-el="list"'), "账号列表容器保留");
});

test("账号列表：当前账号不显示登录按钮且带[当前]，其余账号含登录/改名/设密/删除", () => {
  const html = accountListHTML(
    [{ id: "a", name: "甲", passwordHash: null }, { id: "b", name: "乙", passwordHash: "x" }],
    "a"
  );
  assert.ok(html.includes("[当前]"));
  assert.ok(html.includes('data-act="switch" data-id="b"'));
  assert.ok(!html.includes('data-id="a" data-act="switch"'));
  assert.ok((html.match(/data-act="rename"/g) || []).length === 2);
  assert.ok((html.match(/data-act="pwd"/g) || []).length === 2);
  assert.ok((html.match(/data-act="del"/g) || []).length === 2);
});

test("空账号列表给出空状态提示", () => {
  assert.ok(accountListHTML([], null).includes("还没有账号"));
});

test("设置页源码已移除账号（本机多账号）卡片与账号创建/改名/删除逻辑", () => {
  const src = read("js/modules/settings.js");
  assert.ok(!src.includes("账号（本机多账号）"), "不应再有账号卡片标题");
  assert.ok(!src.includes("Accounts.create"), "设置页不应直接创建账号");
  assert.ok(!src.includes("Accounts.remove"), "设置页不应直接删除账号");
});

test("顶栏改为账号按钮，不再使用账号下拉 select", () => {
  const html = read("index.html");
  assert.ok(html.includes('id="accountBtn"'), "应有账号按钮");
  assert.ok(!html.includes("accountSwitch"), "不应再保留账号下拉");
  const appSrc = read("js/app.js");
  assert.ok(appSrc.includes("openModal"), "账号管理应使用可靠弹窗");
  assert.ok(!appSrc.includes("accountSwitch"), "app.js 不应再操作旧下拉");
});

test("账号库链路：创建/改名/设密/删除级联", async () => {
  const r = new Repository(new MemoryAdapter());
  const a = await Accounts.create(r, { name: "丙", password: "pw" });
  assert.ok(a.passwordHash);
  await Accounts.rename(r, a.id, "丙改");
  assert.equal((await r.get("accounts", a.id)).name, "丙改");
  await Accounts.setPassword(r, a.id, "");
  assert.equal((await r.get("accounts", a.id)).passwordHash, "");
  await Accounts.remove(r, a.id);
  assert.equal(await r.get("accounts", a.id), null);
});

test("verify：有密码需正确密码；无密码直接通过", async () => {
  const r = new Repository(new MemoryAdapter());
  const a = await Accounts.create(r, { name: "d", password: "secret" });
  assert.equal(await Accounts.verify(r, a.id, "secret"), true);
  assert.equal(await Accounts.verify(r, a.id, "wrong"), false);
  const b = await Accounts.create(r, { name: "e" });
  assert.equal(await Accounts.verify(r, b.id, ""), true);
});