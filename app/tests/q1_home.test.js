// Q1 首页改造专项测试：模块契约 + 整卡点击排除控件的判定纯函数
import { test } from "node:test";
import assert from "node:assert/strict";
import home, { isNavControl } from "../js/modules/home.js";

test("home 模块契约：route/title/mount 齐全", () => {
  assert.equal(home.route, "home");
  assert.equal(typeof home.title, "string");
  assert.equal(typeof home.mount, "function");
});

test("isNavControl：内部交互控件（任务栏）命中排除，不触发整卡跳转", () => {
  for (const tag of ["INPUT", "BUTTON", "A", "SELECT", "TEXTAREA", "LABEL"]) {
    assert.equal(isNavControl({ tagName: tag }), true, `${tag} 应被排除`);
  }
});

test("isNavControl：普通文本容器不排除，可正常整卡跳转", () => {
  assert.equal(isNavControl({ tagName: "DIV" }), false);
  assert.equal(isNavControl({ tagName: "SPAN" }), false);
  assert.equal(isNavControl(null), false);
  assert.equal(isNavControl(undefined), false);
});

test("isNavControl：元素嵌套在控件内时（closest 命中）判定为排除", () => {
  const spanInsideButton = { tagName: "SPAN", closest: (sel) => sel.includes("button") };
  assert.equal(isNavControl(spanInsideButton), true);
  const plainSpan = { tagName: "SPAN", closest: () => null };
  assert.equal(isNavControl(plainSpan), false);
});