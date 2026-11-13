// 通知中心（手机版）：铃铛里不只有同组消息，计划、开发的关键动作也记成通知
// 通知记录写在共享仓库的 notification 表里，字段与同组通知保持一致，额外带 kind 区分来源
import { publishNotice } from './push.js';

export const NOTICE_KINDS = { plan: '计划', dev: '开发', group: '同组' };

function genId() {
  return 'notice_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

export function kindOf(notice) {
  if (notice && notice.kind && NOTICE_KINDS[notice.kind]) return notice.kind;
  return notice && notice.groupId ? 'group' : 'plan';
}

export function kindLabel(notice) {
  return NOTICE_KINDS[kindOf(notice)] || '通知';
}

// 记一条通知（计划 / 开发 / 同组都走这里）
export async function pushNotice(repo, { accountId, title, body = '', kind = 'plan', groupId = null }) {
  if (!repo || !accountId || !title) return null;
  const record = {
    id: genId(),
    kind,
    accountId,
    toAccountId: accountId,
    groupId: groupId || null,
    title: String(title),
    body: String(body == null ? '' : body),
    read: false,
    createdAt: Date.now(),
  };
  await repo.put('notification', record);
  // 同步推到手机通知栏（未授权时 publishNotice 自己会跳过）
  await publishNotice(record);
  return record;
}

// 当前账号的全部通知（同组通知也都在里面），按时间倒序
export async function listNotices(repo, accountId) {
  if (!repo || !accountId) return [];
  const rows = await repo.list(
    'notification',
    (n) => n.toAccountId === accountId || n.accountId === accountId,
  );
  return rows.slice().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

export async function unreadCount(repo, accountId) {
  const rows = await listNotices(repo, accountId);
  return rows.filter((n) => !n.read).length;
}

export async function markRead(repo, id) {
  const n = await repo.get('notification', id);
  if (!n) return false;
  await repo.put('notification', { ...n, read: true });
  return true;
}

export async function markAllRead(repo, accountId) {
  const rows = await listNotices(repo, accountId);
  let changed = 0;
  for (const n of rows) {
    if (n.read) continue;
    await repo.put('notification', { ...n, read: true });
    changed++;
  }
  return changed;
}

export function formatNoticeTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
