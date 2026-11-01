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
    onDocument = null,
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
  const onMaskClose = (e) => { if (isOverlayClick(overlay, e.target)) close(); };
  overlay.addEventListener("mousedown", onMaskClose);
  overlay.addEventListener("click", onMaskClose);
  if (typeof onDocument === "function") overlay.addEventListener("click", (e) => onDocument(e));
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

// 纯函数：确认弹窗正文（保留原提示文本与格式，不增删内容）
export function confirmMessageHTML(message = "") {
  return `<div>${message}</div>`;
}

// 纯函数：输入弹窗字段；secret=true 为密文密码框
export function promptFieldHTML(secret = false, placeholder = "") {
  return `<input data-f="v" type="${secret ? "password" : "text"}" placeholder="${placeholder}">`;
}

// 便捷：确认弹窗（替代原生 confirm），点确认执行 onConfirm 后自动关闭
export function openConfirm(options = {}) {
  const { title = "提示", message = "", confirmText = "确定", cancelText = "取消", onConfirm = null } = options;
  return openModal({
    title,
    submitText: confirmText,
    cancelText,
    bodyHTML: confirmMessageHTML(message),
    onSubmit: async () => {
      if (typeof onConfirm === "function") await onConfirm();
      return false;
    },
  });
}

// 便捷：单输入弹窗（替代原生 prompt）；onSubmit(值) 返回 true 保持，false 关闭
export function openPrompt(options = {}) {
  const {
    title = "输入", label = "", placeholder = "", secret = false,
    submitText = "确定", onSubmit = null,
  } = options;
  const ctl = openModal({
    title,
    submitText,
    cancelText: "取消",
    bodyHTML: `<label>${label}</label>` + promptFieldHTML(secret, placeholder),
    onSubmit: async () => {
      const value = ctl.body.querySelector("[data-f=\"v\"]").value;
      if (typeof onSubmit === "function") return Boolean(await onSubmit(value));
      return false;
    },
  });
  return ctl;
}