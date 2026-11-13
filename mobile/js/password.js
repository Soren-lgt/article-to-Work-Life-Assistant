// 工作生活助手 · 移动版修改密码（电脑版与手机版共用同一套三框校验与文案）
// 供顶栏账号菜单与「设置 → 数据与设置」两处调用；不修改 app/、desktop/。
import { Accounts } from '../../app/js/lib/accounts.js';
import { openModal } from '../../app/js/ui/modal.js';
import { showToast } from '../../app/js/ui/toast.js';

// 纯函数：修改密码窗口——三个密文框（提示文字写在框内 placeholder）+ 修改按钮
export function passwordChangeHTML() {
  return `
    <div class="field"><label>旧密码</label><input data-f="oldPwd" type="password" autocomplete="off" placeholder="旧密码"></div>
    <div class="field"><label>新密码</label><input data-f="newPwd" type="password" autocomplete="new-password" placeholder="新密码"></div>
    <div class="field"><label>确定密码</label><input data-f="confirmPwd" type="password" autocomplete="new-password" placeholder="确定密码"></div>
    <div class="field-error" data-el="pwdError" role="alert" aria-live="polite" hidden></div>
    <button class="btn primary block" data-act="changePwd">修改</button>`;
}

// 纯函数：旧密码错 / 新密码为空 / 两次不一致，返回空串代表通过
export function passwordChangeError(oldOk, next, confirm) {
  if (!oldOk) return '旧密码不正确';
  if (!String(next == null ? '' : next).trim()) return '新密码不能为空';
  if (next !== confirm) return '两次输入的密码不一致';
  return '';
}

// 纯函数：失败后密码框恢复的初始状态（三个框清空）
export function passwordChangeResetState() {
  return { oldPwd: '', newPwd: '', confirmPwd: '' };
}

// 打开修改密码窗口；成功后关闭窗口、轻提示，并回调 onDone（刷新账号信息）
export function openPasswordChange({ repo, app, accountId, onDone } = {}) {
  const id = accountId || (app && app.state ? app.state.currentAccountId : null);
  if (!id) { showToast('请先登录账号'); return null; }
  const ctl = openModal({ title: '修改密码', footer: false, bodyHTML: passwordChangeHTML() });
  if (!ctl) return null;

  const bodyEl = ctl.body;
  const errEl = bodyEl.querySelector('[data-el="pwdError"]');
  const fields = ['oldPwd', 'newPwd', 'confirmPwd'];

  function setError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }
  // 失败 → 三个框清空并聚焦旧密码框（与电脑版一致）
  function resetFields() {
    const init = passwordChangeResetState();
    fields.forEach((k) => {
      const el = bodyEl.querySelector('[data-f="' + k + '"]');
      if (el) el.value = init[k];
    });
    bodyEl.querySelector('[data-f="oldPwd"]').focus();
    setError('');
  }

  bodyEl.querySelector('[data-act="changePwd"]').addEventListener('click', async () => {
    const oldPwd = bodyEl.querySelector('[data-f="oldPwd"]').value;
    const newPwd = bodyEl.querySelector('[data-f="newPwd"]').value;
    const confirmPwd = bodyEl.querySelector('[data-f="confirmPwd"]').value;
    try {
      const oldOk = await Accounts.verify(repo, id, oldPwd);
      const err = passwordChangeError(oldOk, newPwd, confirmPwd);
      if (err) { resetFields(); setError(err); return; }
      await Accounts.setPassword(repo, id, newPwd);
      ctl.close();
      showToast('修改成功');
      if (typeof onDone === 'function') await onDone();
    } catch (e) {
      resetFields();
      setError(e.message || '修改失败');
    }
  });

  return ctl;
}
