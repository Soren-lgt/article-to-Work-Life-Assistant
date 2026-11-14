// AI生成
// 账号相关的纯展示函数：登录弹窗与顶栏账号下拉菜单共用（不依赖 DOM，可在 Node 测试）
// P5：账号列表不在登录界面出现；改名 / 修改密码 / 退出等入口在顶栏账号下拉菜单。

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 纯函数：密码输入框（密文，type=password），data 名与占位文案可配
export function passwordFieldHTML(placeholder = "请输入密码", dataF = "pwd") {
  return `<input data-f="${dataF}" type="password" autocomplete="new-password" placeholder="${placeholder}">`;
}

// 纯函数：表单内联错误提示（空消息时隐藏）。用它替代原生 alert，避免弹窗失去焦点、
// 输入框点不动（Electron 桌面版尤其明显）。
export function formErrorHTML(message = "") {
  const msg = String(message == null ? "" : message);
  return `<div class="acc-error" data-el="formError" role="alert" aria-live="polite"${msg ? "" : " hidden"}>${escapeHtml(msg)}</div>`;
}

// 纯函数：是否处于登录态（决定当前账号行是否显示退出按钮）
export function logoutButtonVisible(currentId) { return Boolean(currentId); }

// 纯函数：退出按钮片段（仅渲染在当前账号操作行）
export function logoutActionButtonHTML() {
  return '<button class="btn danger" data-act="logout">退出</button>';
}

// 纯函数：账号管理列表行（当前账号显示退出，其余账号显示登录；含改名/修改密码/删除）
export function accountListHTML(accounts, currentId) {
  if (!accounts.length) return '<div class="muted">还没有账号，请先点右上角「登录」注册。</div>';
  return accounts.map((a) => {
    const active = a.id === currentId;
    return `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
      <span style="flex:1">${escapeHtml(a.name)}${active ? ' <span class="muted">[当前]</span>' : ''}${a.passwordHash ? ' 🔒' : ''}</span>
      <span class="row" style="gap:6px">
        ${active ? '' : `<button class="btn" data-act="switch" data-id="${a.id}">登录</button>`}
        ${active ? logoutActionButtonHTML() : ''}
        <button class="btn" data-act="rename" data-id="${a.id}" data-name="${escapeHtml(a.name)}">改名</button>
        <button class="btn" data-act="pwd" data-id="${a.id}">修改密码</button>
        <button class="btn danger" data-act="del" data-id="${a.id}" data-name="${escapeHtml(a.name)}">删除</button>
      </span>
    </div>`;
  }).join('');
}
