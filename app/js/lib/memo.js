// AI生成
// 快速备忘业务逻辑（可在 Node 测试）
export const Memo = {
  async add(repo, accountId, text) {
    const t = String(text || '').trim();
    if (!t) throw new Error('备忘内容不能为空');
    return repo.put('memo', { accountId, text: t, createdAt: Date.now() });
  },

  async list(repo, accountId, limit = 5) {
    const rows = await repo.list('memo', (r) => r.accountId === accountId);
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return limit ? rows.slice(0, limit) : rows;
  },

  async remove(repo, id) {
    return repo.remove('memo', id);
  },
};