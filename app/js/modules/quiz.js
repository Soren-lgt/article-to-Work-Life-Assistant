// AI生成
// 题库模块：选择/问答/代码 三类别 → 题库 → 题目；顺序练习 / 考试模式（倒计时）/ 成绩历史 / 错题回看
import { Quiz } from '../lib/quiz.js';
import { gradeQuestion, filterWrong, accuracy } from '../lib/scoring.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
        <div class="row" data-el="cats" style="gap:8px"></div>
      </div>
      <div data-el="main"></div>`;
    const catsBar = el.querySelector('[data-el="cats"]');
    const main = el.querySelector('[data-el="main"]');

    async function renderCats() {
      const cats = await Quiz.ensureCategories(repo);
      catsBar.innerHTML = cats.map((c) =>
        `<button class="btn ${c.key === v.cat ? 'primary' : ''}" data-cat="${c.key}">${esc(c.name)}</button>`).join('');
      catsBar.querySelectorAll('[data-cat]').forEach((b) => {
        b.onclick = () => { v.cat = b.dataset.cat; v.bankId = null; v.screen = 'manage'; refresh(); };
      });
    }

    async function refresh() {
      await renderCats();
      if (!state.currentAccountId) { main.innerHTML = '<div class="card muted">请先在设置中创建账号。</div>'; return; }
      if (v.screen === 'runner') return renderRunner();
      if (v.screen === 'result') return renderResult();
      return renderManage();
    }

    // ---------- 管理 ----------
    async function renderManage() {
      const accId = state.currentAccountId;
      const banks = await Quiz.listBanks(repo, accId, v.cat);
      if (v.bankId && !banks.some((b) => b.id === v.bankId)) v.bankId = null;
      if (!v.bankId && banks.length) v.bankId = banks[0].id;
      const qs = v.bankId ? await Quiz.listQuestions(repo, v.bankId) : [];

      main.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>题库</strong>
            <button class="btn primary" data-act="newBank">+ 新建题库</button>
          </div>
          <div class="row" data-el="banks" style="gap:8px;flex-wrap:wrap;margin-top:8px"></div>
        </div>
        <div class="card" data-el="qlist"></div>
        ${v.bankId ? '<div class="card" data-el="addQ"></div>' : ''}
        <div class="card">
          <strong>答题</strong>
          <div class="row" style="gap:8px;margin-top:8px">
            <button class="btn" data-act="practice" ${qs.length ? '' : 'disabled'}>顺序练习</button>
            <button class="btn" data-act="examSetup" ${qs.length ? '' : 'disabled'}>考试模式</button>
            <span class="muted">共 ${qs.length} 题</span>
          </div>
          <div data-el="setup"></div>
        </div>
        <div class="card" data-el="history"></div>`;

      const banksEl = main.querySelector('[data-el="banks"]');
      banksEl.innerHTML = banks.length
        ? banks.map((b) => `<button class="btn ${b.id === v.bankId ? 'primary' : ''}" data-bank="${b.id}">${esc(b.name)}</button>`).join('')
        : '<span class="muted">还没有题库，先新建一个。</span>';
      banksEl.querySelectorAll('[data-bank]').forEach((b) => {
        b.onclick = () => { v.bankId = b.dataset.bank; refresh(); };
      });

      const qlist = main.querySelector('[data-el="qlist"]');
      qlist.innerHTML = `
        <div class="row" style="justify-content:space-between">
          <strong>题目列表</strong>
          ${v.bankId ? '<button class="btn" data-act="delBank" style="color:#c00">删除题库</button>' : ''}
        </div>
        <div style="margin-top:8px">${qs.length ? qs.map((q, i) => `
          <div class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
            <span class="muted">${i + 1}.</span>
            <span style="flex:1">${esc(q.stem)}</span>
            <button class="btn" data-delq="${q.id}" style="color:#c00">删除</button>
          </div>`).join('') : '<span class="muted">此题库暂无题目。</span>'}</div>`;
      qlist.querySelectorAll('[data-delq]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('确定删除该题目？')) return;
          await Quiz.removeQuestion(repo, b.dataset.delq);
          refresh();
        };
      });

      const addQ = main.querySelector('[data-el="addQ"]');
      if (addQ) renderAddQuestion(addQ);

      main.querySelector('[data-act="newBank"]').onclick = async () => {
        const name = prompt('题库名称：');
        if (name == null) return;
        try { const b = await Quiz.addBank(repo, accId, v.cat, name); v.bankId = b.id; refresh(); }
        catch (e) { alert(e.message); }
      };
      const db = main.querySelector('[data-act="delBank"]');
      if (db) db.onclick = async () => {
        if (!confirm('删除题库会同时删除其全部题目，确定？')) return;
        await Quiz.removeBank(repo, v.bankId); v.bankId = null; refresh();
      };
      main.querySelector('[data-act="practice"]').onclick = () => startRunner('practice', qs);
      main.querySelector('[data-act="examSetup"]').onclick = () => {
        v.showSetup = !v.showSetup;
        const s = main.querySelector('[data-el="setup"]');
        s.innerHTML = v.showSetup ? `
          <div class="row" style="gap:8px;margin-top:10px;align-items:center">
            <span class="muted">抽题数</span><input data-el="cnt" type="number" min="1" max="${qs.length}" value="${Math.min(10, qs.length)}" style="width:80px">
            <span class="muted">时长(分钟)</span><input data-el="mins" type="number" min="1" value="10" style="width:80px">
            <button class="btn primary" data-act="startExam">开始考试</button>
          </div>` : '';
        if (v.showSetup) s.querySelector('[data-act="startExam"]').onclick = () => {
          const cnt = Math.max(1, Math.min(qs.length, Number(s.querySelector('[data-el="cnt"]').value) || 1));
          const mins = Math.max(1, Number(s.querySelector('[data-el="mins"]').value) || 10);
          const picked = Quiz.drawQuestions(qs, cnt);
          v.deadline = Date.now() + mins * 60000;
          startRunner('exam', picked);
        };
      };

      const hist = main.querySelector('[data-el="history"]');
      const atts = await Quiz.listAttempts(repo, accId);
      hist.innerHTML = `<strong>成绩历史</strong><div style="margin-top:8px">${atts.length
        ? atts.slice(0, 10).map((a) => `<div class="row" style="justify-content:space-between;padding:4px 0">
            <span>${a.mode === 'exam' ? '考试' : '练习'} · ${esc(new Date(a.createdAt).toLocaleString())}${a.timeSpent ? ` · 用时 ${Math.round(a.timeSpent / 1000)}s` : ''}</span>
            <span>${a.score}/${a.total}</span></div>`).join('')
        : '<span class="muted">暂无记录。</span>'}</div>`;
    }

    // ---------- 录题 ----------
    function renderAddQuestion(box) {
      const cat = v.cat;
      let formHtml = '<div class="row" style="justify-content:space-between"><strong>新增题目</strong></div><div style="margin-top:8px">';
      formHtml += '<input data-f="stem" placeholder="题干" style="width:100%;margin-bottom:6px">';
      if (cat === 'choice') {
        formHtml += `<select data-f="type" style="margin-bottom:6px"><option value="single">单选</option><option value="multiple">多选</option><option value="judge">判断</option></select>
          <input data-f="options" placeholder="选项，逗号分隔（判断题可留空）" style="width:100%;margin-bottom:6px">
          <input data-f="answer" placeholder="正确答案（多选用逗号分隔）" style="width:100%;margin-bottom:6px">
          <input data-f="analysis" placeholder="解析（可选）" style="width:100%;margin-bottom:6px">`;
      } else if (cat === 'qa') {
        formHtml += `<input data-f="answer" placeholder="参考答案" style="width:100%;margin-bottom:6px">
          <input data-f="keywords" placeholder="关键词，逗号分隔（命中全部即判对）" style="width:100%;margin-bottom:6px">`;
      } else {
        formHtml += `<input data-f="lang" placeholder="语言，如 python" style="width:100%;margin-bottom:6px">
          <textarea data-f="refCode" placeholder="参考代码" style="width:100%;height:70px;margin-bottom:6px"></textarea>
          <input data-f="hint" placeholder="提示（可选）" style="width:100%;margin-bottom:6px">`;
      }
      formHtml += '<button class="btn primary" data-act="saveQ">保存题目</button></div>';
      box.innerHTML = formHtml;
      box.querySelector('[data-act="saveQ"]').onclick = async () => {
        const g = (k) => box.querySelector(`[data-f="${k}"]`);
        const data = { stem: g('stem').value.trim() };
        try {
          if (cat === 'choice') {
            data.type = g('type').value;
            data.options = g('options').value.split(',').map((s) => s.trim()).filter(Boolean);
            const ans = g('answer').value.split(',').map((s) => s.trim()).filter(Boolean);
            data.answer = data.type === 'multiple' ? ans : (ans[0] || '');
            data.analysis = g('analysis').value.trim();
          } else if (cat === 'qa') {
            data.answer = g('answer').value.trim();
            data.keywords = g('keywords').value.split(',').map((s) => s.trim()).filter(Boolean);
          } else {
            data.lang = g('lang').value.trim();
            data.refCode = g('refCode').value;
            data.hint = g('hint').value.trim();
          }
          await Quiz.addQuestion(repo, v.bankId, data);
          refresh();
        } catch (e) { alert(e.message); }
      };
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