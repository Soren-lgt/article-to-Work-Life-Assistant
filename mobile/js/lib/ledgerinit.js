// 记账卡片的初始化闸门：清空数据后多个视图会同时补建默认卡片，容易建出两套
// 这里按账号串行化初始化，并把已经重复的同名初始卡片合并成一张
import { Ledger } from '../../../app/js/lib/ledger.js';

const chains = new Map();

// 串行执行：同一账号同一时刻只跑一次初始化，后来的排队等前一次结束再检查
export function ensureCardsReady(repo, accountId) {
  if (!accountId) return Promise.resolve({ merged: 0 });
  const prev = chains.get(accountId) || Promise.resolve();
  const next = prev.then(() => prepare(repo, accountId), () => prepare(repo, accountId));
  chains.set(accountId, next.then(() => undefined, () => undefined));
  return next;
}

async function prepare(repo, accountId) {
  await Ledger.ensureDefaultCards(repo, accountId);
  return { merged: await dedupePresetCards(repo, accountId) };
}

function createdAtOf(c) {
  const t = Number(c && c.createdAt);
  return Number.isFinite(t) ? t : 0;
}

// 同名且都是初始卡片（preset）的重复项：保留最早创建的一张
// 其余卡上的记账记录并到保留卡：同一天已有记录就把金额相加，没有就把 cardId 改过来
export async function dedupePresetCards(repo, accountId) {
  if (!accountId) return 0;
  const cards = await repo.list('ledgerCategory', (r) => r.accountId === accountId);
  const groups = new Map();
  for (const c of cards) {
    if (c.preset !== true) continue;
    const key = String(c.name == null ? '' : c.name).trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let changed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => createdAtOf(a) - createdAtOf(b) || String(a.id).localeCompare(String(b.id)));
    const keep = list[0];
    for (const dup of list.slice(1)) {
      const rows = await repo.list('ledgerRecord', (r) => r.cardId === dup.id);
      for (const row of rows) {
        const same = await repo.list(
          'ledgerRecord',
          (r) => r.cardId === keep.id && r.date === row.date,
        );
        if (same.length) {
          const target = same[0];
          const amount = (Number(target.amount) || 0) + (Number(row.amount) || 0);
          const note = [target.note, row.note].filter((s) => s != null && s !== '').join(' / ');
          await repo.put('ledgerRecord', { ...target, amount, note });
          await repo.remove('ledgerRecord', row.id);
        } else {
          await repo.put('ledgerRecord', { ...row, cardId: keep.id });
        }
        changed++;
      }
      await repo.remove('ledgerCategory', dup.id);
      changed++;
    }
  }
  return changed;
}
