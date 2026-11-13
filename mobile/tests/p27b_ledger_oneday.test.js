// P27-b：新增消费建的卡片只属于当天，之后不再出现；历史无日期自建卡按创建日归档
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { legacyCardDate, migrateLegacyCards } from '../js/lib/ledgerday.js';
import { cardsVisibleOn, isCardVisibleOn } from '../../app/js/lib/ledger.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const view = readFileSync(join(root, 'mobile/js/views/ledger.js'), 'utf8');

function memoryRepo(rows) {
  return {
    rows,
    async list(name, pred) { return rows.filter((r) => !pred || pred(r)); },
    async put(name, row) {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0) rows[i] = row; else rows.push(row);
      return row;
    },
  };
}

test('新增消费创建卡片时带上当天日期', () => {
  assert.ok(view.includes('Ledger.addCard(repo,accId,name,{date})'));
  assert.ok(!view.includes('Ledger.addCard(repo,accId,name);'));
});

test('带日期的卡片只在当天可见，其他日期不再出现', () => {
  const card = { id: 'c1', name: '奶茶', preset: false, date: '2026-11-13' };
  assert.equal(isCardVisibleOn(card, '2026-11-13'), true);
  assert.equal(isCardVisibleOn(card, '2026-11-14'), false);
  const nextDay = cardsVisibleOn([card, { id: 'p1', name: '早餐', preset: true }], '2026-11-14');
  assert.deepEqual(nextDay.map((c) => c.id), ['p1']);
});

test('legacyCardDate 用本地时区推导创建日', () => {
  const t = new Date(2026, 10, 12, 9, 30).getTime();
  assert.equal(legacyCardDate(t), '2026-11-12');
  const lateNight = new Date(2026, 10, 12, 23, 59).getTime();
  assert.equal(legacyCardDate(lateNight), '2026-11-12');
  assert.match(legacyCardDate(undefined), /^\d{4}-\d{2}-\d{2}$/);
});

test('migrateLegacyCards 只给老自建卡补日期，初始卡片和有日期的卡不动', async () => {
  const rows = [
    { id: 'a', accountId: 'acc', name: '早餐', preset: true, createdAt: new Date(2026, 10, 1).getTime() },
    { id: 'b', accountId: 'acc', name: '旧自建', preset: false, createdAt: new Date(2026, 10, 10).getTime() },
    { id: 'c', accountId: 'acc', name: '当天卡', preset: false, date: '2026-11-13', createdAt: new Date(2026, 10, 13).getTime() },
    { id: 'd', accountId: 'other', name: '别人的卡', preset: false, createdAt: new Date(2026, 10, 9).getTime() },
  ];
  const repo = memoryRepo(rows);
  const fixed = await migrateLegacyCards(repo, 'acc');
  assert.equal(fixed, 1);
  assert.equal(rows.find((r) => r.id === 'a').date, undefined);
  assert.equal(rows.find((r) => r.id === 'b').date, '2026-11-10');
  assert.equal(rows.find((r) => r.id === 'c').date, '2026-11-13');
  assert.equal(rows.find((r) => r.id === 'd').date, undefined);
  // 幂等：再跑一次不再改动
  assert.equal(await migrateLegacyCards(repo, 'acc'), 0);
  // 归档后，旧卡只在创建当天可见
  assert.equal(isCardVisibleOn(rows.find((r) => r.id === 'b'), '2026-11-10'), true);
  assert.equal(isCardVisibleOn(rows.find((r) => r.id === 'b'), '2026-11-13'), false);
});
