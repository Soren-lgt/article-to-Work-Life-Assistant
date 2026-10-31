// AI生成
// 通用工具函数（纯函数，可在浏览器与 Node 测试中使用）

let _seq = 0;

// 生成唯一 ID
export function genId(prefix = 'id') {
  _seq = (_seq + 1) % 1000000;
  return prefix + '_' + Date.now().toString(36) + '_' + _seq.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 本地日期字符串 YYYY-MM-DD
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 本地月份字符串 YYYY-MM
export function monthStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// 从 YYYY-MM-DD 取月份前缀
export function monthOf(dateString) {
  return String(dateString).slice(0, 7);
}

// 金额格式化：数字 -> 保留两位小数字符串；空 -> ''
export function formatAmount(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}