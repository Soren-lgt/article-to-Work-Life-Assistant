// AI生成
// 应用启动与路由
import { createRepository, IdbAdapter, MemoryAdapter } from './lib/db.js';
import { AppState } from './appstate.js';
import { todayStr } from './lib/utils.js';
import { Accounts } from './lib/accounts.js';
import { Memo } from './lib/memo.js';
import { Group } from './lib/group.js';
import { openModal, openConfirm, openPrompt } from './ui/modal.js';
import { loadPrefs, applyTheme, ensureThemeCss } from './modules/settings.js';
import home from './modules/home.js';
import today from './modules/today.js';
import devwork from './modules/devwork.js';
import group from './modules/group.js';
import quiz from './modules/quiz.js';
import ledger from './modules/ledger.js';
import settings from './modules/settings.js';

const MODULES = {
  home, today, devwork, group, quiz, ledger, settings,
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 纯函数：顶栏账号按钮文案——未登录/无账号=登录，已登录=当前账号名
export function accountButtonLabel(currentName, loggedIn) {
  return loggedIn && currentName ? currentName : '登录';
}

// 纯函数：密码输入框（密文，type=password），data 名与占位文案可配
export function passwordFieldHTML(placeholder = "请输入密码", dataF = "pwd") {
  return `<input data-f="${dataF}" type="password" autocomplete="new-password" placeholder="${placeholder}">`;
}

// 纯函数：登录面板——选择账号 + 密文密码 + 登录按钮
export function loginPanelHTML(accounts = []) {
  const opts = accounts.length
    ? accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.passwordHash ? '（已设密）' : ''}</option>`).join('')
    : '<option value="">暂无账号，请先点“注册”创建</option>';
  return `
    <label class="acc-field"><span>账号</span>
      <select data-f="loginUser">${opts}</select>
    </label>
    <label class="acc-field"><span>密码（设有密码的账号需填写）</span>
      ${passwordFieldHTML('账号密码', 'loginPwd')}
    </label>
    <div class="acc-form-actions">
      <button class="btn primary" data-act="doLogin">登录</button>
    </div>`;
}

// 纯函数：注册面板——名称 + 密文密码 + 创建 + 返回登录
export function registerPanelHTML() {
  return `
    <label class="acc-field"><span>新账号名称</span>
      <input data-f="name" placeholder="新账号名称">
    </label>
    <label class="acc-field"><span>可选本地密码</span>
      ${passwordFieldHTML('可选本地密码', 'pwd')}
    </label>
    <div class="acc-form-actions">
      <button class="btn primary" data-act="create">注册并创建</button>
      <button class="btn" data-act="tabLogin">返回登录</button>
    </div>`;
}

// 纯函数：账号管理弹窗骨架——顶部“登录/注册”切换 + 动态面板 + 下方账号列表
export function accountManagerBodyHTML() {
  return `
    <div class="auth-tabs">
      <button class="btn primary" data-act="tabLogin">登录</button>
      <button class="btn" data-act="tabRegister">注册</button>
    </div>
    <div data-el="panel" class="acc-form"></div>
    <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
    <div data-el="list"></div>`;
}

// 纯函数：账号列表行（当前账号不显示“登录”，显示当前标记；含改名/设密码/删除）
export function accountListHTML(accounts, currentId) {
  if (!accounts.length) return '<div class="muted">还没有账号，先在上方创建一个。</div>';
  return accounts.map((a) => {
    const active = a.id === currentId;
    return `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
      <span style="flex:1">${escapeHtml(a.name)}${active ? ' <span class="muted">[当前]</span>' : ''}${a.passwordHash ? ' 🔒' : ''}</span>
      <span class="row" style="gap:6px">
        ${active ? '' : `<button class="btn" data-act="switch" data-id="${a.id}">登录</button>`}
        ${active ? logoutActionButtonHTML() : ''}
        <button class="btn" data-act="rename" data-id="${a.id}" data-name="${escapeHtml(a.name)}">改名</button>
        <button class="btn" data-act="pwd" data-id="${a.id}">设密码</button>
        <button class="btn danger" data-act="del" data-id="${a.id}" data-name="${escapeHtml(a.name)}">删除</button>
      </span>
    </div>`;
  }).join('');
}

// 纯函数：是否处于登录态（决定当前账号行是否显示退出按钮）
export function logoutButtonVisible(currentId) { return Boolean(currentId); }

// 纯函数：退出按钮片段（仅渲染在当前账号操作行）
export function logoutActionButtonHTML() {
  return '<button class="btn danger" data-act="logout">退出</button>';
}

// 纯函数：是否允许自动登录（用户主动退出后本次会话不再自动选号）
export function shouldAutoLogin(explicitLogout, hasAccounts) {
  return !explicitLogout && hasAccounts;
}

export const App = {
  repo: null,
  state: AppState,
  modules: MODULES,
  accounts: [],
  refreshAccounts,
  refreshNotify,
};

function pickAdapter() {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbAdapter();
  } catch (e) { /* ignore */ }
  return new MemoryAdapter();
}

function currentRoute() {
  const key = (location.hash || '').replace(/^#/, '');
  return MODULES[key] ? key : 'home';
}

function renderRoute() {
  const key = currentRoute();
  const mod = MODULES[key];

  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === key);
  });
  document.querySelectorAll('.module').forEach((s) => {
    s.hidden = s.dataset.module !== key;
  });
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = mod.title;

  const el = document.querySelector('.module[data-module="' + key + '"]');
  if (el && typeof mod.mount === 'function') {
    try {
      mod.mount(el, { repo: App.repo, state: AppState, app: App });
    } catch (e) {
      console.error('mount failed: ' + key, e);
    }
  }
}

// 加载账号并刷新顶栏按钮文案
export async function refreshAccounts() {
  App.accounts = await Accounts.list(App.repo);
  const btn = document.getElementById('accountBtn');
  if (!btn) return App.accounts;
  if (App.accounts.length === 0) {
    btn.textContent = accountButtonLabel('', false);
    AppState.set({ currentAccountId: null });
    return App.accounts;
  }
  if (!shouldAutoLogin(AppState.loggedOut, App.accounts.length > 0)) {
    AppState.set({ currentAccountId: null });
    btn.textContent = accountButtonLabel('', false);
    return App.accounts;
  }
  let cur = AppState.currentAccountId;
  if (!cur || !App.accounts.some((a) => a.id === cur)) cur = App.accounts[0].id;
  AppState.set({ currentAccountId: cur, loggedOut: false });
  const curAcc = App.accounts.find((a) => a.id === cur);
  btn.textContent = accountButtonLabel(curAcc ? curAcc.name : '', Boolean(curAcc));
  return App.accounts;
}

// 顶部通知红点：汇总当前账号在所有小组的未读通知
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
  badge.style.display = n > 0 ? '' : 'none';
  return n;
}

// 右上角“登录/账号名”按钮：打开账号管理弹窗（创建/切换/改名/设密/删除）
async function openAccountManager() {
  const ctl = openModal({
    title: '账号管理',
    footer: false,
    bodyHTML: accountManagerBodyHTML(),
  });
  if (!ctl) return;

  let mode = 'login';
  async function refresh() {
    App.accounts = await Accounts.list(App.repo);
    const list = ctl.body.querySelector('[data-el="list"]');
    list.innerHTML = accountListHTML(App.accounts, AppState.currentAccountId);
  }
  function renderPanel() {
    const panel = ctl.body.querySelector('[data-el="panel"]');
    if (panel) panel.innerHTML = mode === 'register' ? registerPanelHTML() : loginPanelHTML(App.accounts);
    ctl.overlay.querySelectorAll('[data-act="tabLogin"],[data-act="tabRegister"]').forEach((b) => {
      b.classList.toggle('primary', b.dataset.act === (mode === 'register' ? 'tabRegister' : 'tabLogin'));
    });
  }

  ctl.overlay.addEventListener('click', async (e) => {
    const act = e.target.dataset.act;
    const id = e.target.dataset.id;
    try {
      if (act === 'tabLogin') { mode = 'login'; renderPanel(); }
      else if (act === 'tabRegister') { mode = 'register'; renderPanel(); }
      else if (act === 'doLogin') {
        const sel = ctl.body.querySelector('[data-f="loginUser"]');
        const id = sel && sel.value;
        if (!id) { window.alert('请选择要登录的账号'); return; }
        const acc = App.accounts.find((a) => a.id === id);
        if (acc && acc.passwordHash) {
          const pwd = ctl.body.querySelector('[data-f="loginPwd"]').value;
          if (!await Accounts.verify(App.repo, id, pwd)) { window.alert('密码错误'); return; }
        }
        AppState.set({ currentAccountId: id, loggedOut: false });
        await refreshAccounts();
        await refresh();
      } else if (act === 'create') {
        const name = ctl.body.querySelector('[data-f="name"]').value;
        const pwd = ctl.body.querySelector('[data-f="pwd"]').value;
        await Accounts.create(App.repo, { name, password: pwd });
        AppState.set({ loggedOut: false });
        await refreshAccounts();
        await refresh();
        mode = 'login';
        renderPanel();
      } else if (act === 'switch') {
        const acc = App.accounts.find((a) => a.id === id);
        const finishSwitch = async () => {
          AppState.set({ currentAccountId: id, loggedOut: false });
          await refreshAccounts();
          await refresh();
        };
        if (acc && acc.passwordHash) {
          const subCtl = openModal({
            title: '验证登录', submitText: '登录', cancelText: '取消',
            bodyHTML: `<label>账号密码（密文输入）</label>${passwordFieldHTML('请输入该账号本地密码')}`,
            onSubmit: async () => {
              const p = subCtl.body.querySelector('[data-f="pwd"]').value;
              if (!await Accounts.verify(App.repo, id, p)) { window.alert('密码错误'); return true; }
              await finishSwitch();
              return false;
            },
          });
        } else {
          await finishSwitch();
        }
      } else if (act === 'rename') {
        openPrompt({
          title: '改名', label: '新名称', placeholder: e.target.dataset.name || '', submitText: '保存',
          onSubmit: async (n) => {
            if (!String(n || '').trim()) return true;
            await Accounts.rename(App.repo, id, n);
            await refreshAccounts();
            await refresh();
            return false;
          },
        });
      } else if (act === 'pwd') {
        const subCtl = openModal({
          title: '设置本地密码', submitText: '保存', cancelText: '取消',
          bodyHTML: `<label>新密码（留空表示清除密码，密文输入）</label>${passwordFieldHTML('留空表示清除密码')}`,
          onSubmit: async () => {
            const v = subCtl.body.querySelector('[data-f="pwd"]').value;
            await Accounts.setPassword(App.repo, id, v);
            await refreshAccounts();
            await refresh();
            return false;
          },
        });
      } else if (act === 'del') {
        openConfirm({
          title: '删除账号', confirmText: '删除',
          message: '确认删除账号「' + e.target.dataset.name + '」？将同时清空其个人数据。',
          onConfirm: async () => {
            await Accounts.remove(App.repo, id);
            await refreshAccounts();
            await refresh();
          },
        });
      } else if (act === 'logout') {
        AppState.set({ currentAccountId: null, loggedOut: true });
        await refreshAccounts();
        await refresh();
      }
    } catch (err) { window.alert(err.message); }
  });

  refresh();
  renderPanel();
}

function bindTopbar() {
  const btn = document.getElementById('accountBtn');
  if (btn) btn.addEventListener('click', openAccountManager);
}

function bindQuickMemo() {
  const input = document.getElementById('quickMemo');
  if (!input) return;
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const text = input.value.trim();
    if (!text) return;
    const accId = AppState.currentAccountId;
    if (!accId) { window.alert('请先创建并登录账号'); return; }
    await Memo.add(App.repo, accId, text);
    input.value = '';
    AppState.emit();
  });
}

let lastAccId = null;

function bindNotify() {
  const bell = document.getElementById('notifyBell');
  if (bell) bell.addEventListener('click', () => { location.hash = '#group'; });
  AppState.subscribe(async () => {
    if (!App.repo) return;
    await refreshNotify();
    if (AppState.currentAccountId !== lastAccId) {
      lastAccId = AppState.currentAccountId;
      renderRoute();
    }
  });
}

async function boot() {
  const prefs = loadPrefs();
  ensureThemeCss();
  applyTheme(prefs.theme || 'light');

  AppState.set({ currentDate: todayStr() });
  App.repo = await createRepository(pickAdapter());
  window.__app = App;

  bindTopbar();
  bindQuickMemo();
  bindNotify();

  if (!location.hash) location.hash = '#' + (prefs.defaultRoute || 'home');
  window.addEventListener('hashchange', renderRoute);

  lastAccId = AppState.currentAccountId;
  await refreshAccounts();
  // 首次使用且没有任何账号：引导到「数据与设置」页（账号管理已收纳到顶栏弹窗，此处仅兜底）
  renderRoute();
  refreshNotify();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}

export { renderRoute, boot };