// 备份导入的账号适配：备份里的数据属于导出时的那台设备账号，直接导入会挂在旧账号下、
// 当前登录账号看不到，所以导入前把账号字段统一归到当前登录账号，并跳过账号表（不动现有账号）
import { Backup } from '../../../app/js/lib/backup.js';

const ACCOUNT_FIELDS = [
  'accountId',
  'ownerAccountId',
  'assigneeAccountId',
  'createdBy',
  'handledBy',
  'actorAccountId',
  'toAccountId',
];

function looksLikeAccount(value) {
  return typeof value === 'string' && value !== '' && (value.startsWith('accounts') || value === '__IMPORT__');
}

function mapRow(row, accountId) {
  if (!row || typeof row !== 'object') return row;
  let changed = false;
  const out = { ...row };
  for (const field of ACCOUNT_FIELDS) {
    const value = out[field];
    if (value == null || looksLikeAccount(value)) {
      if (value !== accountId) {
        out[field] = accountId;
        changed = true;
      }
    }
  }
  return changed ? out : row;
}

// 同一个小组成员被并成同一个人后，组内保留一条成员记录（owner 优先）
function dedupeMembers(rows) {
  const seen = new Map();
  const out = [];
  for (const row of rows) {
    const key = String(row.groupId) + '|' + String(row.accountId);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, row);
      out.push(row);
      continue;
    }
    if (prev.role !== 'owner' && row.role === 'owner') {
      const i = out.indexOf(prev);
      out[i] = row;
      seen.set(key, row);
    }
  }
  return out;
}

// 返回适配后的备份对象（纯函数，不改入参）
export function adaptBackupForAccount(data, accountId) {
  if (!data || typeof data !== 'object' || !data.stores || typeof data.stores !== 'object') {
    throw new Error('备份数据格式无效');
  }
  if (!accountId) throw new Error('请先登录账号再加载数据');

  const stores = {};
  let skippedAccounts = 0;
  for (const name of Object.keys(data.stores)) {
    const rows = data.stores[name];
    if (rows == null) continue;
    if (!Array.isArray(rows)) throw new Error(`仓库 ${name} 的数据应为数组`);
    // 账号表不导入：保留当前设备的账号与登录态
    if (name === 'accounts') {
      skippedAccounts = rows.length;
      continue;
    }
    let next = rows.map((row) => mapRow(row, accountId));
    if (name === 'groupMember') next = dedupeMembers(next);
    stores[name] = next;
  }

  return {
    version: data.version == null ? 1 : data.version,
    exportedAt: data.exportedAt == null ? Date.now() : data.exportedAt,
    app: data.app || 'worklife-app',
    stores,
    skippedAccounts,
  };
}

// 解析文本 → 适配 → 写入仓库
export async function loadBackupForAccount(repo, text, { mode = 'merge', accountId = null } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是有效的 JSON 文件');
  }
  const adapted = adaptBackupForAccount(parsed, accountId);
  const res = await Backup.importAll(repo, adapted, { mode, accountId });
  return { ...res, skippedAccounts: adapted.skippedAccounts };
}
