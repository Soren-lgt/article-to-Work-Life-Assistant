// P31-b：通知推到手机通知栏（系统通知），点通知回到应用
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  permissionOf, permissionHint, buildNotificationOptions, isSupported, publishNotice,
} from '../js/lib/push.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sw = readFileSync(join(root, 'mobile/sw.js'), 'utf8');
const nc = readFileSync(join(root, 'mobile/js/lib/notifycenter.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');

test('没有浏览器环境下不报错，权限按 unsupported 处理', () => {
  assert.equal(isSupported(), false);
  assert.equal(permissionOf(), 'unsupported');
});

test('通知项：每条一个 tag、常驻、点了能回到首页', () => {
  const opts = buildNotificationOptions({ id: 'notice_abc_1', title: 'T', body: 'B', createdAt: 1700000000000 });
  assert.equal(opts.tag, 'notice-notice_abc_1');
  assert.equal(opts.requireInteraction, true);
  assert.equal(opts.renotify, true);
  assert.equal(opts.body, 'B');
  assert.equal(opts.timestamp, 1700000000000);
  assert.equal(opts.data.noticeId, 'notice_abc_1');
  assert.ok(opts.data.url.includes('index.html'));
  assert.ok(opts.icon.includes('icon-192.png'));
});

test('没有 id 的通知用通用 tag，不会互相挤掉', () => {
  const opts = buildNotificationOptions(null);
  assert.equal(opts.tag, 'notice-general');
  assert.equal(typeof opts.timestamp, 'number');
});

test('权限提示文案覆盖四种状态', () => {
  assert.ok(permissionHint('unsupported').includes('拿不到系统通知'));
  assert.ok(permissionHint('denied').includes('拒绝'));
  assert.ok(permissionHint('granted').includes('通知栏'));
  assert.ok(permissionHint('default').includes('开启'));
});

test('只在安全上下文里支持系统通知（http 局域网地址会被挡在外面）', () => {
  const src = readFileSync(join(root, 'mobile/js/lib/push.js'), 'utf8');
  assert.ok(src.includes('isSecureContext'), '要判断安全上下文');
  const mainSrc2 = readFileSync(join(root, 'mobile/js/main.js'), 'utf8');
  assert.ok(mainSrc2.includes("perm === 'granted' || perm === 'unsupported'"), '不支持时不显示开启按钮');
});

test('未授权时不推送（安静跳过，铃铛照常）', async () => {
  assert.equal(await publishNotice({ id: 'x', title: 'T' }), false);
  assert.equal(await publishNotice(null), false);
});

test('写通知的同时推系统通知', () => {
  assert.ok(nc.includes("import { publishNotice } from './push.js';"));
  const pushBlock = nc.slice(nc.indexOf('await repo.put(\'notification\', record);'), nc.indexOf('return record;'));
  assert.ok(pushBlock.includes('await publishNotice(record)'));
});

test('Service Worker 能处理通知点击，且预缓存清单不再引用已删除的 settings.js', () => {
  assert.ok(sw.includes("self.addEventListener('notificationclick'"));
  assert.ok(sw.includes('event.notification.close()'));
  assert.ok(sw.includes('clients.openWindow'));
  assert.ok(!sw.includes('views/settings.js'), 'settings.js 已删除，留着会让整份预缓存失败');
  assert.ok(sw.includes('js/lib/push.js'));
  assert.ok(sw.includes('js/lib/notifycenter.js'));
  assert.ok(/worklife-mobile-v\d+/.test(sw), '缓存版本要升，手机才会换新代码');
});

test('通知中心里能开权限，未读数同步到应用角标', () => {
  assert.ok(mainSrc.includes("import { permissionOf, permissionHint, requestPermission, setAppBadge, publishNotice } from './lib/push.js';"));
  assert.ok(mainSrc.includes('data-act="enablePush"'));
  assert.ok(mainSrc.includes('开启手机通知'));
  assert.ok(mainSrc.includes('perm = await requestPermission();'));
  assert.ok(mainSrc.includes('setAppBadge(n);'));
});
