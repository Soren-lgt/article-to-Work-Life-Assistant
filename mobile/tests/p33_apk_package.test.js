// P33：手机安装包（APK）—— 源码口径与产物结构校验
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const androidDir = join(root, 'mobile', 'android');
const srcPath = join(androidDir, 'java', 'com', 'worklife', 'assistant', 'MainActivity.java');
const buildPath = join(androidDir, 'build_apk.py');
const apkPath = join(androidDir, 'chaomu-1.0.1.apk');

const src = readFileSync(srcPath, 'utf8');
const build = readFileSync(buildPath, 'utf8');

function zipNames(buf) {
  // 只读 zip 中央目录里的文件名（够用来确认结构）
  const names = [];
  let p = 0;
  while ((p = buf.indexOf('PK\x01\x02', p, 'binary')) !== -1) {
    const n = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const start = p + 46;
    names.push(buf.slice(start, start + n).toString('utf8'));
    p = start + n + extra + comment;
  }
  return names;
}

test('安装包打开的就是线上手机版（同一份代码）', () => {
  assert.ok(src.includes('https://soren-lgt.github.io/article-to-Work-Life-Assistant/mobile/index.html'),
    'WebView 加载线上 PWA 地址');
  assert.ok(src.includes('setJavaScriptEnabled(true)'));
  assert.ok(src.includes('setDomStorageEnabled(true)'));
  assert.ok(src.includes('setDatabaseEnabled(true)'), 'IndexedDB 依赖数据库开关');
});

test('只有联网权限，不申请多余权限', () => {
  const perms = build.match(/android\.permission\.[A-Z_]+/g) || [];
  assert.deepEqual([...new Set(perms)], ['android.permission.INTERNET']);
  assert.equal(src.includes('getDeviceId'), false, '不读设备信息');
});

test('应用名与包名固定，版本号可追溯', () => {
  assert.ok(build.includes('APP_NAME = "朝暮"'), '应用名已改朝暮');
  assert.ok(build.includes('PKG = "com.worklife.assistant"'), '包名保持不变，老包可直接覆盖升级');
  assert.ok(build.includes('VERSION_NAME = "1.0.1"'));
  assert.ok(build.includes('VERSION_CODE = "2"'), '版本号递增');
});

test('构建只用 SDK 自带工具，不依赖 Gradle', () => {
  for (const tool of ['aapt2.exe', 'd8.bat', 'zipalign.exe', 'apksigner.bat']) {
    assert.ok(build.includes(tool), '用到 ' + tool);
  }
  assert.equal(build.includes('gradle'), false);
  assert.ok(build.includes('wl-apk-build'), '中间产物走纯英文路径（aapt2 不认中文路径）');
});

test('打出来的 APK 是完整可装的包', () => {
  assert.ok(existsSync(apkPath), 'APK 存在');
  const size = statSync(apkPath).size;
  assert.ok(size > 10 * 1024, '体积像完整 APK：' + size);

  const buf = readFileSync(apkPath);
  assert.ok(buf.slice(0, 2).toString('binary') === 'PK', '是 zip 结构');

  const names = zipNames(buf);
  for (const need of ['AndroidManifest.xml', 'classes.dex', 'resources.arsc',
    'res/mipmap-xxxhdpi-v4/ic_launcher.png', 'META-INF/WORKLIFE.RSA']) {
    assert.ok(names.includes(need), '包含 ' + need);
  }

  // 二进制 AndroidManifest 的字符串池里能找到包名（UTF-16LE）
  assert.ok(buf.includes(Buffer.from('com.worklife.assistant', 'utf16le')), '包名写进了清单');
});
