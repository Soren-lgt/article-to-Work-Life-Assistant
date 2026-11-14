// AI生成
// P5：顶栏账号下拉菜单。登录后点击账号名展开列表，承接原「数据与设置」的全部能力：
// 主题设置 / 导出数据 / 加载数据 / 清空数据 / 退出登录 / 修改密码 / 更改名字
import { Accounts } from '../lib/accounts.js';
import { Backup } from '../lib/backup.js';
import { Ledger } from '../lib/ledger.js';
import { loadPrefs, savePrefs, applyTheme, ROUTE_OPTIONS } from '../lib/prefs.js';
import { normalizeTheme, THEME_OPTIONS } from '../lib/theme.js';
import { passwordFieldHTML } from '../lib/accountview.js';
import { openModal, openConfirm, openPrompt, confirmMessageHTML } from './modal.js';
import { showToast } from './toast.js';

// 菜单项顺序固定（用户指定）：主题设置、导出数据、加载数据、清空数据、退出登录、修改密码、更改名字
export const MENU_ITEMS = [
  ['theme', '主题设置'],
  ['export', '导出数据'],
  ['import', '加载数据'],
  ['clear', '清空数据'],
  ['logout', '退出登录'],
  ['pwd', '修改密码'],
  ['rename', '更改名字'],
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 纯函数：下拉菜单骨架（顶部当前账号名 + 固定顺序的菜单项）
export function accountMenuHTML(name = '') {
  const items = MENU_ITEMS
    .map(([act, label]) => `<button type="button" class="acc-menu-item" role="menuitem" data-act="${act}">${label}</button>`)
    .join('');
  return `<div class="acc-menu-head">${escapeHtml(name)}</div>${items}`;
}

// 纯函数：修改密码窗口——三个密文框（提示文字写在框内 placeholder）+ 修改按钮
export function passwordChangeHTML() {
  return `
    <div class="acc-form">
      ${passwordFieldHTML('旧密码', 'oldPwd')}
      ${passwordFieldHTML('新密码', 'newPwd')}
      ${passwordFieldHTML('确定密码', 'confirmPwd')}
      <div class="acc-error" data-el="pwdError" role="alert" aria-live="polite" hidden></div>
      <div class="acc-form-actions">
        <button type="button" class="btn primary" data-act="changePwd">修改</button>
      </div>
    </div>`;
}

// 纯函数：修改密码校验——旧密码错误 / 新密码为空 / 两次不一致，返回空串代表通过
export function passwordChangeError(oldOk, next, confirm) {
  if (!oldOk) return '旧密码不正确';
  if (!String(next == null ? '' : next).trim()) return '新密码不能为空';
  if (next !== confirm) return '两次输入的密码不一致';
  return '';
}

// 纯函数：失败后密码框恢复的初始状态（三个框清空）
export function passwordResetState() {
  return { oldPwd: '', newPwd: '', confirmPwd: '' };
}

let openMenuEl = null;
let openMenuAnchor = null;
let docCloseHandler = null;

export function closeAccountMenu() {
  if (openMenuEl && openMenuEl.parentNode) openMenuEl.parentNode.removeChild(openMenuEl);
  openMenuEl = null;
  openMenuAnchor = null;
  if (docCloseHandler) {
    document.removeEventListener('mousedown', docCloseHandler);
    docCloseHandler = null;
  }
}

// 登录后点账号名：展开/收起下拉菜单（未登录时由 app.js 走登录弹窗）
export function openAccountMenu({ repo, app, anchor } = {}) {
  if (typeof document === 'undefined' || !anchor) return null;
  if (openMenuEl && openMenuAnchor === anchor) { closeAccountMenu(); return null; }
  closeAccountMenu();

  const accId = app.state.currentAccountId;
  const acc = (app.accounts || []).find((a) => a.id === accId);
  const el = document.createElement('div');
  el.className = 'acc-menu';
  el.dataset.el = 'accMenu';
  el.setAttribute('role', 'menu');
  el.innerHTML = accountMenuHTML(acc ? acc.name : '');
  document.body.appendChild(el);

  const rect = anchor.getBoundingClientRect();
  el.style.top = Math.round(rect.bottom + 6) + 'px';
  el.style.right = Math.max(8, Math.round(window.innerWidth - rect.right)) + 'px';

  el.addEventListener('click', async (e) => {
    const act = e.target && e.target.dataset ? e.target.dataset.act : null;
    if (!act) return;
    closeAccountMenu();
    try {
      await handleMenuAction(act, { repo, app, accountId: accId });
    } catch (err) {
      showToast('操作失败：' + (err && err.message ? err.message : err));
    }
  });

  docCloseHandler = (e) => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closeAccountMenu();
  };
  setTimeout(() => {
    if (docCloseHandler) document.addEventListener('mousedown', docCloseHandler);
  }, 0);

  openMenuEl = el;
  openMenuAnchor = anchor;
  return el;
}

export async function handleMenuAction(act, ctx = {}) {
  const { repo, app, accountId } = ctx;
  if (act === 'theme') return openThemeSettings({ repo, app });
  if (act === 'export') return exportData(repo);
  if (act === 'import') return openLoadData({ repo, app });
  if (act === 'clear') return openClearData({ repo, app });
  if (act === 'logout') return logout(app);
  if (act === 'pwd') return openPasswordChange({ repo, app, accountId });
  if (act === 'rename') return openRename({ repo, app, accountId });
  return null;
}

// 导出数据：整库导出为 JSON 文件并下载
export async function exportData(repo) {
  const dump = await Backup.exportAll(repo);
  const text = JSON.stringify(dump, null, 2);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const filename = `worklife-backup-${stamp}.json`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('已导出数据');
  return { filename, text };
}

// 加载数据：选择备份文件后，再选「合并加载 / 覆盖加载」
export function openLoadData({ repo, app }) {
  const accountId = app && app.state ? app.state.currentAccountId : null;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.dataset.el = 'importFile';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let text;
    try { text = await file.text(); } catch { showToast('读取文件失败'); return; }
    const ctl = openModal({
      title: '加载数据',
      footer: false,
      bodyHTML: confirmMessageHTML('「覆盖加载」会先清空现有数据再写入；「合并加载」保留现有数据。') +
        '<div class="row" style="gap:8px;justify-content:flex-end;margin-top:12px">' +
        '<button type="button" class="btn" data-act="merge">合并加载</button>' +
        '<button type="button" class="btn primary" data-act="replace">覆盖加载</button></div>',
    });
    ctl.overlay.addEventListener('click', async (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act !== 'merge' && act !== 'replace') return;
      ctl.close();
      try {
        const res = await Backup.importFromText(repo, text, { mode: act === 'replace' ? 'replace' : 'merge', accountId });
        await app.refreshAccounts();
        if (typeof app.refreshViews === 'function') app.refreshViews();
        showToast(`已加载数据，共 ${res.imported} 条记录`);
      } catch (err) { showToast('加载失败：' + err.message); }
    });
  });

  input.click();
}

// 清空数据：清空全部业务数据，账号保留（删除账号不在本菜单范围内）
export function openClearData({ repo, app }) {
  return openConfirm({
    title: '清空数据',
    confirmText: '清空',
    message: '将清空今日计划、每日记账、开发工作、题库、同组计划的全部数据，账号保留。此操作不可撤销。',
    onConfirm: async () => {
      await Backup.clearBusinessData(repo);
      await app.refreshAccounts();
      if (typeof app.refreshViews === 'function') app.refreshViews();
      showToast('已清空数据');
    },
  });
}

export async function logout(app) {
  app.state.set({ currentAccountId: null, loggedOut: true });
  await app.refreshAccounts();
  showToast('已退出登录');
}

// 修改密码窗口：旧密码 / 新密码 / 确定密码（placeholder 写在框内），下方「修改」
export function openPasswordChange({ repo, app, accountId }) {
  const ctl = openModal({ title: '修改密码', footer: false, bodyHTML: passwordChangeHTML() });
  if (!ctl) return null;
  const bodyEl = ctl.body;
  const errEl = bodyEl.querySelector('[data-el="pwdError"]');

  function setError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    if (msg) errEl.removeAttribute('hidden');
    else errEl.setAttribute('hidden', '');
  }

  // 失败 → 三个密码框恢复初始状态（全清空）并聚焦旧密码框
  function resetFields() {
    const init = passwordResetState();
    const oldEl = bodyEl.querySelector('[data-f="oldPwd"]');
    bodyEl.querySelector('[data-f="newPwd"]').value = init.newPwd;
    bodyEl.querySelector('[data-f="confirmPwd"]').value = init.confirmPwd;
    if (oldEl) { oldEl.value = init.oldPwd; oldEl.focus(); }
    setError('');
  }

  bodyEl.querySelector('[data-act="changePwd"]').addEventListener('click', async () => {
    const oldPwd = bodyEl.querySelector('[data-f="oldPwd"]').value;
    const newPwd = bodyEl.querySelector('[data-f="newPwd"]').value;
    const confirmPwd = bodyEl.querySelector('[data-f="confirmPwd"]').value;
    try {
      const oldOk = await Accounts.verify(repo, accountId, oldPwd);
      const err = passwordChangeError(oldOk, newPwd, confirmPwd);
      if (err) { resetFields(); setError(err); return; }
      await Accounts.setPassword(repo, accountId, newPwd);
      await app.refreshAccounts();
      ctl.close();
      showToast('修改成功');
    } catch (e) {
      resetFields();
      setError(e.message || '修改失败');
    }
  });

  return ctl;
}

// 更改名字：作用于当前登录账号
export function openRename({ repo, app, accountId }) {
  const acc = (app.accounts || []).find((a) => a.id === accountId);
  const ctl = openModal({
    title: '更改名字',
    submitText: '保存',
    bodyHTML: `<label class="acc-field"><span>新名称</span><input data-f="name" placeholder="${escapeHtml(acc ? acc.name : '')}"></label>`,
    onSubmit: async () => {
      const value = ctl.body.querySelector('[data-f="name"]').value;
      if (!String(value || '').trim()) return true;
      await Accounts.rename(repo, accountId, value);
      await app.refreshAccounts();
      showToast('已更改名字');
      return false;
    },
  });
  return ctl;
}

// 通用设置窗口（原「数据与设置」页的通用设置卡片）：主题 / 默认打开页 / 站内提醒 / 记账初始卡片
export function openThemeSettings({ repo, app }) {
  const prefs = loadPrefs();
  const ctl = openModal({
    title: '通用设置',
    footer: false,
    bodyHTML: `
      <div class="acc-form">
        <label class="acc-field"><span>主题</span><select data-f="theme"></select></label>
        <label class="acc-field"><span>默认打开页</span><select data-f="defaultRoute"></select></label>
        <label class="acc-field acc-inline"><span>站内提醒（顶部铃铛显示未读）</span><input type="checkbox" data-f="notify"></label>
        <div class="muted" style="margin:10px 0 6px">记账初始卡片管理</div>
        <div data-el="ledgerCards"></div>
      </div>`,
  });
  if (!ctl) return null;

  const themeSel = ctl.body.querySelector('[data-f="theme"]');
  const currentTheme = normalizeTheme(prefs.theme);
  for (const [val, txt] of THEME_OPTIONS) {
    const o = document.createElement('option');
    o.value = val; o.textContent = txt; if (currentTheme === val) o.selected = true;
    themeSel.appendChild(o);
  }
  themeSel.addEventListener('change', () => {
    prefs.theme = themeSel.value;
    savePrefs(prefs);
    applyTheme(prefs.theme);
  });

  const routeSel = ctl.body.querySelector('[data-f="defaultRoute"]');
  const currentRoutePref = ROUTE_OPTIONS.some(([val]) => val === prefs.defaultRoute) ? prefs.defaultRoute : 'home';
  for (const [val, txt] of ROUTE_OPTIONS) {
    const o = document.createElement('option');
    o.value = val; o.textContent = txt; if (currentRoutePref === val) o.selected = true;
    routeSel.appendChild(o);
  }
  routeSel.addEventListener('change', () => { prefs.defaultRoute = routeSel.value; savePrefs(prefs); });

  const notifyChk = ctl.body.querySelector('[data-f="notify"]');
  notifyChk.checked = prefs.notify !== false;
  notifyChk.addEventListener('change', () => { prefs.notify = notifyChk.checked; savePrefs(prefs); });

  async function refreshCards() {
    const box = ctl.body.querySelector('[data-el="ledgerCards"]');
    box.innerHTML = '';
    const accId = app.state.currentAccountId;
    if (!accId) { box.innerHTML = '<div class="muted">请先登录账号。</div>'; return; }
    await Ledger.ensureDefaultCards(repo, accId);
    const cards = (await Ledger.listCards(repo, accId)).filter((c) => c.preset === true);
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = '暂无初始卡片。';
      box.appendChild(empty);
    }
    for (const c of cards) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginBottom = '6px';
      const label = document.createElement('span');
      label.style.flex = '1'; label.textContent = c.name;
      const rn = document.createElement('button');
      rn.type = 'button'; rn.className = 'btn'; rn.textContent = '改名';
      rn.addEventListener('click', () => {
        openPrompt({
          title: '改名', label: '新名称', placeholder: c.name, submitText: '保存',
          onSubmit: async (n) => {
            if (!String(n || '').trim()) return true;
            try { await Ledger.renameCard(repo, c.id, n); await refreshCards(); app.state.emit(); } catch (e) { showToast(e.message); }
            return false;
          },
        });
      });
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'btn danger'; rm.textContent = '删除';
      rm.addEventListener('click', () => {
        openConfirm({
          title: '删除卡片', confirmText: '删除',
          message: '删除该卡片会同时删除其记录，确定？',
          onConfirm: async () => { await Ledger.removeCard(repo, c.id); await refreshCards(); app.state.emit(); },
        });
      });
      row.append(label, rn, rm);
      box.appendChild(row);
    }

    // 新增初始卡片：每天都会出现的卡片，按钮跟在初始卡片列表后面
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn';
    addBtn.setAttribute('data-act', 'addInitialCard');
    addBtn.style.marginTop = '8px';
    addBtn.textContent = '新增初始卡片';
    addBtn.addEventListener('click', () => {
      openPrompt({
        title: '新增初始卡片', label: '卡片名称', placeholder: '如：交通', submitText: '添加',
        onSubmit: async (value) => {
          const name = String(value == null ? '' : value).trim();
          if (!name) return true;
          try {
            await Ledger.addInitialCard(repo, accId, name);
            await refreshCards();
            app.state.emit(); // 记账页同步出现新卡片
            showToast('已新增初始卡片');
          } catch (e) { showToast(e.message); }
          return false;
        },
      });
    });
    box.appendChild(addBtn);
  }

  refreshCards();
  return ctl;
}
