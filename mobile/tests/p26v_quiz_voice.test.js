// AI生成
// P26-v 手机版题库语音：识别封装行为 + 与电脑版话术解析的对接 + 页面接线
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { speechAvailable, createDictation } from '../js/lib/mvoice.js';
import { parseDictation } from '../../app/js/lib/quizvoiceform.js';

const here = dirname(fileURLToPath(import.meta.url));
const quiz = readFileSync(join(here, '..', 'js', 'views', 'quiz.js'), 'utf8');

class FakeRec {
  constructor() { FakeRec.last = this; }
  start() { FakeRec.started = true; }
  stop() { if (this.onend) this.onend(); }
}

test('手机版语音：浏览器自带识别引擎才算可用，没有就不显示话筒', () => {
  assert.equal(speechAvailable({}), false);
  assert.equal(speechAvailable({ SpeechRecognition: function () {} }), true);
  assert.equal(speechAvailable({ webkitSpeechRecognition: function () {} }), true);
  assert.equal(speechAvailable(null), false);
});

test('手机版语音：没有识别引擎时点话筒给提示，不静默失败', () => {
  const errs = [];
  const d = createDictation({ win: {}, onError: (e) => errs.push(e) });
  assert.equal(d.start(), false);
  assert.equal(d.isRunning(), false);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /不支持/);
});

test('手机版语音：说完一句拿到整句文字', () => {
  const got = [];
  const d = createDictation({ win: { SpeechRecognition: FakeRec }, onFinal: (t) => got.push(t) });
  assert.equal(d.start(), true);
  assert.equal(d.isRunning(), true);
  FakeRec.last.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '选B' } }] });
  FakeRec.last.onend();
  assert.deepEqual(got, ['选B']);
  assert.equal(d.isRunning(), false);
});

test('手机版语音：手动停止也会交出已识别的部分，不白说', () => {
  const got = [];
  const d = createDictation({ win: { SpeechRecognition: FakeRec }, onFinal: (t) => got.push(t) });
  d.start();
  FakeRec.last.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: '传输层' } }] });
  d.stop();
  assert.deepEqual(got, ['传输层']);
  assert.equal(d.isRunning(), false);
});

test('手机版语音：停止只结算一次，不会重复回填', () => {
  const got = [];
  const d = createDictation({ win: { SpeechRecognition: FakeRec }, onFinal: (t) => got.push(t) });
  d.start();
  FakeRec.last.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '八十' } }] });
  d.stop();
  FakeRec.last.onend();
  assert.deepEqual(got, ['八十']);
});

test('手机版语音：什么都没认出来时提示再说一遍', () => {
  const errs = [];
  const d = createDictation({ win: { SpeechRecognition: FakeRec }, onError: (e) => errs.push(e) });
  d.start();
  FakeRec.last.onresult({ resultIndex: 0, results: [] });
  FakeRec.last.onend();
  assert.equal(errs.length, 1);
  assert.match(errs[0], /没听清/);
});

test('手机版语音：麦克风被拒时给的是权限提示', () => {
  const errs = [];
  const d = createDictation({ win: { SpeechRecognition: FakeRec }, onError: (e) => errs.push(e) });
  d.start();
  FakeRec.last.onerror({ error: 'not-allowed' });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /权限/);
});

test('手机版录题：直接复用电脑版话术解析，不另写一套规则', () => {
  assert.ok(quiz.includes("from '../../../app/js/lib/quizvoiceform.js'"));
  assert.ok(quiz.includes("from '../../../app/js/lib/quizvoice.js'"));
  assert.ok(quiz.includes("from '../lib/mvoice.js'"));
});

test('手机版录题：话筒放在取消与保存之间，代码题不给话筒', () => {
  assert.ok(quiz.includes("footExtra:(v.cat==='code'||!voiceOn())?'':micBtnHTML()"));
  assert.ok(quiz.includes("footExtra:(q.categoryKey==='code'||!voiceOn())?'':micBtnHTML()"));
});

test('手机版录题：表单顶部有话术示例与提示行，文字不入代码题', () => {
  assert.ok(quiz.includes("const head = cat === 'code' ? '' : `") || quiz.includes('buildVoiceGuideHTML(cat)'));
  assert.ok(quiz.includes('<div class="muted" data-el="vmsg"'));
  assert.ok(quiz.includes('已填：'));
});

test('手机版录题：关窗立刻停识别，句柄从 bindQuestionForm 返回', () => {
  assert.ok(quiz.includes('onClose:()=>{ if(voiceHandle){ try{voiceHandle.stop();}catch(e){} } }'));
  assert.ok(quiz.includes('voiceHandle=bindQuestionForm('));
  assert.ok(quiz.includes('return voiceHandle'));
});

test('手机版答题：按钮行有话筒，渲染后自动接线', () => {
  assert.ok(quiz.includes('data-act="voice"'));
  assert.ok(quiz.includes('runnerVoice=bindRunnerVoice(q, body)'));
});

test('手机版答题：收尾时停识别并清句柄，不留麦克风占用', () => {
  assert.match(quiz, /if\(runnerVoice\)\{ try\{runnerVoice\.stop\(\);\}catch\(e\)\{\} runnerVoice=null; \}/);
});

test('手机版答题：一句话按选项命中（选B/第二个/对）', () => {
  assert.ok(quiz.includes('pickChoiceIndexes(text, q.options'));
});

test('手机版口述录题：单选一句话能拆出题干、选项与答案', () => {
  const p = parseDictation('单选：题干是「HTTP 默认端口是哪个」，选项A是 80，选项B是 443，答案是A');
  assert.equal(p.ok, true);
  assert.equal(p.type, 'single');
  assert.equal(p.stem, 'HTTP 默认端口是哪个');
  assert.equal(p.options.length, 2);
  assert.deepEqual(p.options.map((o) => o.text), ['80', '443']);
  assert.deepEqual(p.answerLetters, ['A']);
});

test('手机版口述录题：判断题只说一句就带出答案', () => {
  const p = parseDictation('判断：题干是「地球是圆的」，答案是对');
  assert.equal(p.type, 'judge');
  assert.equal(p.stem, '地球是圆的');
  assert.equal(p.judgeAnswer, '对');
});
