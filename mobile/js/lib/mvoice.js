// AI生成
// 手机版语音识别：走浏览器自带的 SpeechRecognition（Web Speech API）
// 电脑版的 window.worklifeVoice 在手机/网页里不存在，这里给一个同形状的轻量替代：
// 只负责「说一句 → 出一句文字」，不依赖桌面壳，也不往页面里放任何密钥。

export function speechAvailable(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w) return false;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

const ERR_TEXT = {
  'not-allowed': '没拿到麦克风权限，允许后再点一次',
  'service-not-allowed': '系统没允许麦克风，去设置里开一下',
  'no-speech': '没听到声音，再说一遍吧',
  'audio-capture': '找不到麦克风',
  network: '语音识别联网失败，检查网络后再试',
  aborted: '',
};

// 说一句就出一句：start() 开始听，onFinal 拿整句，onPartial 边说边显示
export function createDictation({ win, lang = 'zh-CN', onPartial, onFinal, onError, onState } = {}) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const Ctor = w && (w.SpeechRecognition || w.webkitSpeechRecognition);
  let rec = null;
  let running = false;
  let finalText = '';
  let lastText = '';
  let settled = false;

  function settle(text, errMsg) {
    if (settled) return;
    settled = true;
    running = false;
    if (onState) onState('idle');
    if (errMsg) { if (onError) onError(errMsg); return; }
    const t = String(text == null ? '' : text).trim();
    if (t) { if (onFinal) onFinal(t); return; }
    if (onError) onError('没听清，再说一遍？');
  }

  function stop() {
    if (!running) return;
    running = false;
    const r = rec;
    rec = null;
    try { if (r) r.stop(); } catch (e) { /* ignore */ }
    settle(lastText || finalText, null);
  }

  function start() {
    if (running) return false;
    if (!Ctor) {
      if (onError) onError('这个浏览器不支持语音识别');
      return false;
    }
    finalText = '';
    lastText = '';
    settled = false;
    running = true;
    if (onState) onState('listening');
    try { rec = new Ctor(); } catch (e) {
      running = false;
      if (onError) onError('语音启动失败，稍后再试');
      return false;
    }
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = (r[0] && r[0].transcript) || '';
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      lastText = (finalText + interim).trim();
      if (onPartial) onPartial(lastText);
    };
    rec.onerror = (ev) => {
      const key = (ev && ev.error) || '';
      settle('', ERR_TEXT[key] === '' ? '' : (ERR_TEXT[key] || ('语音出错了：' + key)));
    };
    rec.onend = () => {
      if (settled) { running = false; return; }
      settle(lastText || finalText, null);
    };
    try { rec.start(); } catch (e) {
      running = false;
      if (onError) onError('语音启动失败，稍后再试');
      return false;
    }
    return true;
  }

  return { start, stop, isRunning: () => running };
}
