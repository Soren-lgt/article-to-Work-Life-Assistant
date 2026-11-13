// P28：清空数据后记账页出现两套「早餐/中餐/晚餐」——初始化串行化 + 重复初始卡片合并
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupePresetCards, ensureCardsReady } from '../js/lib/ledgerinit.js';
import { Ledger } from '../../app/js/lib/ledger.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const view = readFileSync(join(root, 'mobile/js/views/ledger.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');

// 内存仓库：与 db.js 的 repository 行为一致——没有 id 时自动生成，再用 id 覆盖写
function memoryRepo(rows) {
  let seq = 0;
  return {
    rows,
    async list(store, pred) { return rows.filter((r) => (!pred || pred(r))); },
    async put(store, row) {
      const rec = row.id == null ? { ...row, id: 'gen' + (++seq) } : { ...row };
      const i = rows.findIndex((r) => r.id === rec.id);
      if (i >= 0) rows[i] = rec; else rows.push(rec);
      return rec;
    },
    async remove(store, id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
      return true;
    },
  };
}

function card(id, name, preset, createdAt) {
  return { id, accountId: 'acc', name, preset, sort: 1, createdAt };
}

test('重复的同名初始卡片合并成一张，保留最早创建的', async () => {
  const repo = memoryRepo([
    card('a1', '早餐', true, 1000),
    card('a2', '早餐', true, 2000),
    card('b1', '中餐', true, 1500),
    card('b2', '中餐', true, 1600),
    card('c1', '奶茶', false, 3000),
  ]);
  const changed = await dedupePresetCards(repo, 'acc');
  assert.equal(changed, 2);
  const cards = repo.rows.filter((r) => r.accountId === 'acc' && r.preset === true).map((r) => r.name + '#' + r.id);
  assert.deepEqual(cards.sort(), ['中餐#b1', '早餐#a1'].sort());
  // 非初始卡片（当天卡）不受影响
  assert.ok(repo.rows.some((r) => r.id === 'c1'));
});

test('重复卡上的记录并到保留卡：同日金额相加，异日改挂', async () => {
  const repo = memoryRepo([
    card('a1', '早餐', true, 1000),
    card('a2', '早餐', true, 2000),
    { id: 'r1', accountId: 'acc', cardId: 'a1', amount: 10, note: '', date: '2026-11-13', createdAt: 1 },
    { id: 'r2', accountId: 'acc', cardId: 'a2', amount: 5, note: '加蛋', date: '2026-11-13', createdAt: 2 },
    { id: 'r3', accountId: 'acc', cardId: 'a2', amount: 8, note: '', date: '2026-11-12', createdAt: 3 },
  ]);
  await dedupePresetCards(repo, 'acc');
  const same = repo.rows.filter((r) => r.cardId === 'a1' && r.date === '2026-11-13');
  assert.equal(same.length, 1);
  assert.equal(same[0].amount, 15);
  assert.equal(same[0].note, '加蛋');
  const other = repo.rows.filter((r) => r.date === '2026-11-12');
  assert.equal(other.length, 1);
  assert.equal(other[0].cardId, 'a1');
  assert.ok(!repo.rows.some((r) => r.id === 'a2'));
});

test('没有重复时不改动，重复调用幂等', async () => {
  const repo = memoryRepo([card('a1', '早餐', true, 1000), card('b1', '中餐', true, 1200)]);
  assert.equal(await dedupePresetCards(repo, 'acc'), 0);
  assert.equal(await dedupePresetCards(repo, 'acc'), 0);
  assert.equal(repo.rows.length, 2);
});

test('并发初始化同一账号也只建一套默认卡片（清空后不会出现两组）', async () => {
  const repo = memoryRepo([]);
  await Promise.all([
    ensureCardsReady(repo, 'acc'),
    ensureCardsReady(repo, 'acc'),
    ensureCardsReady(repo, 'acc'),
  ]);
  const cards = await Ledger.listCards(repo, 'acc');
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((c) => c.name), ['早餐', '中餐', '晚餐']);
  // 再跑一次仍是一套
  await ensureCardsReady(repo, 'acc');
  assert.equal((await Ledger.listCards(repo, 'acc')).length, 3);
});

test('已经存在两套默认卡片时，初始化会自动合并成一套', async () => {
  const repo = memoryRepo([
    card('a1', '早餐', true, 1000), card('a2', '早餐', true, 1100),
    card('b1', '中餐', true, 1200), card('b2', '中餐', true, 1300),
    card('c1', '晚餐', true, 1400), card('c2', '晚餐', true, 1500),
  ]);
  await ensureCardsReady(repo, 'acc');
  const cards = await Ledger.listCards(repo, 'acc');
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((c) => c.name), ['早餐', '中餐', '晚餐']);
});

test('记账页和通用设置都走串行闸门，不再直接 ensureDefaultCards', () => {
  assert.ok(view.includes('ensureCardsReady(repo,accId)'));
  assert.ok(!view.includes('Ledger.ensureDefaultCards(repo,accId)'));
  assert.ok(mainSrc.includes('ensureCardsReady(App.repo, accId)'));
  assert.ok(!mainSrc.includes('await Ledger.ensureDefaultCards(App.repo, accId);'));
});
