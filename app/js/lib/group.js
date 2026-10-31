// AI生成
// 同组计划业务逻辑（小组 / 成员 / 入组 / 项目 / 任务状态机 / 日志 / 通知）
export const ROLES = { owner: '组长', deputy: '副组长', member: '成员' };
export const TASK_STATUS = { todo: '待办', review: '待审核', done: '已完成' };

function nowTs() { return Date.now(); }

export async function roleOf(repo, groupId, accountId) {
  const rows = await repo.list('groupMember', (m) => m.groupId === groupId && m.accountId === accountId);
  return rows[0] ? rows[0].role : null;
}

function assertRole(role, allowed, msg) {
  if (!role) throw new Error('你不在该小组中');
  if (!allowed.includes(role)) throw new Error(msg);
}

async function writeLog(repo, groupId, actorAccountId, action, detail) {
  return repo.put('opLog', { groupId, actorAccountId, action, detail, createdAt: nowTs() });
}

// 向组内指定角色成员发通知
async function notifyRoles(repo, groupId, roles, title, body, excludeAccountId) {
  const members = await repo.list('groupMember', (m) => m.groupId === groupId && roles.includes(m.role));
  for (const m of members) {
    if (m.accountId === excludeAccountId) continue;
    await repo.put('notification', { groupId, toAccountId: m.accountId, title, body, read: false, createdAt: nowTs() });
  }
}

export const Group = {
  ROLES,
  async create(repo, name, ownerAccountId) {
    const n = String(name || '').trim();
    if (!n) throw new Error('小组名称不能为空');
    const g = await repo.put('group', { name: n, ownerAccountId, createdAt: nowTs() });
    await repo.put('groupMember', { groupId: g.id, accountId: ownerAccountId, role: 'owner', joinedAt: nowTs() });
    await writeLog(repo, g.id, ownerAccountId, 'group.create', `创建小组「${n}」`);
    return g;
  },

  async listForAccount(repo, accountId) {
    const ms = await repo.list('groupMember', (m) => m.accountId === accountId);
    const groups = [];
    for (const m of ms) {
      const g = await repo.get('group', m.groupId);
      if (g) groups.push({ ...g, role: m.role });
    }
    return groups.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  get(repo, groupId) { return repo.get('group', groupId); },

  roleOf,

  listMembers(repo, groupId) {
    return repo.list('groupMember', (m) => m.groupId === groupId).then((rs) => rs.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)));
  },

  deputies(repo, groupId) { return repo.list('groupMember', (m) => m.groupId === groupId && m.role === 'deputy'); },

  async transferOwner(repo, groupId, actorAccountId, targetAccountId) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner'], '只有组长可以转让小组');
    const target = (await repo.list('groupMember', (m) => m.groupId === groupId && m.accountId === targetAccountId))[0];
    if (!target) throw new Error('目标成员不存在');
    await repo.put('groupMember', { ...target, role: 'owner' });
    const actor = (await repo.list('groupMember', (m) => m.groupId === groupId && m.accountId === actorAccountId))[0];
    if (actor) await repo.put('groupMember', { ...actor, role: 'member' });
    const g = await repo.get('group', groupId);
    await repo.put('group', { ...g, ownerAccountId: targetAccountId });
    await writeLog(repo, groupId, actorAccountId, 'group.transfer', `转让组长给 ${targetAccountId}`);
  },

  async setDeputy(repo, groupId, actorAccountId, targetAccountId) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner'], '只有组长可以设置副组长');
    const deps = await this.deputies(repo, groupId);
    if (deps.length >= 2) throw new Error('副组长最多 2 名');
    const target = (await repo.list('groupMember', (m) => m.groupId === groupId && m.accountId === targetAccountId))[0];
    if (!target) throw new Error('目标成员不存在');
    if (target.role === 'owner') throw new Error('组长无需设为副组长');
    await repo.put('groupMember', { ...target, role: 'deputy' });
    await writeLog(repo, groupId, actorAccountId, 'member.setDeputy', `设为副组长 ${targetAccountId}`);
    await repo.put('notification', { groupId, toAccountId: targetAccountId, title: '你已被设为副组长', body: '现在拥有与组长相同的权限', read: false, createdAt: nowTs() });
  },

  async removeDeputy(repo, groupId, actorAccountId, targetAccountId) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner'], '只有组长可以撤销副组长');
    const target = (await repo.list('groupMember', (m) => m.groupId === groupId && m.accountId === targetAccountId))[0];
    if (!target || target.role !== 'deputy') throw new Error('目标不是副组长');
    await repo.put('groupMember', { ...target, role: 'member' });
    await writeLog(repo, groupId, actorAccountId, 'member.removeDeputy', `撤销副组长 ${targetAccountId}`);
  },

  async removeMember(repo, groupId, actorAccountId, targetAccountId) {
    const role = await roleOf(repo, groupId, actorAccountId);
    assertRole(role, ['owner', 'deputy'], '只有组长或副组长可以移除成员');
    const target = (await repo.list('groupMember', (m) => m.groupId === groupId && m.accountId === targetAccountId))[0];
    if (!target) throw new Error('目标成员不存在');
    if (target.role === 'owner') throw new Error('不能移除组长');
    if (role === 'deputy' && target.role === 'deputy') throw new Error('副组长不能移除其他副组长');
    await repo.remove('groupMember', target.id);
    await writeLog(repo, groupId, actorAccountId, 'member.remove', `移除成员 ${targetAccountId}`);
  },

  async deleteGroup(repo, groupId, actorAccountId) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner'], '只有组长可以删除小组');
    await repo.removeWhere('groupMember', (m) => m.groupId === groupId);
    await repo.removeWhere('project', (p) => p.groupId === groupId);
    const tasks = await repo.list('task', (t) => t.groupId === groupId);
    for (const t of tasks) await repo.removeWhere('attachment', (a) => a.taskId === t.id);
    await repo.removeWhere('task', (t) => t.groupId === groupId);
    await repo.removeWhere('joinRequest', (j) => j.groupId === groupId);
    await repo.removeWhere('notification', (n) => n.groupId === groupId);
    await repo.removeWhere('opLog', (l) => l.groupId === groupId);
    await repo.remove('group', groupId);
    return true;
  },

  // ---------- 入组 ----------
  async invite(repo, groupId, actorAccountId, { accountId, name } = {}) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '只有组长或副组长可以邀请成员');
    if (!accountId) throw new Error('请选择要邀请的账号');
    if (await roleOf(repo, groupId, accountId)) throw new Error('该账号已在小组中');
    await repo.put('groupMember', { groupId, accountId, role: 'member', joinedAt: nowTs(), name: name || '' });
    await writeLog(repo, groupId, actorAccountId, 'member.invite', `邀请成员 ${accountId}`);
    await repo.put('notification', { groupId, toAccountId: accountId, title: '你已被邀请加入小组', body: '你已成为小组成员', read: false, createdAt: nowTs() });
  },

  async requestJoin(repo, groupId, { accountId, name, type = 'link' } = {}) {
    if (!accountId) throw new Error('缺少申请账号');
    if (await roleOf(repo, groupId, accountId)) throw new Error('该账号已在小组中');
    const req = await repo.put('joinRequest', { groupId, accountId, name: name || '', type, status: 'pending', createdAt: nowTs(), handledBy: null });
    await notifyRoles(repo, groupId, ['owner', 'deputy'], '有新的入组申请', `${name || accountId} 申请加入小组`);
    return req;
  },

  listJoinRequests(repo, groupId, status = 'pending') {
    return repo.list('joinRequest', (j) => j.groupId === groupId && (!status || j.status === status))
      .then((rs) => rs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  },

  async handleJoinRequest(repo, groupId, actorAccountId, requestId, approve) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '只有组长或副组长可以审核入组申请');
    const req = await repo.get('joinRequest', requestId);
    if (!req || req.groupId !== groupId) throw new Error('申请不存在');
    if (req.status !== 'pending') throw new Error('该申请已处理');
    await repo.put('joinRequest', { ...req, status: approve ? 'approved' : 'rejected', handledBy: actorAccountId, handledAt: nowTs() });
    if (approve) await repo.put('groupMember', { groupId, accountId: req.accountId, role: 'member', joinedAt: nowTs(), name: req.name });
    await writeLog(repo, groupId, actorAccountId, approve ? 'join.approve' : 'join.reject', `${approve ? '通过' : '拒绝'}入组申请 ${req.accountId}`);
    await repo.put('notification', { groupId, toAccountId: req.accountId, title: approve ? '入组申请已通过' : '入组申请被拒绝', body: '', read: false, createdAt: nowTs() });
  },

  // ---------- 日志 / 通知 ----------
  listLogs(repo, groupId) {
    return repo.list('opLog', (l) => l.groupId === groupId).then((rs) => rs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  },

  listNotifications(repo, groupId, accountId) {
    return repo.list('notification', (n) => n.groupId === groupId && n.toAccountId === accountId)
      .then((rs) => rs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  },

  async markNotificationRead(repo, id) {
    const n = await repo.get('notification', id);
    if (n) await repo.put('notification', { ...n, read: true });
  },
};

export const Task = {
  TASK_STATUS,

  async addProject(repo, groupId, actorAccountId, { name, deadline = null } = {}) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '只有组长或副组长可以创建项目');
    const n = String(name || '').trim();
    if (!n) throw new Error('项目名称不能为空');
    const p = await repo.put('project', { groupId, name: n, deadline, createdBy: actorAccountId, createdAt: nowTs() });
    await writeLog(repo, groupId, actorAccountId, 'project.create', `创建项目「${n}」`);
    return p;
  },

  listProjects(repo, groupId) {
    return repo.list('project', (p) => p.groupId === groupId).then((rs) => rs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  },

  async removeProject(repo, groupId, actorAccountId, projectId) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '只有组长或副组长可以删除项目');
    const tasks = await repo.list('task', (t) => t.groupId === groupId && t.projectId === projectId);
    for (const t of tasks) await repo.removeWhere('attachment', (a) => a.taskId === t.id);
    await repo.removeWhere('task', (t) => t.groupId === groupId && t.projectId === projectId);
    await repo.remove('project', projectId);
    await writeLog(repo, groupId, actorAccountId, 'project.remove', `删除项目 ${projectId}`);
  },

  async addTask(repo, groupId, actorAccountId, { projectId, title, desc = '', assigneeAccountId = null } = {}) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '只有组长或副组长可以分配任务');
    const t = String(title || '').trim();
    if (!t) throw new Error('任务标题不能为空');
    const task = await repo.put('task', {
      groupId, projectId: projectId || null, title: t, desc: String(desc || ''),
      assigneeAccountId: assigneeAccountId || null, status: 'todo', createdBy: actorAccountId, createdAt: nowTs(), updatedAt: nowTs(),
    });
    await writeLog(repo, groupId, actorAccountId, 'task.create', `创建任务「${t}」`);
    if (assigneeAccountId) {
      await repo.put('notification', { groupId, toAccountId: assigneeAccountId, title: '有任务分配给你', body: t, read: false, createdAt: nowTs() });
    }
    return task;
  },

  listTasks(repo, groupId, projectId = null) {
    return repo.list('task', (t) => t.groupId === groupId && (!projectId || t.projectId === projectId))
      .then((rs) => rs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  },

  async uploadAttachment(repo, taskId, actorAccountId, { name, content = '' } = {}) {
    const task = await repo.get('task', taskId);
    if (!task) throw new Error('任务不存在');
    const role = await roleOf(repo, task.groupId, actorAccountId);
    if (!role) throw new Error('你不在该小组中');
    const n = String(name || '').trim();
    if (!n) throw new Error('附件名称不能为空');
    const att = await repo.put('attachment', { taskId, groupId: task.groupId, name: n, content: String(content || ''), uploadedBy: actorAccountId, createdAt: nowTs() });
    if (task.status === 'todo') {
      await repo.put('task', { ...task, status: 'review', updatedAt: nowTs() });
      await writeLog(repo, task.groupId, actorAccountId, 'task.submit', `提交任务「${task.title}」待审核`);
      await notifyRoles(repo, task.groupId, ['owner', 'deputy'], '有任务进入待审核', task.title, actorAccountId);
    }
    return att;
  },

  listAttachments(repo, taskId) {
    return repo.list('attachment', (a) => a.taskId === taskId).then((rs) => rs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  },

  // 通用状态变更入口（成员本人不可改）
  async setTaskStatus(repo, groupId, actorAccountId, taskId, status) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '成员不能修改任务状态');
    const task = await repo.get('task', taskId);
    if (!task || task.groupId !== groupId) throw new Error('任务不存在');
    if (!Object.prototype.hasOwnProperty.call(TASK_STATUS, status)) throw new Error('非法任务状态');
    await repo.put('task', { ...task, status, updatedAt: nowTs() });
    await writeLog(repo, groupId, actorAccountId, 'task.status', `任务「${task.title}」→ ${TASK_STATUS[status]}`);
    if (task.assigneeAccountId && task.assigneeAccountId !== actorAccountId) {
      await repo.put('notification', { groupId, toAccountId: task.assigneeAccountId, title: `任务状态更新：${TASK_STATUS[status]}`, body: task.title, read: false, createdAt: nowTs() });
    }
    return { ...task, status };
  },

  confirmTask(repo, groupId, actorAccountId, taskId) { return this.setTaskStatus(repo, groupId, actorAccountId, taskId, 'done'); },
  rejectTask(repo, groupId, actorAccountId, taskId) { return this.setTaskStatus(repo, groupId, actorAccountId, taskId, 'todo'); },

  async removeTask(repo, groupId, actorAccountId, taskId) {
    assertRole(await roleOf(repo, groupId, actorAccountId), ['owner', 'deputy'], '只有组长或副组长可以删除任务');
    await repo.removeWhere('attachment', (a) => a.taskId === taskId);
    await repo.remove('task', taskId);
    await writeLog(repo, groupId, actorAccountId, 'task.remove', `删除任务 ${taskId}`);
  },
};
// ---------- 加入码（方案 A 纯前端：组长复制加入码 → 他人粘贴申请加入）----------
// 生成小组加入码
export function buildJoinCode(groupId) {
  if (!groupId) return '';
  return 'WL-' + groupId;
}

// 解析加入码，非法格式返回 null
export function parseJoinCode(code) {
  const m = /^WL-([\s\S]+)$/.exec(String(code || '').trim());
  return m ? m[1].trim() : null;
}