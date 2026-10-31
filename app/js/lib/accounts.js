// AI生成
// 账号体系业务逻辑（可在浏览器与 Node 测试）

// 本地密码哈希：优先用 WebCrypto SHA-256，环境不支持时退化为简单哈希（仅本地弱校验）
export async function hashPassword(pwd) {
  if (!pwd) return '';
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wl:' + pwd));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* fallthrough */ }
  let h = 0;
  const s = 'wl:' + pwd;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'weak_' + h.toString(16);
}

export const Accounts = {
  async list(repo) {
    const rows = await repo.all('accounts');
    return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async create(repo, { name, password = '' } = {}) {
    const n = String(name || '').trim();
    if (!n) throw new Error('账号名不能为空');
    const passwordHash = await hashPassword(password);
    return repo.put('accounts', { name: n, passwordHash, createdAt: Date.now() });
  },

  async rename(repo, id, name) {
    const n = String(name || '').trim();
    if (!n) throw new Error('账号名不能为空');
    const acc = await repo.get('accounts', id);
    if (!acc) throw new Error('账号不存在');
    acc.name = n;
    return repo.put('accounts', acc);
  },

  async setPassword(repo, id, password) {
    const acc = await repo.get('accounts', id);
    if (!acc) throw new Error('账号不存在');
    acc.passwordHash = await hashPassword(password);
    return repo.put('accounts', acc);
  },

  // 个人业务数据仓库（均以 accountId 隔离），删除账号时一并清理，避免孤儿数据
  PERSONAL_STORES: [
    'memo', 'todoplan', 'ledgerCategory', 'ledgerRecord',
    'devTask', 'devBug', 'devSnippet', 'bank', 'question', 'attempt',
  ],

  async remove(repo, id) {
    const acc = await repo.get('accounts', id);
    if (!acc) return false;
    await repo.remove('accounts', id);
    for (const store of this.PERSONAL_STORES) {
      await repo.removeWhere(store, (r) => r.accountId === id);
    }
    // 退出所在小组：移除成员关系与本人提交的入组申请
    await repo.removeWhere('groupMember', (m) => m.accountId === id);
    await repo.removeWhere('joinRequest', (j) => j.accountId === id);
    return true;
  },

  async verify(repo, id, password) {
    const acc = await repo.get('accounts', id);
    if (!acc) return false;
    if (!acc.passwordHash) return true;
    return (await hashPassword(password)) === acc.passwordHash;
  },
};