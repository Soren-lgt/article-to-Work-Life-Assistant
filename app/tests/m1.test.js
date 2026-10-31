// AI生成
// M1 测试：账号体系
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository } from '../js/lib/db.js';
import { Accounts, hashPassword } from '../js/lib/accounts.js';

function makeRepo() { return new Repository(new MemoryAdapter()); }

test('创建账号：空名报错', async () => {
  const r = makeRepo();
  await assert.rejects(() => Accounts.create(r, { name: '   ' }), /账号名不能为空/);
});

test('创建账号：生成 id 与 createdAt，无密码 hash 为空', async () => {
  const r = makeRepo();
  const a = await Accounts.create(r, { name: '我' });
  assert.ok(a.id);
  assert.equal(a.name, '我');
  assert.equal(a.passwordHash, '');
  assert.ok(a.createdAt > 0);
});

test('创建账号：带密码存 hash', async () => {
  const r = makeRepo();
  const a = await Accounts.create(r, { name: 'A', password: '1234' });
  assert.ok(a.passwordHash);
  assert.equal(a.passwordHash, await hashPassword('1234'));
});

test('改名：去空白并校验空名', async () => {
  const r = makeRepo();
  const a = await Accounts.create(r, { name: 'A' });
  const b = await Accounts.rename(r, a.id, '  B  ');
  assert.equal(b.name, 'B');
  await assert.rejects(() => Accounts.rename(r, a.id, ''), /不能为空/);
});

test('verify：无密码通过，有密码需匹配', async () => {
  const r = makeRepo();
  const a = await Accounts.create(r, { name: 'A' });
  assert.equal(await Accounts.verify(r, a.id, 'whatever'), true);
  const b = await Accounts.create(r, { name: 'B', password: 'secret' });
  assert.equal(await Accounts.verify(r, b.id, 'secret'), true);
  assert.equal(await Accounts.verify(r, b.id, 'wrong'), false);
});

test('setPassword 设置与清除', async () => {
  const r = makeRepo();
  const a = await Accounts.create(r, { name: 'A' });
  await Accounts.setPassword(r, a.id, 'p');
  let acc = await r.get('accounts', a.id);
  assert.ok(acc.passwordHash);
  await Accounts.setPassword(r, a.id, '');
  acc = await r.get('accounts', a.id);
  assert.equal(acc.passwordHash, '');
});

test('list 按创建时间排序；remove 生效', async () => {
  const r = makeRepo();
  await Accounts.create(r, { name: 'A' });
  await new Promise((res) => setTimeout(res, 2));
  await Accounts.create(r, { name: 'B' });
  const list = await Accounts.list(r);
  assert.deepEqual(list.map((x) => x.name), ['A', 'B']);
  await Accounts.remove(r, list[0].id);
  assert.equal((await Accounts.list(r)).length, 1);
});

test("remove 删除账号级联清理个人业务数据与小组关系", async () => {
  const r = makeRepo();
  const a = await Accounts.create(r, { name: "待删" });
  const keep = await Accounts.create(r, { name: "保留" });
  await r.put("memo", { accountId: a.id, text: "x", createdAt: 1 });
  await r.put("todoplan", { accountId: a.id, title: "y", date: "2026-10-31", done: false });
  await r.put("bank", { accountId: a.id, categoryKey: "qa", name: "b" });
  await r.put("groupMember", { groupId: "g1", accountId: a.id, role: "member" });
  await r.put("joinRequest", { groupId: "g1", accountId: a.id, status: "pending" });
  await Accounts.remove(r, a.id);
  assert.equal(await r.get("accounts", a.id), null);
  assert.equal((await r.all("memo")).length, 0);
  assert.equal((await r.all("todoplan")).length, 0);
  assert.equal((await r.all("bank")).length, 0);
  assert.equal((await r.all("groupMember")).length, 0);
  assert.equal((await r.all("joinRequest")).length, 0);
  assert.equal((await r.all("accounts")).length, 1);
  assert.equal((await Accounts.list(r))[0].id, keep.id);
});

test("remove 不存在账号返回 false", async () => {
  const r = makeRepo();
  assert.equal(await Accounts.remove(r, "nope"), false);
});