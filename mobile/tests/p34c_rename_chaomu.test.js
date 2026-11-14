// P34-c：应用改名为「朝暮」，包名与数据不动
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const manifest = read('mobile/manifest.webmanifest');
const html = read('mobile/index.html');
const sw = read('mobile/sw.js');
const build = read('mobile/android/build_apk.py');
const activity = read('mobile/android/java/com/worklife/assistant/MainActivity.java');
const mainJs = read('mobile/js/main.js');

test('PWA 名称是朝暮，全称保留功能说明', () => {
  assert.ok(manifest.includes('"name": "朝暮 · 工作生活助手"'), '安装后的全名');
  assert.ok(manifest.includes('"short_name": "朝暮"'), '桌面显示的就是两个字');
});

test('页面标题与 iOS 主屏名同步改成朝暮', () => {
  assert.ok(html.includes('<title>朝暮 · 工作生活助手</title>'));
  assert.ok(html.includes('content="朝暮"'), 'apple-mobile-web-app-title');
  assert.ok(html.includes('朝暮 移动版（PWA）'), '描述同步');
  assert.equal(html.includes('工作生活助手 · 移动版'), false, '旧标题不再出现');
});

test('安装包的应用名就是朝暮', () => {
  assert.ok(build.includes('APP_NAME = "朝暮"'));
  assert.ok(activity.includes('朝暮'), '壳里的注释同步');
  assert.ok(activity.includes('ChaomuApp/1.0.1'), 'UserAgent 也换成新名字，便于在日志里认出来');
});

test('包名保持不动，老包能覆盖升级、数据不丢', () => {
  assert.ok(build.includes('PKG = "com.worklife.assistant"'), '包名不变');
  assert.ok(activity.startsWith('package com.worklife.assistant;'));
});

test('本地数据标识不动，升级后原有记录还在', () => {
  assert.ok(mainJs.includes("const DB_NAME = 'worklife-mobile'"), '库名不变');
  assert.ok(mainJs.includes("const PREF_KEY = 'worklife-mobile.prefs'"), '偏好键不变');
});

test('Service Worker 缓存升版，手机上才会换成新图标与新名字', () => {
  assert.ok(/worklife-mobile-v12/.test(sw), '缓存版本 v12');
  assert.ok(sw.includes('朝暮'), '注释同步');
});

test('安装包文件名与版本号', () => {
  assert.ok(build.includes('"chaomu-%s.apk"'), '产物名 chaomu-*.apk');
  assert.ok(build.includes('VERSION_NAME = "1.0.1"'));
  assert.ok(build.includes('VERSION_CODE = "2"'), '比上一版大，可直接覆盖安装');
});
