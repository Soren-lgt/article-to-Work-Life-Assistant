// AI生成
// 通用模态框：可靠打开与关闭。关闭即从 DOM 移除并解绑，避免多次打开后残留、点不掉。
// onSubmit(close)：提交回调；返回真值表示由回调自行控制关闭，否则提交后自动关闭。

// 纯函数：仅当点击落在遮罩层本身（而非弹窗内容）时才允许关闭
export function isOverlayClick(overlay, target) {
  return Boolean(overlay) && target === overlay;
}

export function openModal(options = {}) {
  const doc = options.document || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const {
    title = "",
    bodyHTML = "",
    submitText = "确定",
    cancelText = "取消",
    footer = true,
    onSubmit = null,
    onClose = null,
  } = options;

  const overlay = doc.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-head">
        <strong>${title}</strong>
        <button type="button" class="modal-x" data-m-close aria-label="关闭">&times;</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footer ? `<div class="modal-foot">
        <button type="button" class="btn" data-m-cancel>${cancelText}</button>
        <button type="button" class="btn primary" data-m-submit>${submitText}</button>
      </div>` : ""}
    </div>`;

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    if (overlay.parentNode && typeof overlay.parentNode.removeChild === "function") {
      overlay.parentNode.removeChild(overlay);
    }
    if (typeof overlay.remove === "function") overlay.remove();
    if (typeof onClose === "function") onClose();
  }

  const q = (sel) => overlay.querySelector(sel);
  overlay.addEventListener("mousedown", (e) => { if (isOverlayClick(overlay, e.target)) close(); });
  const cancelBtn = q("[data-m-cancel]");
  const closeBtn = q("[data-m-close]");
  const submitBtn = q("[data-m-submit]");
  if (cancelBtn) cancelBtn.addEventListener("click", close);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (submitBtn) submitBtn.addEventListener("click", async () => {
    let selfHandled = false;
    if (typeof onSubmit === "function") {
      try { selfHandled = Boolean(await onSubmit(close)); } catch (err) { if (typeof window !== "undefined" && window.alert) window.alert(err.message); }
    }
    if (!selfHandled) close();
  });

  if (doc.body && typeof doc.body.appendChild === "function") doc.body.appendChild(overlay);
  return { close, overlay, body: q(".modal-body"), closed: () => closed };
}