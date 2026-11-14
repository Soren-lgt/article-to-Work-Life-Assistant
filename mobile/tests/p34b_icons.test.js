// P34-b：启动图标 / PWA 图标 / favicon 换成已定稿的那一款
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

function png(path) {
  const buf = readFileSync(path);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, '是 PNG 文件');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), depth: buf[24], color: buf[25], bytes: buf.length };
}

const i512 = png(join(root, 'mobile/icons/icon-512.png'));
const i192 = png(join(root, 'mobile/icons/icon-192.png'));
const touch = png(join(root, 'mobile/icons/apple-touch-icon.png'));

test('三张位图图标的尺寸正确', () => {
  assert.deepEqual([i512.w, i512.h], [512, 512]);
  assert.deepEqual([i192.w, i192.h], [192, 192]);
  assert.deepEqual([touch.w, touch.h], [180, 180]);
});

test('图标是不透明满版方图（不是带白角的圆角图）', () => {
  // colorType 2 = RGB 无 alpha，铺满整块方形，桌面上不会露白角
  assert.equal(i512.color, 2, 'icon-512 是 RGB（无透明通道）');
  assert.equal(i192.color, 2, 'icon-192 是 RGB（无透明通道）');
  assert.ok(i512.bytes > 150000, '512 图标有实际画面内容，不是纯色块');
});

test('favicon 是同构的矢量版：墨绿圆角方底 + 米白书 + 勾线小屋', () => {
  const svg = readFileSync(join(root, 'mobile/icons/favicon.svg'), 'utf8');
  assert.ok(svg.includes('viewBox="0 0 64 64"'), '64 网格');
  assert.ok(/<rect[^>]*rx="11"/.test(svg), '圆角方底');
  assert.ok(svg.includes('linearGradient'), '底是渐变墨绿');
  assert.ok(svg.includes('#f4f0e4'), '书页是米白');
  assert.equal((svg.match(/fill="#f4f0e4"/g) || []).length >= 2, true, '两页书');
  assert.ok(svg.includes('M32 23.6v23'), '有书脊');
  assert.ok(svg.includes('l2.4 2.6 5.2-6'), '左页有勾');
  assert.ok(/M41\.5 24\.2/.test(svg), '右页有小屋屋顶');
  assert.ok(svg.includes('stroke-linecap="round"'), '线条圆头');
});

test('页面同时引用位图与矢量图标，iOS 用 180px 专用图', () => {
  const html = readFileSync(join(root, 'mobile/index.html'), 'utf8');
  assert.ok(html.includes('href="icons/icon-192.png"'), '标签页优先用位图');
  assert.ok(html.includes('href="icons/favicon.svg"'), '保留矢量回退');
  assert.ok(html.includes('href="icons/apple-touch-icon.png"'), 'iOS 主屏图标');
  assert.ok(html.includes('sizes="180x180"'), '尺寸标注');
});

test('PWA manifest 指向这两张图标', () => {
  const mf = readFileSync(join(root, 'mobile/manifest.webmanifest'), 'utf8');
  assert.ok(mf.includes('icons/icon-192.png'));
  assert.ok(mf.includes('icons/icon-512.png'));
});

test('安卓打包脚本从同一张 512 图生成五档 mipmap', () => {
  const py = readFileSync(join(root, 'mobile/android/build_apk.py'), 'utf8');
  assert.ok(py.includes('"..", "icons", "icon-512.png"'), '复用同一张源图');
  for (const dens of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    assert.ok(py.includes(dens), '包含 ' + dens);
  }
  assert.ok(py.includes('"mdpi": 48') && py.includes('"xxxhdpi": 192'), '五档像素对应正确');
});
