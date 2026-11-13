// 记账的月度 / 年度时间计算与汇总（纯函数，便于测试）
function pad(n){ return String(n).padStart(2,'0'); }
function round2(v){ return Math.round((Number(v) || 0) * 100) / 100; }

// '2026-11' 前后移动若干个月（跨年自动进位）
export function shiftMonth(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, m - 1 + Number(delta || 0), 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// '2026' 前后移动若干年
export function shiftYear(year, delta) {
  return String(Number(year) + Number(delta || 0));
}

// 某一年的 12 个月份键（带补零）
export function monthRange(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}

// 把 12 个月的月汇总压成年度汇总：按月列一行，按卡合并全年金额
export function summarizeYear(list) {
  const perCard = new Map();
  let count = 0;
  let total = 0;
  const months = [];
  for (const item of list || []) {
    const c = Number(item && item.count) || 0;
    const t = Number(item && item.total) || 0;
    count += c;
    total += t;
    months.push({ month: item.month, count: c, total: round2(t) });
    for (const card of (item && item.perCard) || []) {
      const cur = perCard.get(card.cardId) || { cardId: card.cardId, name: card.name, count: 0, total: 0 };
      cur.count += Number(card.count) || 0;
      cur.total += Number(card.total) || 0;
      perCard.set(card.cardId, cur);
    }
  }
  const cards = [...perCard.values()].map((c) => ({ ...c, total: round2(c.total) }));
  return { months, perCard: cards, count, total: round2(total) };
}
