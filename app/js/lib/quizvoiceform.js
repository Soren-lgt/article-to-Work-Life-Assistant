// AI生成
// 题库录题语音：话术库 + 口述题目解析器
// 把一整句口述（"单选：题干是…，选项A是…，答案是A"）拆成录题表单能直接用的字段
// 覆盖单选 / 多选 / 判断 / 问答题；代码题不提供语音录入

// 话术库：既是给用户看的念法示例，也是解析器认识的词
export const QUIZ_VOICE_GUIDE = {
  choice: [
    '单选：题干是「HTTP 默认端口是哪个」，选项A是 80，选项B是 443，答案是A',
    '多选：题干是「哪些是编程语言」，选项A是 Python，选项B是 Java，选项C是 HTML，答案是A和B',
    '判断：题干是「地球是圆的」，答案是对',
  ],
  qa: [
    '问答：题干是「列表和元组的区别」，参考答案是「列表可变，元组不可变」，关键词是 可变,不可变',
  ],
  code: [],
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 录题表单顶部的一行念法提示；代码题不放
export function buildVoiceGuideHTML(cat) {
  const list = QUIZ_VOICE_GUIDE[cat] || [];
  if (!list.length) return '';
  return `<div class="muted" data-el="vhint" style="margin:0 0 6px">念一句就填：${esc(list[0])}</div>`;
}

// 题型词：多选要排在单选前面，判断题独立
const TYPE_WORDS = [
  { cat: 'choice', type: 'multiple', re: '多选题|多项选择|多选' },
  { cat: 'choice', type: 'judge', re: '判断题|判断' },
  { cat: 'choice', type: 'single', re: '单选题|单项选择|单选' },
  { cat: 'qa', re: '问答题|问答|简答题|简答' },
  { cat: 'code', re: '代码题|编程题' },
];

// 段标记：谁出现，它后面的内容就归谁，直到下一个段标记
// 靠后的几个字段要求「在句首或标点后 + 带是/为」才算，免得题干里出现「语言」「提示」就被切开
const SECTIONS = [
  { key: 'refAnswer', re: '(?:^|[，,；;。、])\\s*(?:参考答案|参考回答)\\s*(?:是|为|:|：)?' },
  { key: 'keywords', re: '(?:^|[，,；;。、])\\s*关键词\\s*(?:是|为|:|：)?' },
  { key: 'option', letter: true, re: '(?:^|[，,；;。、])\\s*(?:选项)?\\s*([A-H])\\s*(?:是|为|:|：)?' },
  { key: 'stem', re: '(?:题干|题目|问题)(?:是|为|:|：)?' },
  { key: 'answer', re: '(?:正确答案|答案)(?:是|为|:|：)?' },
  { key: 'analysis', re: '(?:^|[，,；;。、])\\s*解析\\s*(?:是|为|:|：)' },
  { key: 'lang', re: '(?:^|[，,；;。、])\\s*语言\\s*(?:是|为|:|：)' },
  { key: 'refCode', re: '(?:^|[，,；;。、])\\s*参考代码\\s*(?:是|为|:|：)' },
  { key: 'hint', re: '(?:^|[，,；;。、])\\s*提示\\s*(?:是|为|:|：)' },
];

function normalize(input) {
  return String(input == null ? '' : input)
    .replace(/\u3000/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// 去掉首尾的逗号句号引号，题干里常被念成「…」
function cleanValue(raw) {
  let v = String(raw == null ? '' : raw).trim();
  for (let i = 0; i < 3; i++) {
    const before = v;
    v = v.replace(/^[\s，,、。；;：:]+/, '').replace(/[\s，,、。；;：:]+$/, '');
    v = v.replace(/^[「『“"'《]+/, '').replace(/[」』”"'》]+$/, '');
    if (v === before) break;
  }
  return v.trim();
}

function detectType(text) {
  for (const w of TYPE_WORDS) {
    if (new RegExp(w.re).test(text)) return w;
  }
  return null;
}

// 扫描所有段标记，按位置排序，重叠的丢掉（"参考答案"里不会再算一次"答案"）
function collectSections(text) {
  const marks = [];
  SECTIONS.forEach((s) => {
    const re = new RegExp(s.re, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex += 1; continue; }
      marks.push({
        key: s.key,
        letter: s.letter ? m[1] : null,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  });
  marks.sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const kept = [];
  marks.forEach((mk) => {
    const prev = kept[kept.length - 1];
    if (prev && mk.start < prev.end) return;
    kept.push(mk);
  });
  return kept.map((mk, i) => {
    const next = kept[i + 1];
    return { ...mk, value: cleanValue(text.slice(mk.end, next ? next.start : text.length)) };
  });
}

// 没念「题干是」时，取第一个段标记之前的整段当题干，并把题型词去掉
function fallbackStem(text, marks) {
  const first = marks[0];
  const head = first ? text.slice(0, first.start) : text;
  return cleanValue(head).replace(/^(多选题|多项选择|多选|判断题|判断|单选题|单项选择|单选|问答题|问答|简答题|简答|代码题|编程题)[\s，,。：:]*/, '');
}

function guessCategory(marks) {
  const has = (k) => marks.some((m) => m.key === k);
  if (has('option')) return { cat: 'choice', type: 'single' };
  if (has('keywords') || has('refAnswer')) return { cat: 'qa' };
  if (has('refCode') || has('lang')) return { cat: 'code' };
  return null;
}

function judgeOf(value) {
  const v = String(value || '');
  if (/(不对|不正确|错误|错|×|✗|false)/i.test(v)) return '错';
  if (/(正确|对|√|✓|true)/i.test(v)) return '对';
  return '';
}

function parseLetters(value) {
  const seg = String(value || '').split(/[，,。；;、\s]/).filter(Boolean).join(' ');
  const ls = seg.toUpperCase().match(/[A-H]/g) || [];
  return Array.from(new Set(ls));
}

function splitKeywords(value) {
  return String(value || '').split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
}

// 一句口述 → 录题字段；解析不出任何字段时 ok=false，调用方可以退回"原样接进当前框"
export function parseDictation(input) {
  const text = normalize(input);
  const out = {
    ok: false,
    category: null,
    type: null,
    stem: '',
    options: [],
    answerLetters: [],
    judgeAnswer: '',
    refAnswer: '',
    keywords: [],
    lang: '',
    refCode: '',
    hint: '',
    filled: [],
    missing: [],
    done: false,
  };
  if (!text) return out;

  const hit = detectType(text);
  const marks = collectSections(text);
  if (hit) {
    out.category = hit.cat;
    out.type = hit.type || null;
  } else {
    const guess = guessCategory(marks);
    if (guess) {
      out.category = guess.cat;
      out.type = guess.type || null;
    }
  }

  const stemMark = marks.find((m) => m.key === 'stem');
  out.stem = stemMark ? stemMark.value : fallbackStem(text, marks);

  marks.filter((m) => m.key === 'option').forEach((m) => {
    if (m.letter && m.value) out.options.push({ letter: m.letter, text: m.value });
  });

  const answerMark = marks.find((m) => m.key === 'answer');
  if (answerMark) {
    if (out.category === 'choice' && out.type === 'judge') out.judgeAnswer = judgeOf(answerMark.value);
    else if (out.category !== 'qa') out.answerLetters = parseLetters(answerMark.value);
  }

  const refMark = marks.find((m) => m.key === 'refAnswer');
  if (refMark) out.refAnswer = refMark.value;
  const kwMark = marks.find((m) => m.key === 'keywords');
  if (kwMark) out.keywords = splitKeywords(kwMark.value);
  const langMark = marks.find((m) => m.key === 'lang');
  if (langMark) out.lang = langMark.value;
  const codeMark = marks.find((m) => m.key === 'refCode');
  if (codeMark) out.refCode = codeMark.value;
  const hintMark = marks.find((m) => m.key === 'hint');
  if (hintMark) out.hint = hintMark.value;

  if (out.stem) out.filled.push('题干');
  if (out.options.length) out.filled.push(`${out.options.length} 个选项`);
  if (out.category === 'choice' && out.type === 'judge' && out.judgeAnswer) out.filled.push(`答案${out.judgeAnswer}`);
  if (out.answerLetters.length) out.filled.push(`答案 ${out.answerLetters.join('、')}`);
  if (out.refAnswer) out.filled.push('参考答案');
  if (out.keywords.length) out.filled.push('关键词');
  if (out.lang) out.filled.push('语言');
  if (out.refCode) out.filled.push('参考代码');
  if (out.hint) out.filled.push('提示');

  if (out.category === 'choice') {
    if (out.type === 'judge') {
      if (!out.judgeAnswer) out.missing.push('答案（对或错）');
    } else {
      if (out.options.length < 2) out.missing.push('选项（至少两个）');
      if (!out.answerLetters.length) out.missing.push('答案（哪一个选项正确）');
    }
    if (!out.stem) out.missing.push('题干');
  } else if (out.category === 'qa') {
    if (!out.stem) out.missing.push('题干');
    if (!out.refAnswer) out.missing.push('参考答案');
    if (!out.keywords.length) out.missing.push('关键词');
  } else if (out.category === 'code') {
    if (!out.stem) out.missing.push('题干');
    if (!out.refCode) out.missing.push('参考代码');
  } else if (!out.stem) {
    out.missing.push('题干');
  }

  out.done = out.missing.length === 0;
  out.ok = out.filled.length > 0;
  return out;
}
