// 朝暮 · 移动版启动器
// 只读复用 app/js/lib 业务层与 app/js/ui/modal.js；本文件与 mobile/views 均为新增，不修改 app/、desktop/。
import { createRepository, IdbAdapter, MemoryAdapter } from '../../app/js/lib/db.js';
import { AppState } from '../../app/js/appstate.js';
import { todayStr } from '../../app/js/lib/utils.js';
import { Accounts } from '../../app/js/lib/accounts.js';
import { Group } from '../../app/js/lib/group.js';
import { openModal, openConfirm, openPrompt } from '../../app/js/ui/modal.js';
import { normalizeTheme, THEME_OPTIONS } from '../../app/js/lib/theme.js';
import { Ledger } from '../../app/js/lib/ledger.js';
import { ensureCardsReady } from './lib/ledgerinit.js';
import { loadBackupForAccount } from './lib/importadapt.js';
import { listNotices, pendingCount, markRead, kindLabel, formatNoticeTime } from './lib/notifycenter.js';
import { permissionOf, permissionHint, requestPermission, setAppBadge, publishNotice } from './lib/push.js';
import { maybeAskNotifyPrompt } from './lib/notifyprompt.js';
import { syncAll as syncPlanReminders, startTicker as startRemindTicker } from './lib/remind.js';
import { Backup } from '../../app/js/lib/backup.js';
import { showToast } from '../../app/js/ui/toast.js';
import { MENU_ITEMS, accountMenuHTML, openAccountMenu, closeAccountMenu } from './accountmenu.js';
import { openPasswordChange as openPasswordChangeModal } from './password.js';

import home from './views/home.js';
import today from './views/today.js';
import devwork from './views/devwork.js';
import group from './views/group.js';
import quiz from './views/quiz.js';
import ledger from './views/ledger.js';

// 移动版独立 IndexedDB 库名，与电脑版默认库 worklife 物理隔离；备份 JSON 格式一致可互导。
const DB_NAME = 'worklife-mobile';
const PREF_KEY = 'worklife-mobile.prefs';

const MODULES = { home, today, devwork, group, quiz, ledger };

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
  const n = accId && App.repo ? await pendingCount(App.repo, accId) : 0;
  badge.textContent = String(n);
  badge.hidden = n <= 0;
  setAppBadge(n);
  return n;
}

// 通知中心：铃铛里汇总计划 / 开发 / 同组的全部通知
export async function openNotifyCenter() {
  const accId = AppState.currentAccountId;
  if (!accId) { showToast('请先登录账号'); return; }
  let perm = permissionOf();
  const ctl = openModal({ title: '通知', footer: false, bodyHTML: '<div data-el="notifyList"><div class="muted">加载中…</div></div>' });
  const box = ctl.body.querySelector('[data-el="notifyList"]');

  function permHTML() {
    const hint = `<span class="muted" style="font-size:12px;flex:1;min-width:0">${escapeHtml(permissionHint(perm))}</span>`;
    return `<div class="row" style="gap:8px;margin-bottom:10px;align-items:center">${hint}${
      perm === 'granted' || perm === 'unsupported' ? '' : '<button class="btn sm primary" data-act="enablePush">开启手机通知</button>'}</div>`;
  }

  async function renderList() {
    const rows = await listNotices(App.repo, accId);
    const todo = rows.filter((n) => n.refType && n.refId).length;
    const head = permHTML();
    if (!rows.length) {
      box.innerHTML = `${head}<div class="empty">暂无通知。</div>`;
      return;
    }
    box.innerHTML = `${head}
      <div class="row between" style="margin-bottom:10px">
        <span class="muted">共 ${todo} 条待办<br><span style="font-size:11px">只显示未完成 / 进行中的内容，做完就自动消失</span></span>
      </div>
      ${rows.map((n) => `
        <div class="list-item" data-id="${n.id}">
          <div class="row between">
            <span class="tag ${n.kind === 'dev' ? 'warn' : n.kind === 'group' ? 'ok' : ''}">${kindLabel(n)}</span>
            <span class="muted" style="font-size:12px">${formatNoticeTime(n.createdAt)}</span>
          </div>
          <div style="margin-top:6px;font-weight:600;font-size:14px">${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="muted" style="font-size:12px;margin-top:2px">${escapeHtml(n.body)}</div>` : ''}
        </div>`).join('')}`;
  }

  ctl.overlay.addEventListener('click', async (e) => {
    const t = e.target.closest ? e.target.closest('[data-act]') : null;
    const act = t ? t.dataset.act : null;
    if (act === 'enablePush') {
      perm = await requestPermission();
      await renderList();
      if (perm === 'granted') {
        const welcome = {
          id: 'notice_welcome_' + Date.now().toString(36),
          title: '通知已开启',
          body: '铃铛里的计划、开发、同组通知都会出现在手机通知栏',
          createdAt: Date.now(),
        };
        // 刚授权的这一拍权限状态可能还没同步，失败就稍后重试一次
        const sent = await publishNotice(welcome);
        if (!sent) setTimeout(() => { publishNotice(welcome); }, 600);
        showToast('已开启手机通知');
      } else {
        showToast(permissionHint(perm));
      }
    }
  });
  await renderList();
  // 同组消息看过就算处理完（不影响计划/任务/Bug，它们的消失只跟完成有关）
  for (const n of await listNotices(App.repo, accId)) {
    if (!n.refType && !n.read) await markRead(App.repo, n.id);
  }
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
// ---------- 账号弹窗（对齐电脑版 app.js：只承担登录 / 注册，登录后的能力收敛到顶栏账号菜单） ----------
async function openAccountManager() {
  const ctl = openModal({ title: '账号管理', footer: false,
    bodyHTML: `<div class="row" style="gap:8px;margin-bottom:10px">
      <button class="btn primary" data-act="tabLogin">登录</button>
      <button class="btn" data-act="tabRegister">注册</button></div>
      <div data-el="panel"></div>
      <div class="field-error" data-el="formError" role="alert" aria-live="polite" hidden></div>` });
  if (!ctl) return;
  let mode = 'login';
  function setFormError(msg) {
    const el = ctl.body.querySelector('[data-el="formError"]');
    if (!el) return;
    el.textContent = String(msg == null ? '' : msg);
    if (msg) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  }
  function renderPanel() {
    const panel = ctl.body.querySelector('[data-el="panel"]');
    if (panel) panel.innerHTML = mode === 'register' ? registerPanelHTML() : loginPanelHTML(App.accounts);
    ctl.overlay.querySelectorAll('[data-act="tabLogin"],[data-act="tabRegister"]').forEach((b) => {
      b.classList.toggle('primary', b.dataset.act === (mode === 'register' ? 'tabRegister' : 'tabLogin'));
    });
  }
  ctl.overlay.addEventListener('click', async (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    try {
      if (act === 'tabLogin') { mode = 'login'; renderPanel(); }
      else if (act === 'tabRegister') { mode = 'register'; renderPanel(); }
      else if (act === 'doLogin') {
        App.accounts = await Accounts.list(App.repo);
        const sel = ctl.body.querySelector('[data-f="loginUser"]');
        const uid = sel && sel.value;
        if (!uid) { setFormError('请选择要登录的账号'); return; }
        const acc = App.accounts.find((a) => a.id === uid);
        const pwdInput = ctl.body.querySelector('[data-f="loginPwd"]');
        if (acc && acc.passwordHash) {
          const pwd = pwdInput ? pwdInput.value : '';
          if (!await Accounts.verify(App.repo, uid, pwd)) {
            if (pwdInput) { pwdInput.value = ''; pwdInput.focus(); }
            setFormError('密码错误，请重新输入');
            return;
          }
        }
        setFormError('');
        AppState.set({ currentAccountId: uid, loggedOut: false });
        await refreshAccounts();
        ctl.close();
      } else if (act === 'create') {
        const name = ctl.body.querySelector('[data-f="name"]').value;
        const pwd = ctl.body.querySelector('[data-f="pwd"]').value;
        setFormError('');
        const created = await Accounts.create(App.repo, { name, password: pwd });
        AppState.set({ currentAccountId: (created && created.id) || AppState.currentAccountId, loggedOut: false });
        await refreshAccounts();
        ctl.close();
      }
    } catch (err) { setFormError(err && err.message ? err.message : String(err)); }
  });
  App.accounts = await Accounts.list(App.repo);
  renderPanel();
}

// ---------- 顶栏账号菜单的 7 个动作（顺序与文案对齐电脑版 ui/accountmenu.js） ----------
async function runMenuAction(act) {
  try {
    if (act === 'theme') return openGeneralSettings();
    if (act === 'export') return exportData();
    if (act === 'import') return openLoadData();
    if (act === 'clear') return openClearData();
    if (act === 'logout') return doLogout();
    if (act === 'pwd') return openPasswordChange();
    if (act === 'rename') return openRename();
  } catch (err) { showToast('操作失败：' + ((err && err.message) || err)); }
}

// 导出数据：整库导出为 JSON 并下载（文件名与电脑版一致）
async function exportData() {
  const dump = await Backup.exportAll(App.repo);
  const text = JSON.stringify(dump, null, 2);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const filename = `worklife-backup-${stamp}.json`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('已导出数据');
  return { filename, text };
}

// 加载数据：选文件后二选「合并加载 / 覆盖加载」
function openLoadData() {
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
    const ctl = openModal({ title: '加载数据', footer: false,
      bodyHTML: `<div class="muted" style="margin-bottom:12px">「覆盖加载」会先清空现有数据再写入；「合并加载」保留现有数据。</div>
        <div class="row wrap" style="gap:8px"><button class="btn" data-act="merge">合并加载</button>
        <button class="btn primary" data-act="replace">覆盖加载</button></div>` });
    ctl.overlay.addEventListener('click', async (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act !== 'merge' && act !== 'replace') return;
      ctl.close();
      try {
        const res = await loadBackupForAccount(App.repo, text, { mode: act === 'replace' ? 'replace' : 'merge', accountId: AppState.currentAccountId });
        await refreshAccounts();
        renderRoute();
        showToast(`已加载数据，共 ${res.imported} 条记录`);
      } catch (err) { showToast('加载失败：' + err.message); }
    });
  });
  input.click();
}

// 清空数据：清空全部业务数据，账号保留
function openClearData() {
  return openConfirm({ title: '清空数据', confirmText: '清空',
    message: '将清空今日计划、每日记账、开发工作、题库、同组计划的全部数据，账号保留。此操作不可撤销。',
    onConfirm: async () => {
      await Backup.clearBusinessData(App.repo);
      await refreshAccounts();
      renderRoute();
      showToast('已清空数据');
    } });
}

async function doLogout() {
  AppState.set({ currentAccountId: null, loggedOut: true });
  await refreshAccounts();
  showToast('已退出登录');
}

// 修改密码：窗口与校验由 password.js 提供，账号菜单与设置入口共用同一份
function openPasswordChange() {
  return openPasswordChangeModal({ repo: App.repo, app: App, onDone: () => refreshAccounts() });
}

// 更改名字：作用于当前登录账号
function openRename() {
  const id = AppState.currentAccountId;
  if (!id) { showToast('请先登录账号'); return; }
  const acc = App.accounts.find((a) => a.id === id);
  openPrompt({ title: '更改名字', label: '新名称', placeholder: acc ? acc.name : '', submitText: '保存',
    onSubmit: async (value) => {
      if (!String(value == null ? '' : value).trim()) return true;
      await Accounts.rename(App.repo, id, value);
      await refreshAccounts();
      showToast('已更改名字');
      return false;
    } });
}

// 主题设置（对齐电脑版「通用设置」窗口）：主题 / 默认打开页 / 站内提醒 / 记账初始卡片管理
function openGeneralSettings() {
  const prefs = App.prefs || {};
  const ctl = openModal({ title: '通用设置', footer: false,
    bodyHTML: `
      <div class="field"><label>主题</label><select data-f="theme"></select></div>
      <div class="field"><label>默认打开页</label><select data-f="defaultRoute"></select></div>
      <label class="option-row"><input type="checkbox" data-f="notify"><span>站内提醒（顶部铃铛显示未读）</span></label>
      <div class="row between" style="margin:10px 0 6px">
        <div class="muted">记账初始卡片管理</div>
        <button class="btn sm" data-act="addInitCard">新增初始卡片</button>
      </div>
      <div data-el="ledgerCards"></div>` });
  if (!ctl) return null;

  const themeSel = ctl.body.querySelector('[data-f="theme"]');
  const curTheme = normalizeTheme(prefs.theme);
  THEME_OPTIONS.forEach(([val, txt]) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = txt; if (curTheme === val) o.selected = true;
    themeSel.appendChild(o);
  });
  themeSel.onchange = () => {
    prefs.theme = themeSel.value;
    if (typeof App.savePrefs === 'function') App.savePrefs(prefs);
    document.documentElement.setAttribute('data-theme', normalizeTheme(prefs.theme));
  };

  const homeSel = ctl.body.querySelector('[data-f="defaultRoute"]');
  [['home', '首页总览'], ['today', '今日计划'], ['devwork', '开发工作'], ['group', '同组计划'], ['quiz', '题库'], ['ledger', '每日记账']]
    .forEach(([val, txt]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = txt; if ((prefs.defaultRoute || 'home') === val) o.selected = true;
      homeSel.appendChild(o);
    });
  homeSel.onchange = () => { prefs.defaultRoute = homeSel.value; if (typeof App.savePrefs === 'function') App.savePrefs(prefs); };

  const notifyChk = ctl.body.querySelector('[data-f="notify"]');
  notifyChk.checked = prefs.notify !== false;
  notifyChk.onchange = () => { prefs.notify = notifyChk.checked; if (typeof App.savePrefs === 'function') App.savePrefs(prefs); };

  // 新增初始卡片：preset=true，每一天都会出现在记账页
  const addInitBtn = ctl.body.querySelector('[data-act="addInitCard"]');
  if (addInitBtn) addInitBtn.onclick = () => {
    const accId = AppState.currentAccountId;
    if (!accId) { showToast('请先登录账号'); return; }
    openPrompt({ title: '新增初始卡片', label: '卡片名称', placeholder: '如：交通', submitText: '添加',
      onSubmit: async (value) => {
        const name = String(value == null ? '' : value).trim();
        if (!name) return true;
        try { await Ledger.addInitialCard(App.repo, accId, name); await refreshCards(); if (AppState.emit) AppState.emit(); } catch (e) { showToast(e.message); }
        return false;
      } });
  };

  const box = ctl.body.querySelector('[data-el="ledgerCards"]');
  async function refreshCards() {
    if (!box) return;
    const accId = AppState.currentAccountId;
    box.innerHTML = '';
    if (!accId) { box.innerHTML = '<div class="muted">请先登录账号。</div>'; return; }
    await ensureCardsReady(App.repo, accId);
    const cards = (await Ledger.listCards(App.repo, accId)).filter((c) => c.preset === true);
    if (!cards.length) { box.innerHTML = '<div class="empty">暂无初始卡片，点上方「新增初始卡片」添加。</div>'; return; }
    cards.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'member-row';
      const label = document.createElement('span');
      label.style.flex = '1'; label.textContent = c.name;
      const rn = document.createElement('button');
      rn.className = 'btn sm'; rn.textContent = '改名';
      rn.onclick = () => openPrompt({ title: '改名', label: '新名称', placeholder: c.name, submitText: '保存',
        onSubmit: async (n) => {
          if (!String(n || '').trim()) return true;
          try { await Ledger.renameCard(App.repo, c.id, n); await refreshCards(); if (AppState.emit) AppState.emit(); } catch (e) { showToast(e.message); }
          return false;
        } });
      const rm = document.createElement('button');
      rm.className = 'btn sm danger'; rm.textContent = '删除';
      rm.onclick = () => openConfirm({ title: '删除卡片', confirmText: '删除', message: '删除该卡片会同时删除其记录，确定？',
        onConfirm: async () => { await Ledger.removeCard(App.repo, c.id); await refreshCards(); if (AppState.emit) AppState.emit(); } });
      row.append(label, rn, rm); box.appendChild(row);
    });
  }
  refreshCards();
  return ctl;
}

function bindTopbar() {
  const btn = document.getElementById('accountBtn');
  if (btn) btn.addEventListener('click', () => {
    if (AppState.currentAccountId) openAccountMenu({ app: App, anchor: btn, onAction: runMenuAction });
    else openAccountManager();
  });
  const bell = document.getElementById('notifyBell');
  if (bell) bell.addEventListener('click', () => { openNotifyCenter(); });
  document.querySelectorAll('#tabbar .tab').forEach((b) => {
    b.addEventListener('click', () => { location.hash = '#' + b.dataset.route; });
  });
}

let lastAccId = null;
let syncTimer = null;

// 计划提醒跟着数据变：切账号、增删改、勾选完成后都重排一遍（装成 App 时重设系统闹钟）
function scheduleSyncReminders(delay) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const accId = AppState.currentAccountId;
    if (!accId || !App.repo) return;
    syncPlanReminders(App.repo, { accountId: accId }).catch(() => {});
  }, delay == null ? 1500 : delay);
}

function bindState() {
  AppState.subscribe(async () => {
    if (!App.repo) return;
    await refreshNotify();
    if (AppState.currentAccountId !== lastAccId) { lastAccId = AppState.currentAccountId; renderRoute(); }
    scheduleSyncReminders();
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

  // 第一次进入：问一次要不要把提醒推到通知栏，问过就不再弹；
  // 顺手把已有的计划提醒排上（装成 App 交给系统闹钟，浏览器里靠页面内定时器）
  setTimeout(() => {
    maybeAskNotifyPrompt({ storage: localStorage }).catch(() => {});
    scheduleSyncReminders(0);
    startRemindTicker({ interval: 30000 });
  }, 1600);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') boot();
export { renderRoute, boot, MENU_ITEMS, accountMenuHTML, closeAccountMenu };
export { passwordChangeError, passwordChangeHTML, passwordChangeResetState } from './password.js';
