// AI生成
// 应用启动与路由
import { createRepository, IdbAdapter, MemoryAdapter } from './lib/db.js';
import { AppState } from './appstate.js';
import { todayStr } from './lib/utils.js';
import { Accounts } from './lib/accounts.js';
import { Memo } from './lib/memo.js';
import { Group } from './lib/group.js';
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

export const App = {
  repo: null,
  state: AppState,
  modules: MODULES,
  accounts: [],
  // 把顶层控制函数挂到 App 上，供各模块通过 ctx.app 调用（如 settings 创建/删除账号后刷新）
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

// 加载并渲染账号切换器
export async function refreshAccounts() {
  App.accounts = await Accounts.list(App.repo);
  const sel = document.getElementById('accountSwitch');
  if (!sel) return App.accounts;
  sel.innerHTML = '';
  if (App.accounts.length === 0) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '（无账号，请到设置创建）';
    sel.appendChild(o);
    AppState.set({ currentAccountId: null });
    return App.accounts;
  }
  for (const a of App.accounts) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name;
    sel.appendChild(o);
  }
  let cur = AppState.currentAccountId;
  if (!cur || !App.accounts.some((a) => a.id === cur)) cur = App.accounts[0].id;
  sel.value = cur;
  AppState.set({ currentAccountId: cur });
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

function bindTopbar() {
  const sel = document.getElementById('accountSwitch');
  if (!sel) return;
  sel.addEventListener('change', async () => {
    const id = sel.value;
    const acc = App.accounts.find((a) => a.id === id);
    if (acc && acc.passwordHash && typeof window !== 'undefined') {
      const pwd = window.prompt('请输入该账号的本地密码') || '';
      const ok = await Accounts.verify(App.repo, id, pwd);
      if (!ok) {
        window.alert('密码错误');
        sel.value = AppState.currentAccountId || '';
        return;
      }
    }
    AppState.set({ currentAccountId: id || null });
  });
}

function bindQuickMemo() {
  const input = document.getElementById('quickMemo');
  if (!input) return;
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const text = input.value.trim();
    if (!text) return;
    const accId = AppState.currentAccountId;
    if (!accId) { window.alert('请先在设置中创建并选择账号'); return; }
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
  // 首次使用且没有任何账号：引导到「数据与设置」页创建第一个账号（M1-2）
  if (App.accounts.length === 0) location.hash = '#settings';
  renderRoute();
  refreshNotify();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}

export { renderRoute, boot };