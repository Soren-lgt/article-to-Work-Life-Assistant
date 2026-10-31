// AI生成
// 开发工作业务逻辑：开发任务 / Bug 记录 / 代码片段（可在 Node 测试）

export const TASK_STATUS = ['待开始', '进行中', '已完成'];
export const BUG_STATUS = ['待处理', '处理中', '已修复', '已关闭'];

export const DevWork = {
  // ---------- 开发任务 ----------
  async addTask(repo, accountId, { title, projectName = '未分组', status = '待开始', note = '' } = {}) {
    const t = String(title || '').trim();
    if (!t) throw new Error('任务标题不能为空');
    if (!TASK_STATUS.includes(status)) status = '待开始';
    return repo.put('devTask', {
      accountId, title: t, projectName: String(projectName || '未分组').trim() || '未分组', status, note, createdAt: Date.now(),
    });
  },

  async listTasks(repo, accountId) {
    const rows = await repo.list('devTask', (r) => r.accountId === accountId);
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  // 按项目分组返回 [{ projectName, tasks }]
  async groupTasksByProject(repo, accountId) {
    const rows = await this.listTasks(repo, accountId);
    const map = new Map();
    for (const t of rows) {
      if (!map.has(t.projectName)) map.set(t.projectName, []);
      map.get(t.projectName).push(t);
    }
    return Array.from(map.entries()).map(([projectName, tasks]) => ({ projectName, tasks }));
  },

  async setTaskStatus(repo, id, status) {
    if (!TASK_STATUS.includes(status)) throw new Error('非法任务状态');
    const it = await repo.get('devTask', id);
    if (!it) throw new Error('任务不存在');
    it.status = status;
    return repo.put('devTask', it);
  },

  async updateTask(repo, id, patch) {
    const it = await repo.get('devTask', id);
    if (!it) throw new Error('任务不存在');
    if (patch.title !== undefined) {
      const t = String(patch.title || '').trim();
      if (!t) throw new Error('任务标题不能为空');
      patch.title = t;
    }
    if (patch.projectName !== undefined) patch.projectName = String(patch.projectName).trim() || '未分组';
    if (patch.status !== undefined && !TASK_STATUS.includes(patch.status)) delete patch.status;
    Object.assign(it, patch);
    return repo.put('devTask', it);
  },

  async removeTask(repo, id) { return repo.remove('devTask', id); },

  // ---------- Bug 记录 ----------
  async addBug(repo, accountId, { title, symptom = '', status = '待处理', note = '' } = {}) {
    const t = String(title || '').trim();
    if (!t) throw new Error('Bug 标题不能为空');
    if (!BUG_STATUS.includes(status)) status = '待处理';
    return repo.put('devBug', { accountId, title: t, symptom, status, note, createdAt: Date.now() });
  },

  async listBugs(repo, accountId) {
    const rows = await repo.list('devBug', (r) => r.accountId === accountId);
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async setBugStatus(repo, id, status) {
    if (!BUG_STATUS.includes(status)) throw new Error('非法 Bug 状态');
    const it = await repo.get('devBug', id);
    if (!it) throw new Error('Bug 不存在');
    it.status = status;
    return repo.put('devBug', it);
  },

  async updateBug(repo, id, patch) {
    const it = await repo.get('devBug', id);
    if (!it) throw new Error('Bug 不存在');
    if (patch.title !== undefined) {
      const t = String(patch.title || '').trim();
      if (!t) throw new Error('Bug 标题不能为空');
      patch.title = t;
    }
    if (patch.status !== undefined && !BUG_STATUS.includes(patch.status)) delete patch.status;
    Object.assign(it, patch);
    return repo.put('devBug', it);
  },

  async removeBug(repo, id) { return repo.remove('devBug', id); },

  // ---------- 代码片段 ----------
  async addSnippet(repo, accountId, { title, lang = '', code = '', desc = '' } = {}) {
    const t = String(title || '').trim();
    if (!t) throw new Error('片段标题不能为空');
    return repo.put('devSnippet', {
      accountId, title: t, lang, code: String(code || ''), desc, createdAt: Date.now(),
    });
  },

  async listSnippets(repo, accountId) {
    const rows = await repo.list('devSnippet', (r) => r.accountId === accountId);
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async updateSnippet(repo, id, patch) {
    const it = await repo.get('devSnippet', id);
    if (!it) throw new Error('片段不存在');
    Object.assign(it, patch);
    return repo.put('devSnippet', it);
  },

  async removeSnippet(repo, id) { return repo.remove('devSnippet', id); },
};