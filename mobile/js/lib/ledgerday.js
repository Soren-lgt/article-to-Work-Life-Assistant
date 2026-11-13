// 记账卡片的可见日期：新增消费建的卡只属于那一天，初始卡片每天可见
// （共享库 app/js/lib/ledger.js 已有 cardsVisibleOn，这里补手机端需要的创建日推导与老数据迁移）
import { todayStr } from '../../../app/js/lib/utils.js';

function pad2(n) { return String(n).padStart(2, '0'); }

// 由卡片创建时间推导它属于哪一天（本地时区）
export function legacyCardDate(createdAt) {
  const t = Number(createdAt);
  if (!Number.isFinite(t) || t <= 0) return todayStr();
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 老数据里「新增消费」建的卡没有 date（于是每天都出现）；按创建日补上，只保留那一天
export async function migrateLegacyCards(repo, accountId) {
  if (!accountId) return 0;
  const cards = await repo.list('ledgerCategory', (r) => r.accountId === accountId);
  let fixed = 0;
  for (const c of cards) {
    if (c.preset === true || c.date) continue;
    await repo.put('ledgerCategory', { ...c, date: legacyCardDate(c.createdAt) });
    fixed++;
  }
  return fixed;
}
