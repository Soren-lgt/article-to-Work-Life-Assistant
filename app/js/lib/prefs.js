// AI生成
// 本地偏好读写（主题 / 默认打开页 / 站内提醒），从原「数据与设置」模块抽出，供顶栏账号菜单与启动流程共用
import { normalizeTheme } from './theme.js';

const PREF_KEY = 'worklife.prefs';

// 默认打开页可选路由（「数据与设置」模块已移除，不再出现在这里）
export const ROUTE_OPTIONS = [
  ['home', '首页总览'],
  ['today', '今日计划'],
  ['devwork', '开发工作'],
  ['group', '同组计划'],
  ['quiz', '题库'],
  ['ledger', '每日记账'],
];

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}

export function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 无 localStorage 时忽略 */ }
}

export function applyTheme(theme) {
  const norm = normalizeTheme(theme);
  const legacyDark = theme === 'dark';
  const darkOn = legacyDark || norm === 'night';
  try {
    const dataVal = (theme === 'dark' || theme === 'light') ? theme : norm;
    document.documentElement.setAttribute('data-theme', dataVal);
  } catch { /* ignore */ }
  try { document.body.classList.toggle('dark', darkOn); } catch { /* ignore */ }
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
