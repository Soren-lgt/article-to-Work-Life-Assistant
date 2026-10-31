// AI生成
// 题库模块：选择/问答/代码三类 → 题库（列表行：进入/删除）→ 题目；顺序练习/考试模式/新建题库同排；录题走可靠模态
import { Quiz } from '../lib/quiz.js';
import { gradeQuestion, filterWrong, accuracy } from '../lib/scoring.js';
import { openModal } from '../ui/modal.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- 可测纯函数：UI 片段 ----------
// 顶部动作行：顺序练习、考试模式在新建题库左侧，三者挨在一起
export function buildTopActionsHTML(qsCount = 0) {
  const ok = qsCount > 0 ? '' : 'disabled';
  return `<span class="row" style="gap:6px;margin-left:auto">
    <button class="btn" data-act="practice" ${ok}>顺序练习</button>
    <button class="btn" data-act="examSetup" ${ok}>考试模式</button>
    <button class="btn primary" data-act="newBank">新建题库</button>
  </span>`;
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

export default {
  route: 'quiz',
  title: '题库',
  mount(el, ctx) {
    const { repo, state } = ctx;
    if (el.__timer) { clearInterval(el.__timer); el.__timer = null; }

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
      if (pb) pb.onclick = async () => { const list = await currentQuestions(); startRunner('practice', list); };
      const eb = catsBar.querySelector('[data-act="examSetup"]');
      if (eb) eb.onclick = async () => {
        const list = await currentQuestions();
        if (!list.length) return;
        v.showSetup = !v.showSetup; renderSetup();
      };
      const nb = catsBar.querySelector('[data-act="newBank"]');
      if (nb) nb.onclick = openNewBankModal;
    }

    async function refresh() {
      await renderCats();
      if (!state.currentAccountId) { main.innerHTML = '<div class="card muted">请先在设置中创建账号。</div>'; return; }
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
          <strong>${esc(catName())}题库列表</strong>
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
        b.onclick = async () => {
          if (!confirm('删除题库会同时删除其全部题目，确定？')) return;
          await Quiz.removeBank(repo, b.dataset.delbank);
          if (v.bankId === b.dataset.delbank) v.bankId = null;
          refresh();
        };
      });

      const addQ = main.querySelector('[data-act="addQ"]');
      if (addQ) addQ.onclick = openAddQuestionModal;

      main.querySelectorAll('[data-delq]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('确定删除该题目？')) return;
          await Quiz.removeQuestion(repo, b.dataset.delq);
          refresh();
        };
      });

      renderSetup();

      const hist = main.querySelector('[data-el="history"]');
      const atts = await Quiz.listAttempts(repo, accId);
      hist.innerHTML = `<strong>成绩历史</strong><div style="margin-top:8px">${atts.length
        ? atts.slice(0, 10).map((a) => `<div class="row" style="justify-content:space-between;padding:4px 0">
            <span>${a.mode === 'exam' ? '考试' : '练习'} · ${esc(new Date(a.createdAt).toLocaleString())}${a.timeSpent ? ` · 用时 ${Math.round(a.timeSpent / 1000)}s` : ''}</span>
            <span>${a.score}/${a.total}</span></div>`).join('')
        : '<span class="muted">暂无记录。</span>'}</div>`;
    }

    function catName() {
      return { choice: '选择', qa: '问答', code: '代码' }[v.cat] || '';
    }

    function renderSetup() {
      const setup = main.querySelector('[data-el="setup"]');
      if (!setup) return;
      const qs = [];
      setup.innerHTML = v.showSetup ? `
        <div class="row" style="gap:8px;align-items:center">
          <span class="muted">抽题数</span><input data-el="cnt" type="number" min="1" value="10" style="width:80px">
          <span class="muted">时长(分钟)</span><input data-el="mins" type="number" min="1" value="10" style="width:80px">
          <button class="btn primary" data-act="startExam">开始考试</button>
        </div>` : '';
      if (v.showSetup) setup.querySelector('[data-act="startExam"]').onclick = async () => {
        const list = await currentQuestions();
        if (!list.length) return;
        const cnt = Math.max(1, Math.min(list.length, Number(setup.querySelector('[data-el="cnt"]').value) || 1));
        const mins = Math.max(1, Number(setup.querySelector('[data-el="mins"]').value) || 10);
        const picked = Quiz.drawQuestions(list, cnt);
        v.deadline = Date.now() + mins * 60000;
        startRunner('exam', picked);
      };
    }

    // ---------- 录题模态 ----------
    function openAddQuestionModal() {
      const cat = v.cat;
      const ctl = openModal({
        title: '添加题目', submitText: '保存题目',
        bodyHTML: buildQuestionForm(cat),
        onSubmit: async () => {
          const data = collectQuestion(cat, ctl);
          if (data.__error) { window.alert(data.__error); return true; }
          try { await Quiz.addQuestion(repo, v.bankId, data); }
          catch (e) { window.alert(e.message); return true; }
          await refresh();
          return false;
        },
      });
      bindQuestionForm(cat, ctl);
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
      return `<label>题干</label><input data-f="stem" placeholder="题目题干">${extra}`;
    }

    function bindQuestionForm(cat, ctl) {
      if (cat !== 'choice') return;
      const typeSel = ctl.body.querySelector('[data-f="type"]');
      renderChoiceOptions(ctl, typeSel.value);
      typeSel.onchange = () => renderChoiceOptions(ctl, typeSel.value);
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
    function startRunner(mode, qs) {
      v.mode = mode; v.qs = qs; v.i = 0; v.ans = {}; v.fb = {}; v.results = [];
      v.screen = 'runner'; v.startedAt = Date.now();
      refresh();
    }

    function questionHtml(q) {
      const cur = v.ans[v.i];
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
          ${v.mode === 'exam'
            ? '<button class="btn primary" data-act="submit" style="margin-left:auto">交卷</button>'
            : '<button class="btn" data-act="finish" style="margin-left:auto">结束练习</button>'}
        </div>
      </div>`;
    }

    function collectAnswer(q) {
      if (q.categoryKey === 'choice') {
        const nodes = main.querySelectorAll('[name="opt"]:checked');
        const vals = Array.from(nodes).map((n) => n.value);
        return q.type === 'multiple' ? vals : (vals[0] || '');
      }
      const ta = main.querySelector('[data-ans]');
      return ta ? ta.value : '';
    }

    function renderRunner() {
      const q = v.qs[v.i];
      main.innerHTML = questionHtml(q);
      if (v.mode === 'exam') {
        if (el.__timer) clearInterval(el.__timer);
        const tick = () => {
          const left = Math.max(0, Math.round((v.deadline - Date.now()) / 1000));
          const badge = main.querySelector('[data-el="clock"]');
          if (badge) badge.textContent = `剩余 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
          if (left <= 0) { clearInterval(el.__timer); el.__timer = null; finishExam(); }
        };
        main.querySelector('.card').insertAdjacentHTML('afterbegin', '<div data-el="clock" class="muted"></div>');
        tick();
        el.__timer = setInterval(tick, 1000);
      }
      main.querySelector('[data-act="prev"]').onclick = () => { v.ans[v.i] = collectAnswer(q); v.i--; refresh(); };
      main.querySelector('[data-act="next"]').onclick = () => { v.ans[v.i] = collectAnswer(q); v.i++; refresh(); };
      const chk = main.querySelector('[data-act="check"]');
      if (chk) chk.onclick = () => {
        v.ans[v.i] = collectAnswer(q);
        const r = gradeQuestion(q, v.ans[v.i]);
        v.fb[v.i] = { correct: r.correct, hit: r.hit, total: r.total };
        refresh();
      };
      const fin = main.querySelector('[data-act="finish"]');
      if (fin) fin.onclick = () => finish(false);
      const sub = main.querySelector('[data-act="submit"]');
      if (sub) sub.onclick = () => { if (confirm('确定交卷？')) finishExam(); };
    }

    function finishExam() { v.ans[v.i] = collectAnswer(v.qs[v.i]); finish(true); }

    async function finish(asExam) {
      if (el.__timer) { clearInterval(el.__timer); el.__timer = null; }
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

    function answerText(r) {
      if (r.categoryKey === 'choice') {
        return Array.isArray(r.answer) ? r.answer.join('、') : String(r.answer ?? '');
      }
      if (r.categoryKey === 'qa') return r.answer || '';
      return r.refCode || '';
    }

    function renderResult() {
      const { score, total } = v.summary || { score: 0, total: 0 };
      const wrong = filterWrong(v.results);
      const rate = Math.round(accuracy(score, total) * 100);
      const sec = v.elapsed ? Math.round(v.elapsed / 1000) : 0;
      main.innerHTML = `<div class="card">
        <strong>本次成绩：${score} / ${total}</strong>
        <span class="muted"> · 正确率 ${rate}% · 错题 ${wrong.length} 道 · 用时 ${sec}s</span>
        <div style="margin-top:10px">${v.results.map((r, i) => {
          const ok = r.manual ? null : r.correct;
          const label = r.manual ? '待人工批改' : (r.correct ? '正确' : '错误');
          const style = r.manual ? 'var(--muted)' : (r.correct ? 'green' : '#c00');
          const showAns = ok === false ? `
            <div class="muted" style="padding-left:18px;margin:2px 0 6px">
              参考答案：${esc(answerText(r))}
              ${r.analysis ? ` · 解析：${esc(r.analysis)}` : ''}
              ${r.categoryKey === 'qa' && r.keywords ? `（关键词：${esc(r.keywords.join('、'))}）` : ''}
              ${r.hint ? `<br>提示：${esc(r.hint)}` : ''}
            </div>` : '';
          return `<div style="padding:4px 0;border-bottom:1px solid var(--line)">
            <div class="row" style="justify-content:space-between">
              <span>${i + 1}. ${esc(r.stem)}</span>
              <span style="color:${style}">${label}</span>
            </div>${showAns}</div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn primary" data-act="back">返回题库</button></div>
      </div>`;
      main.querySelector('[data-act="back"]').onclick = () => { v.screen = 'manage'; refresh(); };
    }

    refresh();
  },
};