// R3-T5：所有弹窗统一为“邀请伙伴”同款 openModal 模态；原生 confirm/prompt 全部消除
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  confirmMessageHTML, promptFieldHTML, openConfirm, openPrompt,
} from "../js/ui/modal.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const read = (rel) => readFileSync(join(appDir, rel), "utf8");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fp = join(dir, name);
    const st = statSync(fp);
    if (st.isDirectory()) out.push(...walk(fp));
    else if (name.endsWith(".js")) out.push(fp);
  }
  return out;
}

test("confirmMessageHTML：原文被包裹且不改变文案", () => {
  const h = confirmMessageHTML("确定删除？");
  assert.ok(h.includes("确定删除？"));
});

test("promptFieldHTML：secret 为 true 输出密文，否则明文", () => {
  assert.ok(promptFieldHTML(true, "密码").includes('type="password"'));
  assert.ok(promptFieldHTML(false, "名称").includes('type="text"'));
});

test("openConfirm / openPrompt 为导出的便捷构造器", () => {
  assert.equal(typeof openConfirm, "function");
  assert.equal(typeof openPrompt, "function");
});

test("T5：全工程 js 源码不再使用原生 window.confirm / window.prompt", () => {
  const jsDir = join(appDir, "js");
  for (const fp of walk(jsDir)) {
    const src = read(fp.replace(appDir + "\\", "").replaceAll("\\", "/"));
    assert.ok(!src.includes("window.confirm"), `${fp} 仍含 window.confirm`);
    assert.ok(!src.includes("window.prompt"), `${fp} 仍含 window.prompt`);
  }
});

test("T5：账号/设置/同组模块改用 openModal 系列模态承载", () => {
  assert.ok(read("js/app.js").includes("openConfirm") && read("js/app.js").includes("openPrompt"));
  assert.ok(read("js/modules/settings.js").includes("openConfirm"));
  assert.ok(read("js/modules/group.js").includes("openModal"));
});