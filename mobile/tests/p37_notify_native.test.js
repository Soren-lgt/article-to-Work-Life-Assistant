// P37：装成 App 也能发系统通知——壳里加原生通知桥，首次进入问一次
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const activity = read('mobile/android/java/com/worklife/assistant/MainActivity.java');
const build = read('mobile/android/build_apk.py');
const push = read('mobile/js/lib/push.js');
const prompt = read('mobile/js/lib/notifyprompt.js');
const mainJs = read('mobile/js/main.js');

test('壳里注入了原生通知桥（WebView 没有 Web Notification，这就是过去一律提示不支持的原因）', () => {
  assert.ok(activity.includes('addJavascriptInterface(new NotifyBridge(), "ChaomuNotify")'));
  assert.ok(activity.includes('class NotifyBridge'));
  for (const m of ['public String state()', 'public String request()', 'public boolean notify(']) {
    assert.ok(activity.includes(m), '桥方法：' + m);
  }
});

test('通知渠道与权限都在壳里备好', () => {
  assert.ok(activity.includes('NotificationChannel'), 'Android 8 以上要先建渠道，通知才会显示');
  assert.ok(activity.includes('CHANNEL_ID'), '渠道 id');
  assert.ok(build.includes('android.permission.POST_NOTIFICATIONS'), 'Android 13 以上要声明通知权限');
  assert.ok(activity.includes('onRequestPermissionsResult'), '系统询问的结果要能回传网页');
  assert.ok(activity.includes('__chaomuNotifyState'), '回传用的回调名');
});

test('页面优先走原生桥，其次才是浏览器的 Web Notification', () => {
  assert.ok(push.includes('window.ChaomuNotify'));
  assert.ok(push.includes('export function nativeBridge'));
  assert.ok(push.includes('if (nativeBridge()) return true'), '装了 App 就算支持');
  assert.ok(push.includes('bridge.notify('), '推通知走原生桥');
  assert.ok(push.includes("'requesting'"), '等系统权限结果再返回');
});

test('提示文案不再把「装成应用」说成不支持', () => {
  const hint = push.slice(push.indexOf('export function permissionHint'), push.indexOf('// 每条通知一个独立 tag'));
  assert.equal(hint.includes('桌面应用'), false, '不再说装成桌面应用');
  assert.ok(hint.includes('系统设置里允许'), '告诉用户去哪开');
});

test('第一次进入弹一次询问，问过就不再烦', () => {
  assert.ok(existsSync(join(root, 'mobile/js/lib/notifyprompt.js')));
  assert.ok(prompt.includes("'chaomu.notify.asked'"), '本地标记记住问过');
  assert.ok(prompt.includes('alreadyAsked'), '先查有没有问过');
  assert.ok(prompt.includes('markAsked'), '问完就记账');
  assert.ok(prompt.includes('允许通知') && prompt.includes('以后再说'), '两个选择');
  assert.ok(mainJs.includes('maybeAskNotifyPrompt'), '启动时调用');
});

test('拿不到系统通知的环境不弹没用的框', () => {
  assert.ok(prompt.includes("if (perm === 'unsupported')"), '拿不到就记下不弹');
  assert.ok(prompt.includes("if (perm === 'granted')"), '已经允许了不用再问');
});
