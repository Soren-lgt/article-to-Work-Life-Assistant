// 第一次进入 App 时问一次：要不要把待办提醒推到手机通知栏。问过就不再打扰。
// 选择记在 localStorage；真正的系统权限交给 push.js（装成 App 时由壳弹系统询问）。
import { openModal } from '../../../app/js/ui/modal.js';
import { permissionOf, permissionHint, requestPermission, publishNotice } from './push.js';
import { showToast } from '../../../app/js/ui/toast.js';

export const ASK_KEY = 'chaomu.notify.asked';

export function alreadyAsked(storage) {
  try {
    return Boolean(storage && storage.getItem(ASK_KEY));
  } catch (e) {
    return false;
  }
}

export function markAsked(storage) {
  try {
    if (storage) storage.setItem(ASK_KEY, '1');
  } catch (e) { /* 隐私模式下写不进去就算了 */ }
}

// 弹一次应用内的询问框，返回 'granted' | 'denied' | 'later' | 'default'
export function askNotifyPermission(opts) {
  const options = opts || {};
  const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      markAsked(storage);
      resolve(v);
    };
    const ctl = openModal({
      title: '开启通知提醒',
      footer: false,
      bodyHTML: `
        <div style="font-size:14px;line-height:1.65">
          计划、开发、同组里的待办，可以直接出现在手机通知栏，不用每次打开 App 才看到。
        </div>
        <div class="muted" style="font-size:12px;line-height:1.6;margin-top:8px">
          点「允许通知」后会弹出系统的权限询问，选允许就行；不想收就点「以后再说」，之后也能在通知中心里再打开。
        </div>
        <div class="row" style="gap:8px;margin-top:14px">
          <button class="btn block" data-act="later">以后再说</button>
          <button class="btn primary block" data-act="allow">允许通知</button>
        </div>`,
    });
    if (!ctl) {
      finish('default');
      return;
    }
    ctl.overlay.addEventListener('click', async (e) => {
      const t = e.target.closest ? e.target.closest('[data-act]') : null;
      const act = t ? t.dataset.act : null;
      if (act === 'later') {
        ctl.close();
        finish('later');
        return;
      }
      if (act === 'allow') {
        if (settled) return;
        const perm = await requestPermission();
        ctl.close();
        if (perm === 'granted') {
          const welcome = {
            id: 'notice_welcome_' + Date.now().toString(36),
            title: '通知已开启',
            body: '计划、开发、同组的待办会出现在手机通知栏',
            createdAt: Date.now(),
          };
          // 刚授权的这一拍状态可能还没同步，失败就稍后补一次
          if (!(await publishNotice(welcome))) setTimeout(() => { publishNotice(welcome); }, 600);
          showToast('已开启通知');
        } else {
          showToast(permissionHint(perm));
        }
        finish(perm);
      }
    });
    // 点右上角 × 也当作「以后再说」
    ctl.overlay.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('[data-m-close]')) finish('later');
    });
  });
}

// 启动时调用：没问过、且还有希望开启时才弹
export async function maybeAskNotifyPrompt(opts) {
  const options = opts || {};
  const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!storage || alreadyAsked(storage)) return 'skipped';
  const perm = permissionOf();
  if (perm === 'granted') {
    markAsked(storage);
    return 'already-granted';
  }
  if (perm === 'unsupported') {
    // 这种打开方式本来就拿不到，别每次进来都弹一个点了也没用的框
    markAsked(storage);
    return 'unsupported';
  }
  return askNotifyPermission({ storage });
}
