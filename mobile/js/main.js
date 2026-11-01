// 工作生活助手 · 移动版启动器
// 只读复用 app/js/lib 业务层与 app/js/ui/modal.js；本文件与 mobile/views 均为新增，不修改 app/、desktop/。
import { createRepository, IdbAdapter, MemoryAdapter } from '../../app/js/lib/db.js';
import { AppState } from '../../app/js/appstate.js';
import { todayStr } from '../../app/js/lib/utils.js';
import { Accounts } from '../../app/js/lib/accounts.js';
import { Group } from '../../app/js/lib/group.js';
import { openModal, openConfirm, openPrompt } from '../../app/js/ui/modal.js';
import { normalizeTheme } from '../../app/js/lib/theme.js';

import home from './views/home.js';
import today from './views/today.js';
import devwork from './views/devwork.js';
import group from './views/group.js';
import quiz from './views/quiz.js';
import ledger from './views/ledger.js';
import settings from './views/settings.js';

// 移动版独立 IndexedDB 库名，与电脑版默认库 worklife 物理隔离；备份 JSON 格式一致可互导。
const DB_NAME = 'worklife-mobile';
const PREF_KEY = 'worklife-mobile.prefs';

const MODULES = { home, today, devwork, group, quiz, ledger, settings };

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function applyTheme(theme) {
  const norm = normalizeTheme(theme);
  try { document.documentElement.setAttribute('data-theme', norm); } catch { /* ignore */ }
}

export const App = {
  repo: null,
  state: AppState,
  modules: MODULES,
  accounts: [],
  prefs: loadPrefs(),
  refreshAccounts,
  refreshNotify,
  savePrefs,
};

function pickAdapter() {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbAdapter(DB_NAME, 1);
  } catch (e) { /* fallthrough */ }
  return new MemoryAdapter();
}

function currentRoute() {
  const key = (location.hash || '').replace(/^#/, '');
  return MODULES[key] ? key : 'home';
}

function renderRoute() {
  const key = currentRoute();
  const mod = MODULES[key];
  document.querySelectorAll('#tabbar .tab').forEach((b) => b.classList.toggle('active', b.dataset.route === key));
  document.querySelectorAll('.module').forEach((s) => { s.hidden = s.dataset.module !== key; });
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = mod.title;
  const el = document.querySelector('.module[data-module="' + key + '"]');
  if (el && typeof mod.mount === 'function') {
    try { mod.mount(el, { repo: App.repo, state: AppState, app: App }); }
    catch (e) { console.error('mount failed: ' + key, e); }
  }
}

export async function refreshAccounts() {
  App.accounts = await Accounts.list(App.repo);
  const btn = document.getElementById('accountBtn');
  if (!btn) return App.accounts;
  if (App.accounts.length === 0) {
    btn.textContent = '登录';
    AppState.set({ currentAccountId: null });
    return App.accounts;
  }
  if (AppState.loggedOut) {
    AppState.set({ currentAccountId: null });
    btn.textContent = '登录';
    return App.accounts;
  }
  let cur = AppState.currentAccountId;
  if (!cur || !App.accounts.some((a) => a.id === cur)) cur = App.accounts[0].id;
  AppState.set({ currentAccountId: cur, loggedOut: false });
  const curAcc = App.accounts.find((a) => a.id === cur);
  btn.textContent = curAcc ? curAcc.name : '登录';
  return App.accounts;
}

export async function refreshNotify() {
  const badge = document.getElementById('notifyBadge');
  if (!badge) return 0;
  const accId = AppState.currentAccountId;
  let n = 0;
  if (accId && App.repo) {
    const groups = await Group.listForAccount(App.repo, accId);
    for (const g of groups) {
      const list = await Group.listNotifications(App.repo, g.id, accId);
      n += list.filter((x) => !x.read).length;
    }
  }
  badge.textContent = String(n);
  badge.hidden = n <= 0;
  return n;
}

// ---------- 账号管理弹窗（逻辑对齐桌面 app.js，样式用移动端通用类） ----------
function loginPanelHTML(accounts) {
  const opts = accounts.length
    ? accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.passwordHash ? '（已设密）' : ''}</option>`).join('')
    : '<option value="">暂无账号，请先点“注册”创建</option>';
  return `
    <div class="field"><label>账号</label><select data-f="loginUser">${opts}</select></div>
    <div class="field"><label>密码（设有密码的账号需填写）</label>
      <input data-f="loginPwd" type="password" autocomplete="off" placeholder="账号密码"></div>
    <button class="btn primary block" data-act="doLogin">登录</button>`;
}
function registerPanelHTML() {
  return `
    <div class="field"><label>新账号名称</label><input data-f="name" placeholder="新账号名称"></div>
    <div class="field"><label>可选本地密码</label>
      <input data-f="pwd" type="password" autocomplete="new-password" placeholder="可选本地密码"></div>
    <button class="btn primary block" data-act="create">注册并创建</button>`;
}
function accountListHTML(accounts, currentId) {
  if (!accounts.length) return '<div class="muted">还没有账号，先在上方创建一个。</div>';
  return accounts.map((a) => {
    const active = a.id === currentId;
    return `<div class="member-row" style="flex-wrap:wrap">
      <span style="flex:1;min-width:120px">${escapeHtml(a.name)}${active ? ' <span class="tag">当前</span>' : ''}${a.passwordHash ? ' <span class="muted">已设密</span>' : ''}</span>
      <span class="row" style="gap:6px;flex-wrap:wrap">
        ${active
          ? '<button class="btn sm danger" data-act="logout">退出</button>'
          : '<button class="btn sm" data-act="switch" data-id="' + a.id + '">登录</button>'}
        <button class="btn sm" data-act="rename" data-id="${a.id}" data-name="${escapeHtml(a.name)}">改名</button>
        <button class="btn sm" data-act="pwd" data-id="${a.id}">设密码</button>
        <button class="btn sm danger" data-act="del" data-id="${a.id}" data-name="${escapeHtml(a.name)}">删除</button>
      </span></div>`;
  }).join('');
}

async function openAccountManager() {
  const ctl = openModal({ title: '账号管理', footer: false,
    bodyHTML: `<div class="row" style="gap:8px;margin-bottom:10px">
      <button class="btn primary" data-act="tabLogin">登录</button>
      <button class="btn" data-act="tabRegister">注册</button></div>
      <div data-el="panel"></div>
      <hr style="border:none;border-top:1px solid var(--line);margin:12px 0">
      <div data-el="list"></div>` });
  if (!ctl) return;
  let mode = 'login';
  async function refresh() {
    App.accounts = await Accounts.list(App.repo);
    ctl.body.querySelector('[data-el="list"]').innerHTML = accountListHTML(App.accounts, AppState.currentAccountId);
  }
  function renderPanel() {
    ctl.body.querySelector('[data-el="panel"]').innerHTML = mode === 'register' ? registerPanelHTML() : loginPanelHTML(App.accounts);
    ctl.overlay.querySelectorAll('[data-act="tabLogin"],[data-act="tabRegister"]').forEach((b) => {
      b.classList.toggle('primary', b.dataset.act === (mode === 'register' ? 'tabRegister' : 'tabLogin'));
    });
  }
  ctl.overlay.addEventListener('click', async (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    const id = e.target.dataset && e.target.dataset.id;
    try {
      if (act === 'tabLogin') { mode = 'login'; renderPanel(); }
      else if (act === 'tabRegister') { mode = 'register'; renderPanel(); }
      else if (act === 'doLogin') {
        const sel = ctl.body.querySelector('[data-f="loginUser"]');
        const uid = sel && sel.value;
        if (!uid) { window.alert('请选择要登录的账号'); return; }
        const acc = App.accounts.find((a) => a.id === uid);
        if (acc && acc.passwordHash) {
          const pwd = ctl.body.querySelector('[data-f="loginPwd"]').value;
          if (!await Accounts.verify(App.repo, uid, pwd)) { window.alert('密码错误'); return; }
        }
        AppState.set({ currentAccountId: uid, loggedOut: false });
        await refreshAccounts(); await refresh();
      } else if (act === 'create') {
        const name = ctl.body.querySelector('[data-f="name"]').value;
        const pwd = ctl.body.querySelector('[data-f="pwd"]').value;
        await Accounts.create(App.repo, { name, password: pwd });
        AppState.set({ loggedOut: false });
        await refreshAccounts(); await refresh();
        mode = 'login'; renderPanel();
      } else if (act === 'switch') {
        const acc = App.accounts.find((a) => a.id === id);
        const finish = async () => {
          AppState.set({ currentAccountId: id, loggedOut: false });
          await refreshAccounts(); await refresh();
        };
        if (acc && acc.passwordHash) {
          const sub = openModal({ title: '验证登录', submitText: '登录', cancelText: '取消',
            bodyHTML: '<div class="field"><label>账号密码（密文输入）</label><input data-f="pwd" type="password" placeholder="请输入该账号本地密码"></div>',
            onSubmit: async () => {
              const p = sub.body.querySelector('[data-f="pwd"]').value;
              if (!await Accounts.verify(App.repo, id, p)) { window.alert('密码错误'); return true; }
              await finish(); return false;
            } });
        } else { await finish(); }
      } else if (act === 'rename') {
        openPrompt({ title: '改名', label: '新名称', placeholder: e.target.dataset.name || '', submitText: '保存',
          onSubmit: async (n) => {
            if (!String(n || '').trim()) return true;
            await Accounts.rename(App.repo, id, n); await refreshAccounts(); await refresh(); return false;
          } });
      } else if (act === 'pwd') {
        const sub = openModal({ title: '设置本地密码', submitText: '保存', cancelText: '取消',
          bodyHTML: '<div class="field"><label>新密码（留空表示清除密码）</label><input data-f="pwd" type="password" autocomplete="new-password" placeholder="留空表示清除密码"></div>',
          onSubmit: async () => {
            await Accounts.setPassword(App.repo, id, sub.body.querySelector('[data-f="pwd"]').value);
            await refreshAccounts(); await refresh(); return false;
          } });
      } else if (act === 'del') {
        openConfirm({ title: '删除账号', confirmText: '删除',
          message: '确认删除账号「' + e.target.dataset.name + '」？将同时清空其个人数据。',
          onConfirm: async () => { await Accounts.remove(App.repo, id); await refreshAccounts(); await refresh(); } });
      } else if (act === 'logout') {
        AppState.set({ currentAccountId: null, loggedOut: true });
        await refreshAccounts(); await refresh();
      }
    } catch (err) { window.alert(err.message); }
  });
  refresh(); renderPanel();
}

function bindTopbar() {
  const btn = document.getElementById('accountBtn');
  if (btn) btn.addEventListener('click', openAccountManager);
  const bell = document.getElementById('notifyBell');
  if (bell) bell.addEventListener('click', () => { location.hash = '#group'; });
  document.querySelectorAll('#tabbar .tab').forEach((b) => {
    b.addEventListener('click', () => { location.hash = '#' + b.dataset.route; });
  });
}

let lastAccId = null;
function bindState() {
  AppState.subscribe(async () => {
    if (!App.repo) return;
    await refreshNotify();
    if (AppState.currentAccountId !== lastAccId) { lastAccId = AppState.currentAccountId; renderRoute(); }
  });
}

async function boot() {
  const prefs = loadPrefs();
  App.prefs = prefs;
  applyTheme(prefs.theme || 'forest');
  AppState.set({ currentDate: todayStr() });
  App.repo = await createRepository(pickAdapter());
  window.__app = App;
  bindTopbar(); bindState();
  if (!location.hash) location.hash = '#' + (prefs.defaultRoute || 'home');
  window.addEventListener('hashchange', renderRoute);
  lastAccId = AppState.currentAccountId;
  await refreshAccounts();
  renderRoute(); refreshNotify();

  // PWA：Service Worker 仅在 http(s)/localhost 下可用；file:// 打开时自动跳过，不影响功能。
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败（可忽略，不影响使用）：', e));
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') boot();
export { renderRoute, boot };
