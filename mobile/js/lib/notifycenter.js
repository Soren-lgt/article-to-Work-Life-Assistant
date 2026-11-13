// 通知中心（手机版）：铃铛里不只有同组消息，计划、开发的关键动作也记成通知
// 只提醒"还没做完的"：通知带 refType/refId，读取时按关联对象的当前状态过滤；
// 对象完成/删除后，相关通知由 pruneNotices 收掉，不再占未读数。
// 同一个待办只占一份角标：同一对象的多条通知在铃铛里合并成最新的一条。
import { publishNotice } from './push.js';

export const NOTICE_KINDS = { plan: '计划', dev: '开发', group: '同组' };
export const PENDING_TASK_STATUS = ['待开始', '进行中'];
export const PENDING_BUG_STATUS = ['待处理', '处理中'];

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

// 记一条通知（计划 / 开发 / 同组都走这里）。带 refType/refId 的，之后按对象状态判断还要不要提醒。
export async function pushNotice(repo, { accountId, title, body = '', kind = 'plan', groupId = null, refType = null, refId = null }) {
  if (!repo || !accountId || !title) return null;
  const record = {
    id: genId(),
    kind,
    accountId,
    toAccountId: accountId,
    groupId: groupId || null,
    refType: refType || null,
    refId: refId || null,
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

// 这条通知关联的对象是否"还没做完"：未完成的计划、待开始/进行中的任务、待处理/处理中的 Bug
export async function isPending(repo, notice) {
  const type = notice && notice.refType;
  const id = notice && notice.refId;
  if (!type || !id) return true; // 同组消息等没有关联对象，照常提醒
  if (type === 'plan') {
    const it = await repo.get('todoplan', id);
    return !!(it && !it.done);
  }
  if (type === 'task') {
    const it = await repo.get('devTask', id);
    return !!(it && PENDING_TASK_STATUS.indexOf(it.status) >= 0);
  }
  if (type === 'bug') {
    const it = await repo.get('devBug', id);
    return !!(it && PENDING_BUG_STATUS.indexOf(it.status) >= 0);
  }
  return true;
}

// 当前账号的通知，按时间倒序；默认只给"还要做的"（opts.onlyPending === false 可取全部历史）
// 同一对象的多条通知只留一条（优先未读、取最新），这样完成一件事角标只减一份。
export async function listNotices(repo, accountId, opts) {
  if (!repo || !accountId) return [];
  const options = opts || {};
  const rows = await repo.list(
    'notification',
    (n) => n.toAccountId === accountId || n.accountId === accountId,
  );
  const sorted = rows.slice().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  if (options.onlyPending === false) return sorted;

  const byRef = new Map();
  const plain = [];
  for (const n of sorted) {
    if (!(await isPending(repo, n))) continue; // 已经做完 / 已删除的，直接不显示
    const key = n.refType && n.refId ? n.refType + ':' + n.refId : null;
    if (!key) { plain.push(n); continue; }
    const cur = byRef.get(key);
    if (!cur || (cur.read && !n.read)) byRef.set(key, n); // 未读优先，其次取最新（sorted 已倒序）
  }
  return plain.concat(Array.from(byRef.values()))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
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

// 全部已读：把当前铃铛里看得到的那些（合并后的每一条）标为已读
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

// 对象完成或删除后，把它相关的通知收掉（标为已读，历史仍留档，但不再提醒）
export async function pruneNotices(repo, { refId, refType = null } = {}) {
  if (!repo || !refId) return 0;
  const rows = await repo.list(
    'notification',
    (n) => n.refId === refId && (!refType || n.refType === refType),
  );
  let changed = 0;
  for (const r of rows) {
    if (r.read) continue;
    await repo.put('notification', { ...r, read: true });
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
