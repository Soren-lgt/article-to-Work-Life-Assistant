// AI生成
// 轻量桌面提示条：代替原生 alert（Electron 里原生弹窗会抢走渲染进程焦点）
let hideTimer = null;

export function showToast(message, { duration = 1800 } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  const old = document.querySelector('[data-el="toast"]');
  if (old) old.remove();
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.el = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = String(message == null ? '' : message);
  document.body.appendChild(el);
  hideTimer = setTimeout(() => { el.remove(); hideTimer = null; }, duration);
  return el;
}
