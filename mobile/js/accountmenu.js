// 工作生活助手 · 移动版账号下拉菜单
// 与电脑版 app/js/ui/accountmenu.js 对齐：同样的 7 个菜单项、同样的顺序与文案；
// 仅定位/容器使用移动端（挂在顶栏账号按钮下方），具体动作由 main.js 提供，不改 app/、desktop/。

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

let menuEl = null;
let menuAnchor = null;
let docCloseHandler = null;

export function closeAccountMenu() {
  if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
  menuEl = null;
  menuAnchor = null;
  if (docCloseHandler) {
    document.removeEventListener('mousedown', docCloseHandler);
    document.removeEventListener('touchstart', docCloseHandler);
    docCloseHandler = null;
  }
}

// 点账号名：展开/收起下拉菜单。onAction(act) 由调用方处理具体动作。
export function openAccountMenu({ app, anchor, onAction } = {}) {
  if (typeof document === 'undefined' || !anchor) return null;
  if (menuEl && menuAnchor === anchor) { closeAccountMenu(); return null; }
  closeAccountMenu();

  const accId = app && app.state ? app.state.currentAccountId : null;
  const acc = ((app && app.accounts) || []).find((a) => a.id === accId);
  const el = document.createElement('div');
  el.className = 'acc-menu';
  el.dataset.el = 'accMenu';
  el.setAttribute('role', 'menu');
  el.innerHTML = accountMenuHTML(acc ? acc.name : '');
  document.body.appendChild(el);

  const rect = anchor.getBoundingClientRect();
  el.style.top = Math.round(rect.bottom + 6) + 'px';
  el.style.right = Math.max(8, Math.round(window.innerWidth - rect.right)) + 'px';

  el.addEventListener('click', (e) => {
    const act = e.target && e.target.dataset ? e.target.dataset.act : null;
    if (!act) return;
    closeAccountMenu();
    if (typeof onAction === 'function') onAction(act);
  });

  docCloseHandler = (e) => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closeAccountMenu();
  };
  setTimeout(() => {
    if (docCloseHandler) {
      document.addEventListener('mousedown', docCloseHandler);
      document.addEventListener('touchstart', docCloseHandler);
    }
  }, 0);

  menuEl = el;
  menuAnchor = anchor;
  return el;
}
