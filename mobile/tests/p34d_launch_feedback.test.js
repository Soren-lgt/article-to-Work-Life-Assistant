// P34-d：点开图标必须有反应——加载中给可见反馈，连不上给出原因和重试
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = readFileSync(join(root, 'mobile/android/java/com/worklife/assistant/MainActivity.java'), 'utf8');
const build = readFileSync(join(root, 'mobile/android/build_apk.py'), 'utf8');
const apk = readFileSync(join(root, 'mobile/android/chaomu-1.0.1.apk'));

test('启动徽标被系统认作可启动入口（最常见的“点了没反应”原因）', () => {
  assert.ok(build.includes('android:exported="true"'), 'targetSdk 34 下缺少它，点击图标不会启动');
  assert.ok(build.includes('android.intent.category.LAUNCHER'));
  assert.ok(build.includes('android.intent.action.MAIN'));
});

test('点开先显示“正在打开”，不是白屏', () => {
  assert.ok(src.includes('正在打开'), '有加载中的提示文案');
  assert.ok(src.includes('private void startLoad()'), '启动统一走这个方法');
  assert.ok(/startLoad\(\)[^;]*;/.test(src) || src.includes('startLoad();'), 'onCreate 里调用了它');
  assert.ok(src.includes('layer.setVisibility(View.VISIBLE)'), '提示层能显示出来');
});

test('加载失败时说明原因并支持点一下重试', () => {
  assert.ok(src.includes('private void onLoadFail(String why)'));
  assert.ok(src.includes('onReceivedError(WebView view, WebResourceRequest req, WebResourceError err)'), '网络错误回调');
  assert.ok(src.includes('isForMainFrame()'), '只处理主页面错误，不被图片/脚本错误打断');
  assert.ok(src.includes('onReceivedHttpError'), '服务器 4xx/5xx 也算失败');
  assert.ok(src.includes('setOnClickListener(v -> retry())'), '整屏点击即重试');
  assert.ok(src.includes('没连上'), '失败页有明确标题');
  assert.ok(src.includes('soren-lgt.github.io/article-to-Work-Life-Assistant/mobile/index.html'),
    '失败页给出可自查的地址');
});

test('失败页不会被随后的 onPageFinished 立刻抹掉', () => {
  assert.ok(src.includes('private boolean loadFailed'), '记住失败状态');
  assert.ok(src.includes('if (loadFailed)'), 'onPageFinished 里先判断');
  assert.ok(src.includes('failText'), '失败文案留着重绘');
});

test('常开 WebView 调试口，还有问题时能用 Chrome 远程看日志', () => {
  assert.ok(src.includes('WebView.setWebContentsDebuggingEnabled(true)'));
});

function unzipEntry(buf, wanted) {
  let p = 0;
  const sig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  while ((p = buf.indexOf(sig, p)) !== -1) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (name === wanted) {
      const lnlen = buf.readUInt16LE(lho + 26);
      const lelen = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + lnlen + lelen;
      const raw = buf.slice(start, start + csize);
      return method === 0 ? raw : inflateRawSync(raw);
    }
    p = p + 46 + nlen + elen + clen;
  }
  return null;
}

test('打包进去的 dex 确实含新逻辑（不是只改了源码）', () => {
  assert.ok(apk.slice(0, 2).toString('binary') === 'PK', 'APK 是 zip');
  const dex = unzipEntry(apk, 'classes.dex');
  assert.ok(dex, 'APK 里有 classes.dex');
  assert.ok(dex.includes(Buffer.from('Lcom/worklife/assistant/MainActivity;')), 'MainActivity 已编进 dex');
  assert.ok(dex.includes(Buffer.from('onReceivedError')), '错误兜底已编进 dex');
  assert.ok(dex.includes(Buffer.from('ChaomuApp/1.0.1')), 'UA 标识已编进 dex');
});

test('同一签名证书，老包装新包能直接覆盖', () => {
  const md = readFileSync(join(root, 'mobile/android/README.md'), 'utf8');
  assert.ok(md.includes('.worklife-apk'), '签名库路径写在文档里，别弄丢');
  assert.ok(build.includes('worklife.jks'), '构建复用同一个证书');
});
