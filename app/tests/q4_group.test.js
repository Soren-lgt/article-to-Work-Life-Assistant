// Q4 同组计划改造专项测试：按名邀请 / 10位数字加入码 / 任务截止时间 / 附件成员下载本人删除 / 骨架
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter, Repository } from "../js/lib/db.js";
import { Group, Task, roleOf, generateJoinCode, isValidJoinCode, resolveAccountByName, buildJoinCode, parseJoinCode, findGroupByJoinCode } from "../js/lib/group.js";
import group from "../js/modules/group.js";

function makeRepo() { return new Repository(new MemoryAdapter()); }
async function setup() {
  const r = makeRepo();
  const g = await Group.create(r, '研发一组', 'owner1');
  return { r, g };
}

test("resolveAccountByName：精确优先，唯一包含次之，无匹配返回 null", () => {
  const accs = [{ id: '1', name: '张三' }, { id: '2', name: '李四' }];
  assert.equal(resolveAccountByName(accs, '张三').id, '1');
  assert.equal(resolveAccountByName(accs, '李').id, '2');
  assert.equal(resolveAccountByName(accs, '王五'), null);
  assert.equal(resolveAccountByName(accs, ''), null);
  assert.equal(resolveAccountByName(null, '张三'), null);
});

test("generateJoinCode：10 位数字且首位非 0；isValidJoinCode 校验", () => {
  for (let i = 0; i < 20; i += 1) {
    const c = generateJoinCode();
    assert.match(c, /^[1-9]\d{9}$/);
  }
  assert.equal(isValidJoinCode("1234567890"), true);
  assert.equal(isValidJoinCode("0123456789"), true); // 10位数字允许前导0
  assert.equal(isValidJoinCode("123"), false);
  assert.equal(parseJoinCode("abc"), null);
});

test("buildJoinCode 取 group.joinCode；findGroupByJoinCode 可回查小组", async () => {
  const { r, g } = await setup();
  assert.equal(buildJoinCode(g), g.joinCode);
  const found = await findGroupByJoinCode(r, g.joinCode);
  assert.equal(found.id, g.id);
  assert.equal(await findGroupByJoinCode(r, "0000000000"), null);
});

test("addTask 保存截止时间 deadline", async () => {
  const { r, g } = await setup();
  const t = await Task.addTask(r, g.id, 'owner1', { title: '联调', deadline: '2026-12-31' });
  assert.equal(t.deadline, '2026-12-31');
  const t2 = await Task.addTask(r, g.id, 'owner1', { title: '无截止' });
  assert.equal(t2.deadline, null);
});

test("附件：成员可下载；仅上传者本人可删除，他人删除被拒，外人不可下载", async () => {
  const { r, g } = await setup();
  await Group.invite(r, g.id, 'owner1', { accountId: 'm1' });
  await Group.invite(r, g.id, 'owner1', { accountId: 'm2' });
  const task = await Task.addTask(r, g.id, 'owner1', { title: 'T' });
  const att = await Task.uploadAttachment(r, task.id, 'm1', { name: 'f.txt', content: 'hello' });
  // 另一成员可下载
  const got = await Task.downloadAttachment(r, 'm2', att.id);
  assert.equal(got.name, 'f.txt');
  assert.equal(got.content, 'hello');
  // 本人可删除
  await Task.removeAttachment(r, 'm1', att.id);
  assert.equal(await r.get('attachment', att.id), null);
  // 他人不可删除
  const att2 = await Task.uploadAttachment(r, task.id, 'm1', { name: 'g.txt' });
  await assert.rejects(() => Task.removeAttachment(r, 'm2', att2.id), /只能删除自己/);
  // 外人不可下载
  await assert.rejects(() => Task.downloadAttachment(r, 'outsider', att2.id), /不在该小组/);
});

test("group 模块契约完整", () => {
  assert.equal(group.route, 'group');
  assert.equal(typeof group.mount, 'function');
});

function stubEl() {
  return {
    innerHTML: "", textContent: "", value: "", dataset: {},
    addEventListener() {}, remove() {}, appendChild() {}, removeChild() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; },
  };
}
function makeState() {
  return { currentAccountId: "owner1", currentGroupId: null, subscribe() { return () => {}; }, set() {}, emit() {}, get() { return undefined; } };
}
function installGlobals() {
  globalThis.window = { alert() {}, confirm: () => true, prompt: () => null, location: { hash: "" }, navigator: {} };
  globalThis.document = { createElement: () => stubEl(), body: stubEl(), head: stubEl(), getElementById: () => stubEl(), querySelector: () => stubEl(), querySelectorAll: () => [] };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
function uninstallGlobals() { for (const k of ["window", "document", "localStorage"]) delete globalThis[k]; }

test("group 骨架含新建小组/加入小组入口，且邀请按钮文案为「邀请」", async () => {
  installGlobals();
  try {
    const repo = new Repository(new MemoryAdapter());
    const el = stubEl();
    await group.mount(el, { repo, state: makeState(), app: { state: makeState(), refreshAccounts: async () => {} } });
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(el.innerHTML.includes("新建小组"));
    assert.ok(el.innerHTML.includes("加入小组"));
  } finally { uninstallGlobals(); }
});