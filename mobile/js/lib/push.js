// 系统通知（手机通知栏）：把铃铛里的待办提醒推到手机通知中心，并让它常驻
// 三种打开方式，能力不同：
//   1. 装成安卓 App：WebView 里根本没有 Web Notification API（这就是过去一律提示「不支持」的原因），
//      改由壳注入的原生桥 window.ChaomuNotify 负责问权限和往通知栏推送；
//   2. 手机浏览器 / 电脑 Chrome（https 或 localhost）：用 Web Notification / Service Worker；
//   3. 其它（http 局域网、file://）：拿不到，只能看站内铃铛。
// 只做能力封装，不碰数据库；Node 环境导入时不报错（降级为 unsupported）。
export const PUSH_ICON = './icons/icon-192.png';

// ---------- 安卓壳注入的原生桥 ----------
export function nativeBridge() {
  if (typeof window === 'undefined') return null;
  const b = window.ChaomuNotify;
  if (!b || typeof b.state !== 'function') return null;
  return b;
}

// 壳里弹完系统权限询问后回调这里（见 MainActivity.onRequestPermissionsResult）
let nativeWaiter = null;
if (typeof window !== 'undefined') {
  window.__chaomuNotifyState = (s) => {
    if (!nativeWaiter) return;
    const done = nativeWaiter;
    nativeWaiter = null;
    done(String(s || 'default'));
  };
}

function nativeState() {
  const b = nativeBridge();
  if (!b) return '';
  try {
    return String(b.state() || 'default');
  } catch (e) {
    return 'default';
  }
}

// 系统权限弹窗是异步的：request() 先回 'requesting'，等壳把结果回调过来
function waitNativeState(ms) {
  return new Promise((resolve) => {
    let settled = false;
    nativeWaiter = (s) => {
      if (settled) return;
      settled = true;
      resolve(s);
    };
    setTimeout(() => {
      if (settled) return;
      settled = true;
      nativeWaiter = null;
      resolve('default');
    }, ms || 10000);
  });
}

export function isSupported() {
  if (nativeBridge()) return true;
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  // 浏览器只在安全上下文（https / localhost）里允许系统通知；http 局域网地址拿不到
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) return false;
  return true;
}

export function permissionOf() {
  if (nativeBridge()) return nativeState() || 'default';
  if (!isSupported()) return 'unsupported';
  return Notification.permission || 'default';
}

export function permissionHint(state) {
  if (state === 'unsupported') {
    return '当前打开方式拿不到系统通知：手机浏览器请用 https 地址打开，装成 App 的话请在系统设置里允许「朝暮」发通知。铃铛里照样能看到。';
  }
  if (state === 'denied') return '通知权限被拒绝了，可在系统设置里允许「朝暮」的通知';
  if (state === 'granted') return '已开启，待办提醒会出现在手机通知栏';
  return '开启后，铃铛里的待办提醒会推到手机通知栏';
}

// 每条通知一个独立 tag，多条可以并存；requireInteraction 让它留在通知栏不被自动收走
export function buildNotificationOptions(notice) {
  const id = notice && notice.id ? String(notice.id) : '';
  const ts = Number(notice && notice.createdAt) || Date.now();
  return {
    body: (notice && notice.body) || '',
    tag: id ? `notice-${id}` : 'notice-general',
    renotify: true,
    requireInteraction: true,
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    timestamp: ts,
    silent: false,
    data: { url: './index.html', noticeId: id },
  };
}

export async function requestPermission() {
  const bridge = nativeBridge();
  if (bridge) {
    const cur = nativeState();
    if (cur === 'granted') return 'granted';
    try {
      const r = String(bridge.request ? bridge.request() : cur);
      if (r === 'requesting') return await waitNativeState(12000);
      if (r === 'granted') return 'granted';
      if (r === 'denied') return 'denied';
      return r || 'default';
    } catch (e) {
      return 'denied';
    }
  }
  if (!isSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const r = await Notification.requestPermission();
    return r || 'default';
  } catch (e) {
    return 'denied';
  }
}

// 推一条到手机通知栏；权限没给就安静地跳过（铃铛里照样能看到）
export async function publishNotice(notice) {
  if (!notice || !notice.title) return false;
  const bridge = nativeBridge();
  if (bridge) {
    try {
      if (nativeState() !== 'granted') return false;
      if (typeof bridge.notify !== 'function') return false;
      return Boolean(bridge.notify(String(notice.id || ''), String(notice.title), String(notice.body || '')));
    } catch (e) {
      return false;
    }
  }
  if (permissionOf() !== 'granted') return false;
  const options = buildNotificationOptions(notice);
  const hasSw = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
  if (hasSw) {
    // 走 Service Worker 推（关掉页面也能留在通知栏）；这一步失败就退回页面直推，别让通知悄悄丢掉
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(notice.title, options);
        return true;
      }
    } catch (e) { /* 退回下面的页面直推 */ }
  }
  try {
    if (typeof Notification === 'function') {
      new Notification(notice.title, options);
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

// 应用图标上的未读角标（支持的设备才会显示）
export function setAppBadge(count) {
  try {
    if (typeof navigator === 'undefined') return;
    if (count > 0 && typeof navigator.setAppBadge === 'function') navigator.setAppBadge(count).catch(() => {});
    else if (!count && typeof navigator.clearAppBadge === 'function') navigator.clearAppBadge().catch(() => {});
  } catch (e) { /* 忽略 */ }
}
