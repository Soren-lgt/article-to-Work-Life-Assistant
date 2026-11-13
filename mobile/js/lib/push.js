// 系统通知（手机通知栏）：把铃铛里的通知同时推到手机的通知中心，并让它常驻
// 只做浏览器能力封装，不碰数据库；Node 环境导入时不会报错（无 window 时降级为 unsupported）
export const PUSH_ICON = './icons/icon-192.png';

export function isSupported() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  // 浏览器只在安全上下文（https / localhost）里允许系统通知；http 局域网地址拿不到
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) return false;
  return true;
}

export function permissionOf() {
  if (!isSupported()) return 'unsupported';
  return Notification.permission || 'default';
}

export function permissionHint(state) {
  if (state === 'unsupported') return '当前打开方式不支持系统通知（手机需 https 打开或装成桌面应用），铃铛里仍可查看';
  if (state === 'denied') return '系统通知被拒绝，请在浏览器/系统设置里允许本站通知';
  if (state === 'granted') return '已开启，通知会同时出现在手机通知栏';
  return '开启后，铃铛里的通知会推到手机通知栏并保留在上面';
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
  if (permissionOf() !== 'granted') return false;
  const options = buildNotificationOptions(notice);
  try {
    const hasSw = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
    if (hasSw) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(notice.title, options);
        return true;
      }
    }
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
