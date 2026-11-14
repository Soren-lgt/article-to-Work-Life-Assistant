// AI生成
// 题库语音输入：把「说一句话」变成填进输入框的文字，或直接选中某个选项
// 桌面版走主进程的语音桥 window.worklifeVoice（start / chunk / stop / onEvent）；
// 网页版没有这个桥，按钮不出现，原来的打字流程完全不受影响。

// 与小白语音同口径，避免两套参数
export const VOICE_RULES = {
  threshold: 0.02, // 认为「有声」的音量线
  silenceMs: 2000, // 说完静默多久算结束
  noSpeechMs: 5000, // 一直没出声，最多等这么久就放弃
  maxMs: 30000, // 兜底上限
};

export const LETTERS = 'ABCDEFGH';
const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 };

// 这个环境能不能用语音（桌面版才有桥）
export function voiceAvailable(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const bridge = w && w.worklifeVoice;
  return !!(bridge && bridge.available && typeof bridge.start === 'function');
}

// 重采样到 16k（语音接口要求），线性插值；已是 16k 原样返回
export function resampleTo16k(input, inRate) {
  if (!input || !input.length) return new Float32Array(0);
  if (!inRate || inRate === 16000) return input;
  const ratio = inRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

// 均方根音量
export function rms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// 静音判定：说完了 / 一直没说话 / 超时
export function createSilenceMeter(options = {}) {
  const rules = { ...VOICE_RULES, ...options };
  let startedAt = 0;
  let lastLoudAt = 0;
  let peak = 0;
  return {
    reset(now = 0) {
      startedAt = now;
      lastLoudAt = now;
      peak = 0;
    },
    feed(samples, now = 0) {
      const level = rms(samples);
      if (level > peak) peak = level;
      if (level >= rules.threshold) lastLoudAt = now;
      if (peak < rules.threshold) {
        return now - startedAt >= rules.noSpeechMs ? { end: 'nospeech' } : null;
      }
      if (now - lastLoudAt >= rules.silenceMs) return { end: 'silence' };
      if (now - startedAt >= rules.maxMs) return { end: 'timeout' };
      return null;
    },
  };
}

// 把识别文本写进输入框：空的直接填，已有内容往后接（多行用换行接）
export function appendVoiceText(current, text, { multiline = false } = {}) {
  const t = String(text == null ? '' : text).trim();
  const cur = String(current == null ? '' : current);
  if (!t) return cur;
  if (!cur.trim()) return t;
  if (/[\n\s]$/.test(cur)) return cur + t;
  return cur + (multiline ? '\n' : ' ') + t;
}

// 语音 → 选项序号：支持「选B」「第二个」「2」「A和C」「对/正确」「错/错误」
export function pickChoiceIndexes(text, options = [], { multiple = false } = {}) {
  const src = String(text || '').trim();
  const opts = Array.isArray(options) ? options : [];
  const found = new Set();
  const push = (i) => {
    if (Number.isInteger(i) && i >= 0 && i < opts.length) found.add(i);
  };
  if (!src || !opts.length) return [];

  const norm = (s) => String(s == null ? '' : s)
    .replace(/[\s，,。.、；;：:！!？?'"“”‘’()（）]/g, '')
    .toLowerCase();
  const flat = norm(src);

  // 判断题先处理否定：「不对」要判成「错」，别被选项里的「对」抢先命中
  const judgeMode = opts.some((o) => /^(对|正确|是|错|错误|否|假)$/.test(String(o).trim()));
  const negWord = /(不对|不正确|不是|不真|错了|错误|错|否|假)/;
  const matched = judgeMode && negWord.test(flat) ? flat.replace(negWord, '') : flat;

  // 1) 直接说到选项原文（多选题靠这条一次捞多个）
  opts.forEach((o, i) => {
    const no = norm(o);
    if (no && matched.includes(no)) push(i);
  });

  // 2) 字母：选B / A和C
  for (const ch of src.toUpperCase().match(/[A-H]/g) || []) push(LETTERS.indexOf(ch));

  // 3) 第几个 / 裸数字
  const ordinal = src.match(/第\s*([一二三四五六七八1-8])\s*(?:个|项|条|题)?/g) || [];
  for (const m of ordinal) {
    const v = m.replace(/[第个项条题\s]/g, '');
    push((CN_DIGIT[v] || Number(v)) - 1);
  }
  if (!ordinal.length) {
    const bare = src.match(/(?:选|答|是)?\s*([1-8])\s*$/);
    if (bare) push(Number(bare[1]) - 1);
  }

  // 4) 判断题兜底：对 / 错（选项文案不是「对/错」时）
  if (!found.size) {
    const yes = /(对|正确|是|真|√|true|t)/i.test(matched);
    const no = judgeMode
      ? (negWord.test(flat) || /(错|不正确|否|假|不对|×|false|f)/i.test(matched))
      : false;
    if (yes !== no) {
      const positive = yes;
      const idx = opts.findIndex((o) => {
        const s = String(o).trim();
        const isYes = /^(对|正确|是|真|√|true|t)/i.test(s);
        const isNo = /^(错|不正确|否|假|×|false|f)/i.test(s);
        return positive ? isYes : isNo;
      });
      if (idx >= 0) push(idx);
    }
  }

  const sorted = [...found].sort((a, b) => a - b);
  return multiple ? sorted : sorted.slice(0, 1);
}

// 录音器：申请麦克风 → 切片喂给桥 → 静音自动收工；桥的结果按事件回调出来
export function createVoiceRunner({
  win, bridge, rules = VOICE_RULES, now = () => Date.now(), onPartial, onFinal, onError,
} = {}) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const b = bridge || (w && w.worklifeVoice);
  let recorder = null;
  let off = null;
  let meter = null;
  let running = false;

  function cleanup() {
    if (off) {
      try { off(); } catch (e) { /* ignore */ }
      off = null;
    }
    if (recorder) {
      try { recorder.proc.disconnect(); } catch (e) { /* ignore */ }
      try { recorder.src.disconnect(); } catch (e) { /* ignore */ }
      try { recorder.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
      try { recorder.actx.close(); } catch (e) { /* ignore */ }
      recorder = null;
    }
    meter = null;
  }

  function stop(reason, sendStop = true) {
    if (!running) return;
    running = false;
    cleanup();
    if (sendStop && b && typeof b.stop === 'function') {
      try { b.stop(); } catch (e) { /* ignore */ }
    }
  }

  async function start() {
    if (running) return false;
    if (!b || !b.available || typeof b.start !== 'function') {
      if (onError) onError('语音要用桌面版（exe）才能用');
      return false;
    }
    running = true;
    try {
      await b.start();
    } catch (e) {
      running = false;
      if (onError) onError('语音引擎启动失败：' + (e && e.message ? e.message : e));
      return false;
    }

    let stream;
    try {
      stream = await w.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      running = false;
      try { b.stop(); } catch (err) { /* ignore */ }
      if (onError) onError('没拿到麦克风权限，允许后再点一次');
      return false;
    }

    let actx;
    let src;
    let proc;
    try {
      const Ctx = w.AudioContext || w.webkitAudioContext;
      actx = new Ctx();
      src = actx.createMediaStreamSource(stream);
      proc = actx.createScriptProcessor(4096, 1, 1);
    } catch (e) {
      running = false;
      try { stream.getTracks().forEach((t) => t.stop()); } catch (err) { /* ignore */ }
      try { b.stop(); } catch (err) { /* ignore */ }
      if (onError) onError('这个环境开不了录音');
      return false;
    }

    meter = createSilenceMeter(rules);
    meter.reset(now());
    proc.onaudioprocess = (ev) => {
      if (!running) return;
      try {
        const samples = resampleTo16k(ev.inputBuffer.getChannelData(0), actx.sampleRate);
        b.chunk(samples);
        const res = meter.feed(samples, now());
        if (res && res.end) stop(res.end);
      } catch (e) { /* ignore */ }
    };
    src.connect(proc);
    proc.connect(actx.destination);
    recorder = { stream, actx, src, proc };

    if (typeof b.onEvent === 'function') {
      off = b.onEvent((ev) => {
        if (!ev) return;
        if (ev.type === 'partial') {
          if (onPartial) onPartial(ev.text || '');
          return;
        }
        if (ev.type === 'final') {
          const text = String(ev.text || '').trim();
          stop('final', false);
          if (text) { if (onFinal) onFinal(text); } else if (onError) onError('没听清，再说一遍？');
          return;
        }
        if (ev.type === 'error') {
          stop('error', false);
          if (onError) onError('语音出错了：' + (ev.message || ''));
        }
      });
    }
    return true;
  }

  return { start, stop, isRunning: () => running };
}
