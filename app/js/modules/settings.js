// AI生成
// 数据与设置：数据概览 / 备份导出 / 恢复导入 / 数据清理 / 通用设置
// 账号管理已收纳到顶栏“登录/账号名”弹窗（app.js），本页不再展示账号卡片。
import { Backup } from '../lib/backup.js';
import { Ledger } from '../lib/ledger.js';

const PREF_KEY = 'worklife.prefs';

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
export function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 无 localStorage 时忽略 */ }
}

const MODULE_LABELS = {
  today: '首页·今日计划与备忘',
  ledger: '每日记账',
  devwork: '开发工作',
  quiz: '题库',
  group: '同组计划',
  accounts: '账号',
};

export function applyTheme(theme) {
  const dark = theme === 'dark';
  try { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  try { document.body.classList.toggle('dark', dark); } catch { /* ignore */ }
}

export function ensureThemeCss() {
  if (document.getElementById('theme-css')) return;
  const style = document.createElement('style');
  style.id = 'theme-css';
  style.textContent = `
    html[data-theme="dark"] { --bg:#1e1f22; --card:#2a2b2f; --fg:#e6e6e6; --muted:#9aa0a6; --line:#3a3b40; --accent:#5b8def; }
    html[data-theme="dark"] body { background:var(--bg); color:var(--fg); }
    html[data-theme="dark"] .card { background:var(--card); }
    html[data-theme="dark"] input, html[data-theme="dark"] textarea, html[data-theme="dark"] select { background:#232427; color:var(--fg); border-color:var(--line); }`;
  document.head.appendChild(style);
}

export default {
  route: 'settings',
  title: '数据与设置',
  mount(el, ctx) { render(el, ctx); },
};

function render(el, ctx) {
  const { repo, app } = ctx;
  el.innerHTML = '';
  const prefs = loadPrefs();
  ensureThemeCss();
  applyTheme(prefs.theme || 'light');

  // ---------- 数据概览 ----------
  const statCard = document.createElement('div');
  statCard.className = 'card';
  statCard.innerHTML = '<h3 style="margin-top:0">数据概览</h3>';
  const statBox = document.createElement('div');
  statCard.appendChild(statBox);

  async function refreshStats() {
    const stats = await Backup.stats(repo);
    const rows = Object.entries(Backup.MODULES).map(([key, stores]) => {
      const n = stores.reduce((s, name) => s + (stats[name] || 0), 0);
      return `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)">
        <span>${MODULE_LABELS[key] || key}</span><span class="muted">${n} 条</span></div>`;
    });
    statBox.innerHTML = rows.join('');
  }

  // ---------- 备份 / 恢复 ----------
  const bakCard = document.createElement('div');
  bakCard.className = 'card';
  bakCard.innerHTML = '<h3 style="margin-top:0">备份与恢复</h3>';
  const bakRow = document.createElement('div');
  bakRow.className = 'row';
  bakRow.style.gap = '8px';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn primary'; exportBtn.textContent = '导出备份文件';
  exportBtn.addEventListener('click', async () => {
    try {
      const dump = await Backup.exportAll(repo);
      const text = JSON.stringify(dump, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      a.href = url;
      a.download = `worklife-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      window.alert('已导出备份文件。');
    } catch (e) { window.alert(e.message); }
  });
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  const importBtn = document.createElement('button');
  importBtn.className = 'btn'; importBtn.textContent = '从备份文件恢复';
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const mode = window.confirm('点「确定」= 覆盖恢复（清空现有数据）；点「取消」= 合并导入（保留现有数据）。') ? 'replace' : 'merge';
    try {
      const text = await file.text();
      const res = await Backup.importFromText(repo, text, { mode });
      await app.refreshAccounts();
      await refreshAll();
      window.alert(`恢复完成，共导入 ${res.imported} 条记录。`);
    } catch (e) { window.alert('恢复失败：' + e.message); }
    fileInput.value = '';
  });
  bakRow.append(exportBtn, importBtn, fileInput);
  bakCard.appendChild(bakRow);

  // ---------- 数据清理 ----------
  const cleanCard = document.createElement('div');
  cleanCard.className = 'card';
  cleanCard.innerHTML = '<h3 style="margin-top:0">数据清理</h3>';
  const cleanRow = document.createElement('div');
  cleanRow.className = 'row';
  cleanRow.style.gap = '8px';
  cleanRow.style.flexWrap = 'wrap';
  for (const [key, label] of Object.entries(MODULE_LABELS)) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = `清空：${label}`;
    b.addEventListener('click', async () => {
      if (!window.confirm(`确定清空「${label}」的全部数据？此操作不可撤销。`)) return;
      await Backup.clearModule(repo, key);
      await refreshAll();
      window.alert('已清空。');
    });
    cleanRow.appendChild(b);
  }
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn danger'; resetBtn.textContent = '整体重置（清空全部数据）';
  resetBtn.addEventListener('click', async () => {
    if (!window.confirm('确定清空全部数据？这会删除所有账号、计划、记账、任务、题库与小组数据。')) return;
    if (!window.confirm('再次确认：整体重置不可撤销，是否继续？')) return;
    await Backup.resetAll(repo);
    await app.refreshAccounts();
    await refreshAll();
    window.alert('已整体重置。');
  });
  cleanCard.append(cleanRow, resetBtn);

  // ---------- 通用设置 ----------
  const prefCard = document.createElement('div');
  prefCard.className = 'card';
  prefCard.innerHTML = '<h3 style="margin-top:0">通用设置</h3>';
  const prefBox = document.createElement('div');

  const themeRow = document.createElement('div');
  themeRow.className = 'row'; themeRow.style.marginBottom = '8px';
  themeRow.innerHTML = '<span style="flex:1">主题</span>';
  const themeSel = document.createElement('select');
  for (const [val, txt] of [['light', '浅色'], ['dark', '深色']]) {
    const o = document.createElement('option');
    o.value = val; o.textContent = txt; if ((prefs.theme || 'light') === val) o.selected = true;
    themeSel.appendChild(o);
  }
  themeSel.addEventListener('change', () => {
    prefs.theme = themeSel.value; savePrefs(prefs); applyTheme(prefs.theme);
  });
  themeRow.appendChild(themeSel);

  const homeRow = document.createElement('div');
  homeRow.className = 'row'; homeRow.style.marginBottom = '8px';
  homeRow.innerHTML = '<span style="flex:1">默认打开页</span>';
  const homeSel = document.createElement('select');
  for (const [val, txt] of [['home', '首页总览'], ['today', '今日计划'], ['devwork', '开发工作'], ['group', '同组计划'], ['quiz', '题库'], ['ledger', '每日记账'], ['settings', '数据与设置']]) {
    const o = document.createElement('option');
    o.value = val; o.textContent = txt; if ((prefs.defaultRoute || 'home') === val) o.selected = true;
    homeSel.appendChild(o);
  }
  homeSel.addEventListener('change', () => { prefs.defaultRoute = homeSel.value; savePrefs(prefs); });
  homeRow.appendChild(homeSel);

  const notifyRow = document.createElement('div');
  notifyRow.className = 'row'; notifyRow.style.marginBottom = '8px';
  notifyRow.innerHTML = '<span style="flex:1">站内提醒（顶部铃铛显示未读）</span>';
  const notifyChk = document.createElement('input');
  notifyChk.type = 'checkbox';
  notifyChk.checked = prefs.notify !== false;
  notifyChk.addEventListener('change', () => { prefs.notify = notifyChk.checked; savePrefs(prefs); });
  notifyRow.appendChild(notifyChk);

  prefBox.append(themeRow, homeRow, notifyRow);

  // 记账初始卡片管理
  const cardTitle = document.createElement('div');
  cardTitle.className = 'muted';
  cardTitle.style.margin = '10px 0 6px';
  cardTitle.textContent = '记账初始卡片管理';
  const cardBox = document.createElement('div');
  prefBox.append(cardTitle, cardBox);

  async function refreshCards() {
    cardBox.innerHTML = '';
    const accId = app.state.currentAccountId;
    if (!accId) { cardBox.innerHTML = '<div class="muted">请先在右上角登录账号。</div>'; return; }
    await Ledger.ensureDefaultCards(repo, accId);
    const cards = (await Ledger.listCards(repo, accId)).filter((c) => c.preset === true);
    for (const c of cards) {
      const row = document.createElement('div');
      row.className = 'row'; row.style.marginBottom = '6px';
      const label = document.createElement('span');
      label.style.flex = '1'; label.textContent = c.name;
      const rn = document.createElement('button');
      rn.className = 'btn'; rn.textContent = '改名';
      rn.addEventListener('click', async () => {
        const n = window.prompt('新名称', c.name);
        if (n == null) return;
        try { await Ledger.renameCard(repo, c.id, n); await refreshCards(); } catch (e) { window.alert(e.message); }
      });
      const rm = document.createElement('button');
      rm.className = 'btn danger'; rm.textContent = '删除';
      rm.addEventListener('click', async () => {
        if (!window.confirm('删除该卡片会同时删除其记录，确定？')) return;
        await Ledger.removeCard(repo, c.id);
        await refreshCards();
      });
      row.append(label, rn, rm);
      cardBox.appendChild(row);
    }
    
  }

  prefCard.appendChild(prefBox);

  el.append(statCard, bakCard, cleanCard, prefCard);

  async function refreshAll() {
    await refreshStats();
    await refreshCards();
  }
  refreshAll();
}