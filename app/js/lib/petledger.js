// AI生成
// 小宠物的话 → 记账动作（依赖 Ledger 数据层，可在 Node 测试）
// 规则：当天已有对应卡片就只写金额；没有就新建一张「当天卡片」再写金额（与 P9-2 当天卡规则一致）

import { Ledger, cardsVisibleOn } from './ledger.js';
import { todayStr } from './utils.js';

// 在当天可见卡片里按名字找：先精确、再互相包含（「中饭」录音成「中餐」也能对上）
export function matchCard(cards, category) {
  const name = String(category == null ? '' : category).trim();
  if (!name) return null;
  const list = cards || [];
  const exact = list.find((c) => c.name === name);
  if (exact) return exact;
  const byIncludes = list.find((c) => c.name.includes(name) || name.includes(c.name));
  return byIncludes || null;
}

// 执行一条记账意图；返回卡片、记录与是否新建/替换
export async function applyExpense(repo, accountId, intent) {
  if (!accountId) throw new Error('请先登录账号');
  if (!intent || intent.type !== 'expense') throw new Error('不是记账指令');
  const amount = Number(intent.amount);
  if (!Number.isFinite(amount)) throw new Error('没听清金额');
  const date = intent.date || todayStr();

  await Ledger.ensureDefaultCards(repo, accountId);
  const visible = cardsVisibleOn(await Ledger.listCards(repo, accountId), date);
  let card = matchCard(visible, intent.category);
  let created = false;

  if (!card) {
    // 当天没有这张卡：新建一张当天卡片（第二天不再出现）
    card = await Ledger.addCard(repo, accountId, intent.category, { date });
    created = true;
  }

  const before = await repo.list(
    'ledgerRecord',
    (r) => r.accountId === accountId && r.cardId === card.id && r.date === date,
  );
  const record = await Ledger.addRecord(repo, accountId, {
    cardId: card.id, amount, note: intent.note || '', date,
  });

  return {
    card,
    created,
    replaced: before.length > 0,
    record,
    date,
    amount,
  };
}

// 读某天的汇总（给「今天花了多少」这类提问用）
export async function readDay(repo, accountId, date) {
  const d = date || todayStr();
  const items = await Ledger.dayByCard(repo, accountId, d);
  const total = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const count = items.reduce((s, it) => s + (Number(it.count) || 0), 0);
  return { date: d, items, total, count };
}
