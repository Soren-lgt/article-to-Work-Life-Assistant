// AI生成
// 题库模块：选择/问答/代码三类 → 题库（列表行：进入/删除）→ 题目；顺序练习/考试模式/新建题库同排；录题走可靠模态
import { Quiz } from '../lib/quiz.js';
import { gradeQuestion, filterWrong, accuracy } from '../lib/scoring.js';
import { openModal, openConfirm } from '../ui/modal.js';
import { voiceAvailable, appendVoiceText, pickChoiceIndexes, createVoiceRunner } from '../lib/quizvoice.js';
import { parseDictation, buildVoiceGuideHTML } from '../lib/quizvoiceform.js';

// T7：答题界面浮层句柄（邀请同款 openModal 承载）
let runnerCtl = null;
// P26-2：区分“代码主动关闭”和“用户点 × 关闭”，后者等同取消本次作答
let runnerClosing = false;
let runnerVoice = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 语音条片段：没有麦克风桥（网页版）就返回空串，界面保持原样
export function buildVoiceBarHTML(kind, win) {
  if (!voiceAvailable(win)) return '';
  const label = kind === 'form' ? '语音输入' : (kind === 'choice-answer' ? '语音选答案' : '语音作答');
  const tip = kind === 'form'
    ? '先说一句，填进最后点的那个框'
    : (kind === 'choice-answer' ? '说「选B」或「第二个」' : '说一句，我记下来');
  return `<div class="row" data-el="voicebar" style="gap:8px;margin:6px 0;align-items:center">
    <button type="button" class="btn" data-act="voice">${label}</button>
    <span class="muted" data-el="vmsg">${tip}</span>
  </div>`;
}

// 话筒按钮（答题页用）：只有图标，位置由调用方决定
export function buildVoiceMicHTML(kind, win) {
  if (!voiceAvailable(win)) return '';
  const tip = kind === 'choice-answer'
    ? '语音选答案：说「选B」或「第二个」'
    : '语音作答：说一句，记进作答框';
  return `<button type="button" class="btn mic-btn" data-act="voice" data-icon="mic" title="${tip}" aria-label="${tip}">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3"></rect>
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"></path>
      <path d="M12 18v3"></path>
      <path d="M8.5 21h7"></path>
    </svg></button>`;
}

// ---------- 可测纯函数：UI 片段 ----------
// 顶部动作行：顺序练习、考试模式在新建题库左侧，三者挨在一起
export function buildTopActionsHTML() {
  return `<span class="row" style="gap:6px;margin-left:auto">
    <button class="btn" data-act="practice">顺序练习</button>
    <button class="btn" data-act="examSetup">考试模式</button>
    <button class="btn primary" data-act="newBank">新建题库</button>
  </span>`;
}

// 纯函数：开始顺序练习/考试前的阻断原因；返回 null 表示可以开始
// P6：顺序练习改为跨全部题库串题，不再要求先进入某个题库，只要求账号下有题目
export function startupBlockReason(questionCount) {
  if (!(questionCount > 0)) return '题库中还没有任何题目，请先添加题目，或用账号菜单的「加载数据」导入题库备份文件。';
  return null;
}

// 题库列表行：文本名称 + 进入按钮（右侧）+ 删除按钮（进入右侧）
export function buildBankRowHTML(bank, activeId) {
  return `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
    <span style="flex:1">${esc(bank.name)}${bank.id === activeId ? ' <span class="muted">[当前]</span>' : ''}</span>
    <span class="row" style="gap:6px">
      <button class="btn primary" data-enter="${bank.id}">进入</button>
      <button class="btn danger" data-delbank="${bank.id}">删除</button>
    </span>
  </div>`;
}

// 判断题固定给出“正确/错误”两项
export function buildJudgeOptionHTML() {
  return `
    <label class="row" style="gap:8px"><input type="radio" name="jok" value="对"> 正确</label>
    <label class="row" style="gap:8px"><input type="radio" name="jok" value="错"> 错误</label>`;
}

// 单选/多选的一个可增删选项行：文本输入 + “正确”标记
export function buildChoiceOptionRowHTML() {
  return `<div class="row" data-optrow="1" style="gap:8px;margin-bottom:6px">
    <input data-opttext placeholder="选项内容" style="flex:1">
    <label class="row" style="gap:4px"><input type="radio" name="optok" data-optok> 正确</label>
    <button type="button" class="btn" data-rowdel>删</button>
  </div>`;
}

// 纯函数：成绩页（刚答完与历史查看共用同一形式）
// 页面最上面单独空出一行放「返回题库」，下面才是成绩卡片与作答明细
export function buildResultHTML({ score = 0, total = 0, elapsed = 0, details = [], readOnly = false } = {}) {
  const wrong = filterWrong(details);
  const rate = Math.round(accuracy(score, total) * 100);
  const sec = elapsed ? Math.round(elapsed / 1000) : 0;
  const rows = (details || []).map((r, i) => {
    const ok = r.manual ? null : r.correct;
    const label = r.manual ? '待人工批改' : (r.correct ? '正确' : '错误');
    const style = r.manual ? 'var(--muted)' : (r.correct ? 'green' : '#c00');
    const showAns = ok === false ? `
      <div class="muted" style="padding-left:18px;margin:2px 0 6px">
        参考答案：${esc(answerTextOf(r))}
        ${r.analysis ? ` · 解析：${esc(r.analysis)}` : ''}
        ${r.categoryKey === 'qa' && r.keywords ? `（关键词：${esc(r.keywords.join('、'))}）` : ''}
        ${r.hint ? `<br>提示：${esc(r.hint)}` : ''}
      </div>` : '';
    return `<div style="padding:4px 0;border-bottom:1px solid var(--line)">
      <div class="row" style="justify-content:space-between">
        <span>${i + 1}. ${esc(r.stem)}</span>
        <span style="color:${style}">${label}</span>
      </div>${showAns}</div>`;
  }).join('');
  return `<div class="row" data-el="backrow" style="justify-content:flex-start;margin:8px 0">
    <button class="btn primary" data-act="back">返回题库</button>
  </div>
  <div class="card">
    <strong>${readOnly ? '历史成绩' : '本次成绩'}：${score} / ${total}</strong>
    <span class="muted"> · 正确率 ${rate}% · 错题 ${wrong.length} 道 · 用时 ${sec}s${readOnly ? '（只读）' : ''}</span>
    <div style="margin-top:10px">${rows || '<span class="muted">无作答明细。</span>'}</div>
  </div>`;
}

// 参考答案文本（选择/问答取 answer，代码取参考代码）
function answerTextOf(r) {
  if (r.categoryKey === 'choice') {
    return Array.isArray(r.answer) ? r.answer.join('、') : String(r.answer == null ? '' : r.answer);
  }
  if (r.categoryKey === 'qa') return r.answer || '';
  return r.refCode || '';
}

// 纯函数：成绩历史行：摘要 + 查看 / 删除按钮
export function buildHistoryRowHTML(a, index) {
  const when = new Date(a.createdAt).toLocaleString();
  const spent = a.timeSpent ? ` · 用时 ${Math.round(a.timeSpent / 1000)}s` : '';
  return `<div class="row" style="justify-content:space-between;align-items:center;padding:4px 0;gap:6px">
    <span style="flex:1">${index + 1}. ${a.mode === 'exam' ? '考试' : '练习'} · ${esc(when)}${spent} · ${a.score}/${a.total}</span>
    <span class="row" style="gap:6px">
      <button class="btn" data-histview="${a.id}">查看</button>
      <button class="btn danger" data-histdel="${a.id}">删除</button>
    </span>
  </div>`;
}

export default {
  route: 'quiz',
  title: '题库',
  mount(el, ctx) {
    const { repo, state } = ctx;
    if (el.__timer) { clearInterval(el.__timer); el.__timer = null; }
    if (runnerCtl) { try { runnerCtl.close(); } catch (e) {} runnerCtl = null; }

    const v = {
      cat: 'choice', bankId: null, screen: 'manage',
      qs: [], i: 0, ans: {}, fb: {},
      deadline: 0, mode: 'practice', results: [], showSetup: false, startedAt: 0, elapsed: 0,
    };

    el.innerHTML = `
      <div class="card" style="padding:10px">
        <div class="row" data-el="cats" style="gap:8px;flex-wrap:wrap;align-items:center"></div>
      </div>
      <div data-el="main"></div>`;
    const catsBar = el.querySelector('[data-el="cats"]');
    const main = el.querySelector('[data-el="main"]');

    async function currentQuestions() {
      return v.bankId ? Quiz.listQuestions(repo, v.bankId) : [];
    }

    async function renderCats() {
      const cats = await Quiz.ensureCategories(repo);
      const qs = await currentQuestions();
      catsBar.innerHTML = cats.map((c) =>
        `<button class="btn ${c.key === v.cat ? 'primary' : ''}" data-cat="${c.key}">${esc(c.name)}</button>`).join('')
        + buildTopActionsHTML(qs.length);
      catsBar.querySelectorAll('[data-cat]').forEach((b) => {
        b.onclick = () => { v.cat = b.dataset.cat; v.bankId = null; v.screen = 'manage'; refresh(); };
      });
      const pb = catsBar.querySelector('[data-act="practice"]');
      if (pb) pb.onclick = async () => {
        // P6：顺序练习从“选择”第一个题库串到“代码”最后一个题库，题目按题型排序
        const list = await Quiz.practiceQuestions(repo, state.currentAccountId);
        const reason = startupBlockReason(list.length);
        if (reason) { window.alert(reason); return; }
        startRunner('practice', list);
      };
      const eb = catsBar.querySelector('[data-act="examSetup"]');
      if (eb) eb.onclick = async () => {
        const all = await Quiz.listAllQuestions(repo, state.currentAccountId);
        if (!(all.length > 0)) { window.alert('题库中还没有任何题目，请先添加题目。'); return; }
        v.showSetup = !v.showSetup;
        renderSetup(await Quiz.listAllQuestions(repo, state.currentAccountId));
      };
      const nb = catsBar.querySelector('[data-act="newBank"]');
      if (nb) nb.onclick = openNewBankModal;
    }

    async function refresh() {
      await renderCats();
      if (!state.currentAccountId) { main.innerHTML = '<div class="card muted">请先在右上角登录账号。</div>'; return; }
      if (v.screen === 'runner') return renderRunner();
      if (v.screen === 'result') return renderResult();
      return renderManage();
    }

    // 新建题库：可靠模态输入名称
    function openNewBankModal() {
      const accId = state.currentAccountId;
      if (!accId) { window.alert('请先创建账号'); return; }
      const ctl = openModal({
        title: '新建题库', submitText: '创建',
        bodyHTML: `<label>题库名称</label><input data-f="name" placeholder="如：数据结构题库">`,
        onSubmit: async () => {
          const name = ctl.body.querySelector('[data-f="name"]').value.trim();
          if (!name) { window.alert('题库名称不能为空'); return true; }
          try {
            const b = await Quiz.addBank(repo, accId, v.cat, name);
            v.bankId = b.id;
          } catch (e) { window.alert(e.message); return true; }
          await refresh();
          return false;
        },
      });
    }

    // ---------- 管理 ----------
    async function renderManage() {
      const accId = state.currentAccountId;
      const banks = await Quiz.listBanks(repo, accId, v.cat);
      if (v.bankId && !banks.some((b) => b.id === v.bankId)) v.bankId = null;
      const qs = await currentQuestions();

      main.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center">
            <strong>${esc(catName())}题库列表</strong>
          </div>
          <div data-el="banks" style="margin-top:8px">${banks.length
            ? banks.map((b) => buildBankRowHTML(b, v.bankId)).join('')
            : '<span class="muted">该分类下还没有题库。</span>'}</div>
        </div>
        ${v.bankId ? `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>当前题库题目（共 ${qs.length} 题）</strong>
            <button class="btn primary" data-act="addQ">+ 添加题目</button>
          </div>
          <div data-el="qlist" style="margin-top:8px">${qs.length ? qs.map((q, i) => `
            <div class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
              <span class="muted">${i + 1}.</span>
              <span style="flex:1">${esc(q.stem)}</span>
              <button class="btn" data-editq="${q.id}">编辑</button>
              <button class="btn" data-delq="${q.id}" style="color:#c00">删除</button>
            </div>`).join('') : '<span class="muted">此题库暂无题目。</span>'}</div>
        </div>` : ''}
        <div class="card"><div data-el="setup"></div></div>
        <div class="card" data-el="history"></div>`;

      const banksEl = main.querySelector('[data-el="banks"]');
      banksEl.querySelectorAll('[data-enter]').forEach((b) => {
        b.onclick = () => { v.bankId = b.dataset.enter; refresh(); };
      });
      banksEl.querySelectorAll('[data-delbank]').forEach((b) => {
        b.onclick = () => {
          openConfirm({
            title: '删除题库', confirmText: '删除',
            message: '删除题库会同时删除其全部题目，确定？',
            onConfirm: async () => {
              await Quiz.removeBank(repo, b.dataset.delbank);
              if (v.bankId === b.dataset.delbank) v.bankId = null;
              refresh();
            },
          });
        };
      });

      const addQ = main.querySelector('[data-act="addQ"]');
      if (addQ) addQ.onclick = openAddQuestionModal;

      main.querySelectorAll('[data-delq]').forEach((b) => {
        b.onclick = () => {
          openConfirm({
            title: '删除题目', confirmText: '删除',
            message: '确定删除该题目？',
            onConfirm: async () => {
              await Quiz.removeQuestion(repo, b.dataset.delq);
              refresh();
            },
          });
        };
      });

      main.querySelectorAll('[data-editq]').forEach((b) => {
        b.onclick = async () => {
          const qs = await currentQuestions();
          const q = qs.find((x) => x.id === b.dataset.editq);
          if (q) openEditQuestionModal(q);
        };
      });

      renderSetup(await Quiz.listAllQuestions(repo, accId));

      const hist = main.querySelector('[data-el="history"]');
      const atts = await Quiz.listAttempts(repo, accId);
      hist.innerHTML = `<strong>成绩历史</strong><div style="margin-top:8px">${atts.length
        ? atts.slice(0, 10).map((a, idx) => buildHistoryRowHTML(a, idx)).join('')
        : '<span class="muted">暂无记录。</span>'}</div>`;
      hist.querySelectorAll('[data-histview]').forEach((b) => b.onclick = async () => {
      const atts = await Quiz.listAttempts(repo, accId);
      const att = atts.find((a) => a.id === b.dataset.histview);
      if (!att) return;
      v.results = att.details || [];
      v.summary = { score: att.score, total: att.total };
      v.elapsed = att.timeSpent || 0;
      v.mode = att.mode;
      v.readOnly = true;
      v.screen = 'result';
      refresh();
    });
      hist.querySelectorAll('[data-histdel]').forEach((b) => b.onclick = async () => {
        await Quiz.removeAttempt(repo, b.dataset.histdel);
        refresh();
      });
    }

    function catName() {
      return { choice: '选择', qa: '问答', code: '代码' }[v.cat] || '';
    }

    function renderSetup(allQs = []) {
      const setup = main.querySelector('[data-el="setup"]');
      if (!setup) return;
      const counts = Quiz.typeCounts(allQs);
      const stock = Quiz.QUESTION_TYPE_ORDER.map((t) => `${Quiz.typeLabel(t)} ${counts[t] || 0}`).join(' / ');
      setup.innerHTML = v.showSetup ? `
        <div class="muted">考试按题型随机抽取：${Quiz.examPlanText()}</div>
        <div class="muted">现有题目：${stock}</div>
        <div class="row" style="gap:8px;align-items:center;margin-top:8px">
          <span class="muted">时长(分钟)</span><input data-el="mins" type="number" min="1" value="30" style="width:80px">
          <button class="btn primary" data-act="startExam">开始考试</button>
        </div>` : '';
      if (v.showSetup) setup.querySelector('[data-act="startExam"]').onclick = async () => {
        const all = await Quiz.listAllQuestions(repo, state.currentAccountId);
        if (!all.length) { window.alert('题库中还没有任何题目，请先添加题目。'); return; }
        // P6：按 20 单选 / 5 多选 / 10 判断 / 5 问答 / 2 代码 定量随机抽取
        const draw = Quiz.drawExamQuestions(all);
        if (!draw.list.length) { window.alert('题目不足，无法开始考试。'); return; }
        const mins = Math.max(1, Number(setup.querySelector('[data-el="mins"]').value) || 30);
        v.deadline = Date.now() + mins * 60000;
        startRunner('exam', draw.list);
      };
    }

    // ---------- 语音输入（桌面版才有麦克风桥，网页版整条不出现） ----------
    function voiceBarHTML(kind, win) {
      return buildVoiceBarHTML(kind, win);
    }

    // 一个按钮管一场录音：再点一次提前结束；说完静音自动结束
    // 图标按钮（话筒）不动文字，只切换高亮，否则会把里面的 SVG 覆盖掉
    function bindVoiceBar(btn, msg, { onText, tipIdle }) {
      if (!btn) return;
      const iconMode = btn.dataset.icon === 'mic';
      let runner = null;
      const idle = () => {
        if (iconMode) {
          btn.classList.remove('rec');
          btn.title = btn.dataset.tip || '语音作答';
        } else {
          btn.textContent = btn.dataset.label || btn.textContent;
        }
        if (msg) msg.textContent = tipIdle;
      };
      btn.dataset.tip = btn.title || '';
      if (!iconMode) btn.dataset.label = btn.textContent;
      btn.onclick = async () => {
        if (runner && runner.isRunning()) {
          runner.stop('manual');
          idle();
          return;
        }
        runner = createVoiceRunner({
          onPartial: (t) => { if (msg && t) msg.textContent = '我在听：' + t; },
          onFinal: (t) => { idle(); onText(t); },
          onError: (m) => { idle(); if (msg) msg.textContent = m; },
        });
        if (iconMode) {
          btn.classList.add('rec');
          btn.title = '正在听…（再点结束）';
        } else {
          btn.textContent = '正在听…（再点结束）';
        }
        if (msg) msg.textContent = '说吧，说完停两秒自动结束';
        const ok = await runner.start();
        if (!ok) idle();
      };
      // 交给调用方一个句柄：窗口关掉时能把还在跑的录音停下来
      return {
        stop: () => {
          if (runner && runner.isRunning()) {
            try { runner.stop('manual'); } catch (e) {}
            idle();
          }
        },
      };
    }

    const CAT_LABEL = { choice: '选择题', qa: '问答题', code: '代码题' };

    // 把口述解析结果填进表单；返回填了几处，跨题型时只填题干并说明
    function applyDictationToForm(cat, ctl, p) {
      const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`);
      let filled = 0;
      if (p.stem && g('stem')) {
        g('stem').value = p.stem;
        g('stem').dispatchEvent(new Event('input', { bubbles: true }));
        filled++;
      }
      if (p.category && p.category !== cat) {
        return { filled, note: `这句话像是${CAT_LABEL[p.category] || p.category}，当前是${CAT_LABEL[cat] || cat}表单，只填了题干` };
      }
      if (cat === 'choice') {
        const typeSel = g('type');
        if (p.type && ['single', 'multiple', 'judge'].includes(p.type)) {
          typeSel.value = p.type;
          renderChoiceOptions(ctl, typeSel.value);
        }
        if (typeSel.value === 'judge') {
          if (!p.judgeAnswer) return { filled, note: '' };
          const pick = ctl.body.querySelector(`input[name="jok"][value="${p.judgeAnswer}"]`);
          if (pick) { pick.checked = true; filled++; }
          return { filled, note: '' };
        }
        if (!p.options.length) return { filled, note: '' };
        const list = ctl.body.querySelector('[data-optlist]');
        if (!list) return { filled, note: '' };
        const multi = typeSel.value === 'multiple';
        list.innerHTML = '';
        const addRow = (text, checked) => {
          list.insertAdjacentHTML('beforeend', buildChoiceOptionRowHTML());
          const row = list.lastElementChild;
          row.querySelector('[data-opttext]').value = text || '';
          const mark = row.querySelector('[data-optok]');
          mark.type = multi ? 'checkbox' : 'radio';
          mark.checked = Boolean(checked);
          row.querySelector('[data-rowdel]').onclick = () => row.remove();
        };
        p.options.forEach((o) => addRow(o.text, p.answerLetters.includes(o.letter)));
        while (list.querySelectorAll('[data-optrow]').length < 2) addRow('', false);
        filled += p.options.length;
        return { filled, note: '' };
      }
      if (cat === 'qa') {
        if (p.refAnswer) { g('answer').value = p.refAnswer; filled++; }
        if (p.keywords.length) { g('keywords').value = p.keywords.join(','); filled++; }
        return { filled, note: '' };
      }
      if (p.lang) { g('lang').value = p.lang; filled++; }
      if (p.refCode) { g('refCode').value = p.refCode; filled++; }
      if (p.hint) { g('hint').value = p.hint; filled++; }
      return { filled, note: '' };
    }

    // 录题表单：整句念题 → 解析成字段 → 回填表单；实在没听出字段就原样接进最后点的框
    function bindVoiceToForm(cat, ctl) {
      const btn = ctl.overlay.querySelector('[data-act="voice"]');
      if (!btn) return;
      const msg = ctl.body.querySelector('[data-el="vmsg"]');
      const tipIdle = cat === 'choice'
        ? '念一句：题干是「…」，选项A是「…」，答案是A'
        : '念一句：题干是「…」，参考答案是「…」，关键词是 a,b';
      let lastField = null;
      ctl.body.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) lastField = t;
      });
      return bindVoiceBar(btn, msg, {
        tipIdle,
        onText: (text) => {
          const parsed = parseDictation(text);
          const { filled, note } = applyDictationToForm(cat, ctl, parsed);
          if (filled > 0) {
            const said = parsed.filled.length ? ['已识别：' + parsed.filled.join('、')] : [];
            if (note) said.push(note);
            else if (!parsed.done) said.push('还差 ' + parsed.missing.join('、'));
            if (msg) msg.textContent = said.join('；');
            return;
          }
          const field = lastField || ctl.body.querySelector('[data-f="stem"]');
          if (field) {
            field.value = appendVoiceText(field.value, text, { multiline: field.tagName === 'TEXTAREA' });
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (msg) msg.textContent = '没听出题目字段，已把原话接进当前框';
        },
      });
    }

    // 答题：选择类说「选B」直接勾上，问答/代码把话接进作答框
    function applyVoiceAnswer(q, scope, text) {
      const msg = scope.querySelector('[data-el="vmsg"]');
      if (q.categoryKey === 'choice') {
        const opts = q.options || [];
        const ids = pickChoiceIndexes(text, opts, { multiple: q.type === 'multiple' });
        if (!ids.length) {
          if (msg) msg.textContent = '没听出来选哪项，说「选B」或「第二个」试试';
          return;
        }
        scope.querySelectorAll('[name="opt"]').forEach((n) => { n.checked = false; });
        const nodes = scope.querySelectorAll('[name="opt"]');
        ids.forEach((i) => { if (nodes[i]) nodes[i].checked = true; });
        if (msg) msg.textContent = '已选：' + ids.map((i) => opts[i]).join('、');
        return;
      }
      const ta = scope.querySelector('[data-ans]');
      if (!ta) return;
      ta.value = appendVoiceText(ta.value, text, { multiline: true });
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      if (msg) msg.textContent = '已记：' + text;
    }

    // ---------- 录题模态 ----------
    function openAddQuestionModal() {
      const cat = v.cat;
      let voiceHandle = null;
      const ctl = openModal({
        title: '添加题目', submitText: '保存题目',
        boxClass: 'modal-box-wide',
        footExtra: cat === 'code' ? '' : buildVoiceMicHTML('form'),
        bodyHTML: buildQuestionForm(cat),
        onClose: () => { if (voiceHandle) { try { voiceHandle.stop(); } catch (e) {} } },
        onSubmit: async () => {
          const data = collectQuestion(cat, ctl);
          if (data.__error) { window.alert(data.__error); return true; }
          try { await Quiz.addQuestion(repo, v.bankId, data); }
          catch (e) { window.alert(e.message); return true; }
          await refresh();
          return false;
        },
      });
      voiceHandle = bindQuestionForm(cat, ctl);
    }

    // F2：编辑题目——复用题目表单并回显原值，提交走 updateQuestion
    function openEditQuestionModal(q) {
      const cat = q.categoryKey;
      let voiceHandle = null;
      const ctl = openModal({
        title: '编辑题目', submitText: '保存修改',
        boxClass: 'modal-box-wide',
        footExtra: cat === 'code' ? '' : buildVoiceMicHTML('form'),
        bodyHTML: buildQuestionForm(cat),
        onClose: () => { if (voiceHandle) { try { voiceHandle.stop(); } catch (e) {} } },
        onSubmit: async () => {
          const data = collectQuestion(cat, ctl);
          if (data.__error) { window.alert(data.__error); return true; }
          try { await Quiz.updateQuestion(repo, q.id, data); }
          catch (e) { window.alert(e.message); return true; }
          await refresh();
          return false;
        },
      });
      voiceHandle = bindQuestionForm(cat, ctl);
      prefillQuestion(cat, ctl, q);
    }

    function prefillQuestion(cat, ctl, q) {
      const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`);
      g('stem').value = q.stem || '';
      if (cat === 'choice') {
        const typeSel = g('type');
        typeSel.value = q.type || 'single';
        renderChoiceOptions(ctl, typeSel.value);
        if (typeSel.value === 'judge') {
          const pick = ctl.body.querySelector(`input[name="jok"][value="${q.answer}"]`);
          if (pick) pick.checked = true;
        } else {
          const list = ctl.body.querySelector('[data-optlist]');
          list.innerHTML = '';
          const ansSet = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
          (q.options || []).forEach((text) => {
            list.insertAdjacentHTML('beforeend', buildChoiceOptionRowHTML());
            const row = list.lastElementChild;
            row.querySelector('[data-opttext]').value = text;
            const mark = row.querySelector('[data-optok]');
            mark.type = typeSel.value === 'multiple' ? 'checkbox' : 'radio';
            row.querySelector('[data-rowdel]').onclick = () => row.remove();
            if (ansSet.has(text)) mark.checked = true;
          });
        }
        if (g('analysis')) g('analysis').value = q.analysis || '';
      } else if (cat === 'qa') {
        g('answer').value = q.answer || '';
        g('keywords').value = (q.keywords || []).join(',');
      } else {
        g('lang').value = q.lang || '';
        g('refCode').value = q.refCode || '';
        g('hint').value = q.hint || '';
      }
    }

    function buildQuestionForm(cat) {
      let extra = '';
      if (cat === 'choice') {
        extra = `
          <label>题型</label>
          <select data-f="type">
            <option value="single">单选</option>
            <option value="multiple">多选</option>
            <option value="judge">判断</option>
          </select>
          <div data-opts></div>
          <label>解析（可选）</label><input data-f="analysis" placeholder="解析">`;
      } else if (cat === 'qa') {
        extra = `
          <label>参考答案</label><textarea data-f="answer" rows="3"></textarea>
          <label>关键词，逗号分隔（命中全部即判对）</label><input data-f="keywords" placeholder="如：有序,可变">`;
      } else {
        extra = `
          <label>语言</label><input data-f="lang" placeholder="如 python">
          <label>参考代码</label><textarea data-f="refCode" rows="6" spellcheck="false"></textarea>
          <label>提示（可选）</label><input data-f="hint">`;
      }
      const head = cat === 'code'
        ? ''
        : `${buildVoiceGuideHTML(cat)}<div class="muted" data-el="vmsg" style="min-height:16px"></div>`;
      return `${head}<label>题干</label><input data-f="stem" placeholder="题目题干">${extra}`;
    }

    function bindQuestionForm(cat, ctl) {
      const voiceHandle = bindVoiceToForm(cat, ctl);
      if (cat !== 'choice') return voiceHandle;
      const typeSel = ctl.body.querySelector('[data-f="type"]');
      renderChoiceOptions(ctl, typeSel.value);
      typeSel.onchange = () => renderChoiceOptions(ctl, typeSel.value);
      return voiceHandle;
    }

    function renderChoiceOptions(ctl, type) {
      const box = ctl.body.querySelector('[data-opts]');
      if (type === 'judge') {
        box.innerHTML = `<label>正确答案（判断）</label>` + buildJudgeOptionHTML();
        return;
      }
      box.innerHTML = `<label>选项（勾选“正确”作为答案）</label>
        <div data-optlist></div>
        <button type="button" class="btn" data-addopt>添加选项</button>`;
      const list = box.querySelector('[data-optlist]');
      const addRow = () => {
        list.insertAdjacentHTML('beforeend', buildChoiceOptionRowHTML());
        const row = list.lastElementChild;
        const mark = row.querySelector('[data-optok]');
        mark.type = type === 'multiple' ? 'checkbox' : 'radio';
        row.querySelector('[data-rowdel]').onclick = () => row.remove();
      };
      box.querySelector('[data-addopt]').onclick = addRow;
      addRow(); addRow();
    }

    function collectQuestion(cat, ctl) {
      const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`);
      const stem = g('stem').value.trim();
      if (!stem) return { __error: '题干不能为空' };
      const data = { stem };
      if (cat === 'choice') {
        const type = g('type').value;
        if (type === 'judge') {
          const picked = ctl.body.querySelector('input[name="jok"]:checked');
          if (!picked) return { __error: '判断题请选择正确或错误' };
          data.type = 'judge';
          data.answer = picked.value;
        } else {
          const rows = Array.from(ctl.body.querySelectorAll('[data-optrow]'));
          const options = []; const correct = [];
          rows.forEach((row) => {
            const text = row.querySelector('[data-opttext]').value.trim();
            if (!text) return;
            options.push(text);
            if (row.querySelector('[data-optok]').checked) correct.push(text);
          });
          if (options.length < 2) return { __error: '单选/多选至少需要 2 个选项' };
          if (correct.length === 0) return { __error: '请标记至少一个正确选项' };
          data.type = type;
          data.options = options;
          data.answer = type === 'multiple' ? correct : correct[0];
          data.analysis = g('analysis').value.trim();
        }
      } else if (cat === 'qa') {
        data.answer = g('answer').value.trim();
        data.keywords = g('keywords').value.split(',').map((s) => s.trim()).filter(Boolean);
        if (data.keywords.length === 0) return { __error: '请至少填写一个关键词' };
      } else {
        data.lang = g('lang').value.trim();
        data.refCode = g('refCode').value;
        data.hint = g('hint').value.trim();
      }
      return data;
    }

    // ---------- 答题运行 ----------
    // 一旦弹窗已被关掉（比如用户点了右上角 ×），再开就重新建，别复用已移除的 DOM
    function openRunnerModal() {
      if (runnerCtl && !runnerCtl.closed()) return;
      runnerCtl = null;
      runnerCtl = openModal({
        title: v.mode === 'exam' ? '考试模式' : '顺序练习',
        boxClass: 'modal-box-wide',
        footer: false,
        bodyHTML: '<div data-el="rbody"></div>',
        onClose: () => {
          // 代码自己关的（退出/交卷）：清理已在 closeRunner 里做过，这里不再动页面
          if (runnerClosing) { runnerClosing = false; return; }
          // 用户点 × 或取消：等同取消本次作答，回到题库管理，不写成绩
          cleanupRunner();
          v.screen = 'manage';
          v.qs = []; v.i = 0; v.ans = {}; v.fb = {}; v.results = [];
          refresh();
        },
      });
    }

    // 统一清理：停计时、停录音、断开弹窗句柄（幂等，多处调用没有副作用）
    function cleanupRunner() {
      if (el.__timer) { clearInterval(el.__timer); el.__timer = null; }
      if (runnerVoice) {
        try { runnerVoice.stop(); } catch (e) {}
        runnerVoice = null;
      }
      runnerCtl = null;
    }

    function closeRunner() {
      runnerClosing = true;
      const c = runnerCtl;
      cleanupRunner();
      if (c) { try { c.close(); } catch (e) {} }
    }

    function startRunner(mode, qs) {
      v.mode = mode; v.qs = qs; v.i = 0; v.ans = {}; v.fb = {}; v.results = [];
      v.screen = 'runner'; v.startedAt = Date.now();
      openRunnerModal();
      refresh();
    }

    function questionHtml(q) {
      const cur = v.ans[v.i];
      const micBtn = buildVoiceMicHTML(q.categoryKey === 'choice' ? 'choice-answer' : 'answer');
      let body = '';
      if (q.categoryKey === 'choice') {
        const type = q.type;
        body = q.options.map((opt) => {
          const checked = type === 'multiple'
            ? (Array.isArray(cur) && cur.includes(opt) ? 'checked' : '')
            : (cur === opt ? 'checked' : '');
          return `<label class="row" style="gap:8px;padding:4px 0">
            <input type="${type === 'multiple' ? 'checkbox' : 'radio'}" name="opt" value="${esc(opt)}" ${checked}>
            <span>${esc(opt)}</span></label>`;
        }).join('');
      } else if (q.categoryKey === 'qa') {
        body = `<textarea data-ans style="width:100%;height:80px" placeholder="输入你的回答">${esc(cur || '')}</textarea>`;
      } else {
        body = `<textarea data-ans style="width:100%;height:120px" placeholder="写出你的代码（不运行，保存待人工批改）">${esc(cur || '')}</textarea>`;
      }
      const fb = v.fb[v.i];
      let fbHtml = '';
      if (v.mode === 'practice' && fb) {
        fbHtml = `<div class="muted" style="margin-top:8px;color:${fb.correct === null ? 'var(--muted)' : (fb.correct ? 'green' : '#c00')}">
          ${fb.correct === null ? '已保存，待人工批改' : (fb.correct ? '回答正确' : '回答错误')}
          ${fb.correct === false && fb.total != null ? `（关键词命中 ${fb.hit}/${fb.total}）` : ''}</div>`;
      }
      return `<div class="card">
        <div class="muted">第 ${v.i + 1} / ${v.qs.length} 题${v.mode === 'exam' ? ' · 考试中' : ''}</div>
        <div style="font-weight:600;margin:6px 0">${esc(q.stem)}</div>
        <div>${body}</div>
        ${fbHtml}
        <div class="row" style="gap:8px;margin-top:10px">
          <button class="btn" data-act="prev" ${v.i === 0 ? 'disabled' : ''}>上一题</button>
          ${v.mode === 'practice' ? '<button class="btn primary" data-act="check">提交本题</button>' : ''}
          <button class="btn" data-act="next" ${v.i >= v.qs.length - 1 ? 'disabled' : ''}>下一题</button>
          ${micBtn}
          <button class="btn" data-act="quit" style="color:#c00">退出</button>
          ${v.mode === 'exam'
            ? '<button class="btn primary" data-act="submit" style="margin-left:auto">交卷</button>'
            : '<button class="btn" data-act="finish" style="margin-left:auto">结束练习</button>'}
        </div>
        <div class="muted" data-el="vmsg" style="min-height:16px;margin-top:6px"></div>
      </div>`;
    }

    function collectAnswer(q) {
      const scope = runnerCtl ? runnerCtl.body : main;
      if (q.categoryKey === 'choice') {
        const nodes = scope.querySelectorAll('[name="opt"]:checked');
        const vals = Array.from(nodes).map((n) => n.value);
        return q.type === 'multiple' ? vals : (vals[0] || '');
      }
      const ta = scope.querySelector('[data-ans]');
      return ta ? ta.value : '';
    }

    function renderRunner() {
      const q = v.qs[v.i];
      if (!runnerCtl) openRunnerModal();
      const body = runnerCtl.body.querySelector('[data-el="rbody"]');
      body.innerHTML = questionHtml(q);
      if (v.mode === 'exam') {
        if (el.__timer) clearInterval(el.__timer);
        const tick = () => {
          const left = Math.max(0, Math.round((v.deadline - Date.now()) / 1000));
          const badge = body.querySelector('[data-el="clock"]');
          if (badge) badge.textContent = `剩余 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
          if (left <= 0) { clearInterval(el.__timer); el.__timer = null; finishExam(); }
        };
        body.querySelector('.card').insertAdjacentHTML('afterbegin', '<div data-el="clock" class="muted"></div>');
        tick();
        el.__timer = setInterval(tick, 1000);
      }
      if (runnerVoice) {
        try { runnerVoice.stop(); } catch (e) {}
        runnerVoice = null;
      }
      const vbtn = body.querySelector('[data-act="voice"]');
      if (vbtn) runnerVoice = bindVoiceBar(vbtn, body.querySelector('[data-el="vmsg"]'), {
        tipIdle: q.categoryKey === 'choice' ? '说「选B」或「第二个」' : '说一句，我记下来',
        onText: (text) => applyVoiceAnswer(q, body, text),
      });
      body.querySelector('[data-act="prev"]').onclick = () => { v.ans[v.i] = collectAnswer(q); v.i--; refresh(); };
      body.querySelector('[data-act="next"]').onclick = () => { v.ans[v.i] = collectAnswer(q); v.i++; refresh(); };
      const chk = body.querySelector('[data-act="check"]');
      if (chk) chk.onclick = () => {
        v.ans[v.i] = collectAnswer(q);
        const r = gradeQuestion(q, v.ans[v.i]);
        v.fb[v.i] = { correct: r.correct, hit: r.hit, total: r.total };
        refresh();
      };
      const fin = body.querySelector('[data-act="finish"]');
      if (fin) fin.onclick = () => finish(false);
      const sub = body.querySelector('[data-act="submit"]');
      if (sub) sub.onclick = () => { openConfirm({ title: '交卷确认', message: '确定交卷？', confirmText: '交卷', onConfirm: () => finishExam() }); };
      const qt = body.querySelector('[data-act="quit"]');
      if (qt) qt.onclick = () => { closeRunner(); v.screen = 'manage'; refresh(); };
    }

    function finishExam() { v.ans[v.i] = collectAnswer(v.qs[v.i]); finish(true); }

    async function finish(asExam) {
      closeRunner();
      let score = 0;
      const startedAt = v.startedAt || Date.now();
      v.results = v.qs.map((q, idx) => {
        const r = gradeQuestion(q, v.ans[idx]);
        if (r.score) score += r.score;
        return {
          questionId: q.id, stem: q.stem, categoryKey: q.categoryKey,
          correct: r.correct, manual: !!r.manual, userAnswer: v.ans[idx], hit: r.hit, total: r.total,
          answer: q.answer, analysis: q.analysis, refCode: q.refCode, hint: q.hint, keywords: q.keywords,
        };
      });
      const timeSpent = Date.now() - startedAt;
      v.elapsed = timeSpent;
      v.screen = 'result';
      await Quiz.saveAttempt(repo, state.currentAccountId, {
        bankId: v.bankId, mode: v.mode, score, total: v.qs.length, details: v.results,
        startedAt, submittedAt: Date.now(), timeSpent,
      });
      v.summary = { score, total: v.qs.length };
      refresh();
    }

    function renderResult() {
      const { score, total } = v.summary || { score: 0, total: 0 };
      main.innerHTML = buildResultHTML({
        score, total, elapsed: v.elapsed, details: v.results, readOnly: !!v.readOnly,
      });
      main.querySelector('[data-act="back"]').onclick = () => {
        v.screen = 'manage';
        v.readOnly = false;
        v.results = [];
        v.elapsed = 0;
        refresh();
      };
    }

    refresh();
  },
};