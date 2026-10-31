// AI生成
// 题库判分逻辑（纯函数，可在 Node 测试）

// 集合相等（忽略顺序与重复）
export function sameSet(a, b) {
  const A = Array.from(new Set(a.map((x) => String(x)))).sort();
  const B = Array.from(new Set(b.map((x) => String(x)))).sort();
  if (A.length !== B.length) return false;
  return A.every((x, i) => x === B[i]);
}

// 选择类判分（单选 / 多选 / 判断）。返回 1 或 0
export function gradeChoice(q, userAnswer) {
  if (q.type === 'multiple') {
    const a = Array.isArray(q.answer) ? q.answer : [q.answer];
    const u = Array.isArray(userAnswer) ? userAnswer : (userAnswer == null ? [] : [userAnswer]);
    return sameSet(a, u) ? 1 : 0;
  }
  const u = userAnswer == null ? '' : String(userAnswer);
  return u === String(q.answer) ? 1 : 0;
}

// 问答类判分：命中全部关键词即判对
export function gradeQa(q, text) {
  const kws = (Array.isArray(q.keywords) ? q.keywords : []).filter((k) => k && String(k).trim());
  const t = String(text || '');
  const hit = kws.filter((k) => t.includes(String(k)));
  const total = kws.length;
  const correct = total > 0 && hit.length === total;
  return { correct, hit: hit.length, total };
}

// 统一判分入口：返回 { correct, score, ... }
// 代码类不自动判分，返回 { correct: null, manual: true, score: 0 }
export function gradeQuestion(q, userAnswer) {
  const cat = q.categoryKey;
  if (cat === 'code') return { correct: null, manual: true, score: 0 };
  if (cat === 'qa') {
    const r = gradeQa(q, userAnswer);
    return { correct: r.correct, score: r.correct ? 1 : 0, hit: r.hit, total: r.total };
  }
  const c = gradeChoice(q, userAnswer);
  return { correct: c === 1, score: c };
}
// 从答题明细中挑出判错的题（correct === false）；正确题与人工批改题（correct === null）不计入
export function filterWrong(results) {
  return (Array.isArray(results) ? results : []).filter((r) => r && r.correct === false);
}

// 正确率：保留两位小数；total 为 0 时返回 0
export function accuracy(score, total) {
  const s = Number(score) || 0;
  const t = Number(total) || 0;
  return t > 0 ? Math.round((s / t) * 10000) / 10000 : 0;
}