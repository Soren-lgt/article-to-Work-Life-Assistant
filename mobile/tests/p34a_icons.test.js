// P34-a：界面内部图标换成统一的一套（底部六个入口 + 语音按钮）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const html = readFileSync(join(root, 'mobile/index.html'), 'utf8');
const css = readFileSync(join(root, 'mobile/css/mobile.css'), 'utf8');
const quiz = readFileSync(join(root, 'mobile/js/views/quiz.js'), 'utf8');

function tabLine(route) {
  const i = html.indexOf('data-route="' + route + '"');
  assert.ok(i >= 0, '存在入口 ' + route);
  const start = html.lastIndexOf('<button', i);
  return html.slice(start, html.indexOf('</button>', i));
}

const ICONS = {
  home:    'M9.7 20.4v-5.2h4.6v5.2',
  today:   'M8.6 12.4l2.3 2.3 4.4-4.6',
  devwork: 'M12.8 5.8l-1.6 12.4',
  group:   'M15.6 15.2c2.7.2 4.8 1.7 4.8 4.2',
  quiz:    'M9.4 9.6a2.6 2.6 0 0 1 5.1.5',
  ledger:  'M7.4 15.4h4.2',
};

test('六个入口都用同一套图标：24 网格、1.8 笔画、圆头', () => {
  for (const route of Object.keys(ICONS)) {
    const line = tabLine(route);
    assert.ok(line.includes('viewBox="0 0 24 24"'), route + ' 用 24 网格');
    assert.ok(line.includes('stroke-width="1.8"'), route + ' 笔画 1.8');
    assert.ok(line.includes('stroke-linecap="round"'), route + ' 圆头收笔');
    assert.ok(line.includes('fill="none"'), route + ' 是线条样式');
  }
});

test('六个入口分别是新绘制的那一个（旧版已替换干净）', () => {
  for (const [route, sig] of Object.entries(ICONS)) {
    assert.ok(tabLine(route).includes(sig), route + ' 是新版图形');
  }
  // 旧版特征不应再出现
  assert.equal(html.includes('M3 10.5 12 3l9 7.5'), false, '旧首页屋顶已换掉');
  assert.equal(html.includes('cx="9" cy="8" r="3.2"'), false, '旧同组双人已换掉');
  assert.equal(html.includes('width="16" height="15" rx="2"'), false, '旧记账卡片已换掉');
});

test('首页图标带门洞，记账图标是钱包不是卡片', () => {
  assert.ok(tabLine('home').includes('M5.6 9.8v10.6h12.8V9.8'), '有方体墙身');
  assert.ok(tabLine('ledger').includes('rx="2.6"'), '钱包圆角');
});

test('语音按钮与整套同笔画（描边，不再用实心块）', () => {
  assert.ok(quiz.includes('const MIC_SVG ='), '有语音图标常量');
  const at = quiz.indexOf('const MIC_SVG =');
  const line = quiz.slice(at, quiz.indexOf(';', at));
  assert.ok(line.includes('stroke-width="1.8"'), '笔画与底栏一致');
  assert.ok(line.includes('stroke-linecap="round"'), '圆头');
  assert.ok(line.includes('rx="2.8"'), '话筒是圆角胶囊');
  assert.equal(line.includes('fill="currentColor"'), false, '去掉实心填充');
});

test('图标尺寸仍由 CSS 控制，不写死在标签上', () => {
  assert.ok(css.includes('.tab svg'), '底栏图标有尺寸规则');
  const block = css.slice(css.indexOf('.tab svg'));
  assert.ok(/width:\s*23px/.test(block.slice(0, block.indexOf('}'))), '23px');
  for (const route of Object.keys(ICONS)) {
    const svgTag = tabLine(route).match(/<svg[^>]*>/);
    assert.ok(svgTag, route + ' 有 svg 标签');
    assert.equal(/\swidth=/.test(svgTag[0]), false, route + ' 的 svg 标签上没有写死宽度');
  }
});
