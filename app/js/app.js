// AI生成
// 应用启动与路由
import { createRepository, IdbAdapter, MemoryAdapter } from './lib/db.js';
import { AppState } from './appstate.js';
import { todayStr } from './lib/utils.js';
import { Accounts } from './lib/accounts.js';
import { passwordFieldHTML, formErrorHTML } from './lib/accountview.js';
export { passwordFieldHTML };
import { Group } from './lib/group.js';
import { openModal } from './ui/modal.js';
import { loadPrefs, applyTheme, ensureThemeCss } from './lib/prefs.js';
import home from './modules/home.js';
import today from './modules/today.js';
import devwork from './modules/devwork.js';
import group from './modules/group.js';
import quiz from './modules/quiz.js';
import ledger from './modules/ledger.js';
import { openAccountMenu } from './ui/accountmenu.js';
import { mountPet } from './modules/pet.js';

const MODULES = {
  home, today, devwork, group, quiz, ledger,
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
    ${formErrorHTML()}
    <div class="acc-form-actions">
      <button class="btn primary" data-act="doLogin">登录</button>
    </div>`;
}

// 纯函数：注册面板——名称 + 密文密码 + 创建（登录/注册切换由顶部 tabs 承担，面板内不再重复“返回登录”）
export function registerPanelHTML() {
  return `
    <label class="acc-field"><span>新账号名称</span>
      <input data-f="name" placeholder="新账号名称">
    </label>
    <label class="acc-field"><span>可选本地密码</span>
      ${passwordFieldHTML('可选本地密码', 'pwd')}
    </label>
    ${formErrorHTML()}
    <div class="acc-form-actions">
      <button class="btn primary" data-act="create">注册并创建</button>
    </div>`;
}

// 纯函数：账号弹窗骨架——只有“登录/注册”切换与动态面板
// P5：登录界面只负责登录/注册；登录后的账号能力全部收敛到顶栏账号下拉菜单
export function accountManagerBodyHTML() {
  return `
    <div class="auth-tabs">
      <button class="btn primary" data-act="tabLogin">登录</button>
      <button class="btn" data-act="tabRegister">注册</button>
    </div>
    <div data-el="panel" class="acc-form"></div>`;
}

// P3：账号列表/退出按钮的纯展示函数抽到 lib/accountview.js（登录弹窗只做登录与注册）
export { accountListHTML, logoutActionButtonHTML, logoutButtonVisible } from './lib/accountview.js';

// 纯函数：是否允许自动登录（用户主动退出后本次会话不再自动选号）
export function shouldAutoLogin(explicitLogout, hasAccounts) {
  return !explicitLogout && hasAccounts;
}

// P1 纯函数：这两个动作成功后应关闭账号弹窗、直接进入应用（登录 / 注册）
export function authActionClosesModal(act) {
  return act === 'doLogin' || act === 'create';
}

// P1 纯函数：认证成功后的状态迁移——切到目标账号并清除“主动退出”标记
export function authSuccessState(accountId) {
  return { currentAccountId: accountId || null, loggedOut: false };
}

export const App = {
  repo: null,
  state: AppState,
  modules: MODULES,
  accounts: [],
  refreshAccounts,
  refreshNotify,
  // 清空/导入数据后重绘当前页面
  refreshViews: () => renderRoute(),
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

// 右上角“登录/账号名”按钮（未登录时）：打开登录 / 注册弹窗
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
  }
  function renderPanel() {
    const panel = ctl.body.querySelector('[data-el="panel"]');
    if (panel) panel.innerHTML = mode === 'register' ? registerPanelHTML() : loginPanelHTML(App.accounts);
    ctl.overlay.querySelectorAll('[data-act="tabLogin"],[data-act="tabRegister"]').forEach((b) => {
      b.classList.toggle('primary', b.dataset.act === (mode === 'register' ? 'tabRegister' : 'tabLogin'));
    });
  }
  // P4：弹窗内联错误提示（不再调用原生 alert，避免弹窗打开后输入框点不动）
  function setFormError(msg) {
    const el = ctl.body.querySelector('[data-el="formError"]');
    if (!el) return;
    el.textContent = String(msg == null ? "" : msg);
    if (msg) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  ctl.overlay.addEventListener('click', async (e) => {
    const act = e.target.dataset.act;
    try {
      if (act === 'tabLogin') { mode = 'login'; renderPanel(); }
      else if (act === 'tabRegister') { mode = 'register'; renderPanel(); }
      else if (act === 'doLogin') {
        const sel = ctl.body.querySelector('[data-f="loginUser"]');
        const loginId = sel && sel.value;
        if (!loginId) { setFormError('请选择要登录的账号'); return; }
        const acc = App.accounts.find((a) => a.id === loginId);
        const pwdInput = ctl.body.querySelector('[data-f="loginPwd"]');
        if (acc && acc.passwordHash) {
          const pwd = pwdInput ? pwdInput.value : '';
          const passed = await Accounts.verify(App.repo, loginId, pwd);
          if (!passed) {
            // P4：密码错误 → 清空密码框并重新聚焦，用户可以直接重输
            if (pwdInput) { pwdInput.value = ''; pwdInput.focus(); }
            setFormError('密码错误，请重新输入');
            return;
          }
        }
        setFormError('');
        AppState.set(authSuccessState(loginId));
        await refreshAccounts();
        await refresh();
        if (authActionClosesModal(act)) ctl.close();
      } else if (act === 'create') {
        const name = ctl.body.querySelector('[data-f="name"]').value;
        const pwd = ctl.body.querySelector('[data-f="pwd"]').value;
        setFormError('');
        const created = await Accounts.create(App.repo, { name, password: pwd });
        AppState.set(authSuccessState(created && created.id));
        await refreshAccounts();
        await refresh();
        if (authActionClosesModal(act)) ctl.close();
        else { mode = 'login'; renderPanel(); }
      }
    } catch (err) { setFormError(err.message); }
  });

  refresh();
  renderPanel();
}

function bindTopbar() {
  const btn = document.getElementById('accountBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // P5：已登录 → 展开下拉菜单；未登录 → 打开登录/注册弹窗
    if (AppState.currentAccountId) openAccountMenu({ repo: App.repo, app: App, anchor: btn });
    else openAccountManager();
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
  bindNotify();

  if (!location.hash) location.hash = '#' + (prefs.defaultRoute || 'home');
  window.addEventListener('hashchange', renderRoute);

  lastAccId = AppState.currentAccountId;
  await refreshAccounts();
  renderRoute();
  refreshNotify();
  mountPet({ repo: App.repo, state: AppState, app: App });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}

export { renderRoute, boot };