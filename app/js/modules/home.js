// AI生成
// 首页总览：问候 + 今日计划卡（可勾选） + 快速备忘卡（可输入） + 同组/题库/记账摘要
import { TodayPlan } from '../lib/todayplan.js';
import { Memo } from '../lib/memo.js';
import { Ledger } from '../lib/ledger.js';
import { Group, Task } from '../lib/group.js';
import { Quiz } from '../lib/quiz.js';
import { todayStr, monthStr, formatAmount } from '../lib/utils.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function yuan(v) { const s = formatAmount(v); return s === '' ? '0.00' : s; }

export default {
  route: 'home',
  title: '首页总览',
  mount(el, ctx) {
    const { repo, state } = ctx;

    el.innerHTML = `
      <div style="margin-bottom:14px"><h2 data-el="greet" style="margin:0"></h2></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>今日计划</strong><a href="#today" class="muted">查看全部 &rsaquo;</a>
          </div>
          <div data-el="todayPlan" style="margin-top:8px"></div>
        </div>
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>快速备忘</strong><span class="muted">回车保存</span>
          </div>
          <input data-el="memoInput" placeholder="随手记一条，回车保存" style="width:100%;margin:8px 0">
          <div data-el="memo"></div>
        </div>
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>同组计划</strong><a href="#group" class="muted">进入 &rsaquo;</a>
          </div>
          <div class="muted" data-el="group" style="margin-top:8px">&mdash;</div>
        </div>
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>题库</strong><a href="#quiz" class="muted">进入 &rsaquo;</a>
          </div>
          <div class="muted" data-el="quiz" style="margin-top:8px">&mdash;</div>
        </div>
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>每日记账</strong><a href="#ledger" class="muted">去记账 &rsaquo;</a>
          </div>
          <div data-el="ledger" style="margin-top:8px"></div>
        </div>
      </div>`;

    const q = (s) => el.querySelector(s);
    const greet = q('[data-el="greet"]');
    const todayPlanEl = q('[data-el="todayPlan"]');
    const memoInput = q('[data-el="memoInput"]');
    const memoEl = q('[data-el="memo"]');
    const groupEl = q('[data-el="group"]');
    const quizEl = q('[data-el="quiz"]');
    const ledgerEl = q('[data-el="ledger"]');

    // 首页勾选今日待办 → 直接回写 todoplan（与「今日计划」模块共享同一份数据，双向联动）
    el.addEventListener('change', async (e) => {
      const id = e.target.dataset && e.target.dataset.hToggle;
      if (id) {
        await TodayPlan.toggle(repo, id);
        await refresh();
        state.emit();
      }
    });

    memoInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const accId = state.currentAccountId;
      const text = memoInput.value.trim();
      if (!text) return;
      if (!accId) { window.alert('请先在设置中创建并选择账号'); return; }
      try {
        await Memo.add(repo, accId, text);
        memoInput.value = '';
        await refresh();
        state.emit();
      } catch (err) { window.alert(err.message); }
    });

    async function refresh() {
      const accId = state.currentAccountId;
      const now = new Date();
      greet.textContent = `今天是 ${todayStr(now)}，祝你顺利`;

      if (!accId) {
        todayPlanEl.innerHTML = '<div class="muted">请先在设置中创建账号。</div>';
        memoEl.innerHTML = '<div class="muted">&mdash;</div>';
        groupEl.innerHTML = '&mdash;';
        quizEl.innerHTML = '&mdash;';
        ledgerEl.innerHTML = '<div class="muted">&mdash;</div>';
        return;
      }

      const rows = await TodayPlan.listByDate(repo, accId, todayStr(now));
      const undone = rows.filter((r) => !r.done);
      if (rows.length === 0) {
        todayPlanEl.innerHTML = '<div class="muted">今天还没有计划。</div>';
      } else {
        todayPlanEl.innerHTML = rows.slice(0, 4).map((r) => `
          <div class="row" style="gap:8px;padding:4px 0">
            <input type="checkbox" ${r.done ? 'checked' : ''} data-h-toggle="${r.id}">
            <span style="${r.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${escapeHtml(r.title)}</span>
          </div>`).join('') + `<div class="muted" style="margin-top:6px">待完成 ${undone.length} 项 / 共 ${rows.length} 项</div>`;
      }

      const memos = await Memo.list(repo, accId, 5);
      memoEl.innerHTML = memos.length === 0
        ? '<div class="muted">暂无备忘</div>'
        : memos.map((m) => `<div style="padding:3px 0">&bull; ${escapeHtml(m.text)}</div>`).join('');

      const day = await Ledger.dayTotal(repo, accId, todayStr(now));
      const ms = await Ledger.monthSummary(repo, accId, monthStr(now));
      ledgerEl.innerHTML = `<div>今日合计：<strong>¥ ${yuan(day.total)}</strong>（${day.count} 笔）</div>
        <div class="muted" style="margin-top:4px">本月合计：¥ ${yuan(ms.total)}</div>`;

      // 同组计划摘要
      const groups = await Group.listForAccount(repo, accId);
      let pendingReview = 0;
      let myTodo = 0;
      for (const g of groups) {
        const tasks = await Task.listTasks(repo, g.id);
        const canReview = g.role === 'owner' || g.role === 'deputy';
        for (const t of tasks) {
          if (canReview && t.status === 'review') pendingReview += 1;
          if (t.assigneeAccountId === accId && t.status !== 'done') myTodo += 1;
        }
      }
      groupEl.innerHTML = groups.length === 0
        ? '<div class="muted">尚未加入小组</div>'
        : `<div>我的小组：<strong>${groups.length}</strong> 个</div>
           <div class="muted" style="margin-top:4px">待我审核：${pendingReview} · 我的任务：${myTodo}</div>`;

      // 题库摘要
      const banks = await Quiz.listBanks(repo, accId);
      let qCount = 0;
      for (const b of banks) qCount += (await Quiz.listQuestions(repo, b.id)).length;
      const atts = await Quiz.listAttempts(repo, accId);
      const last = atts[0];
      quizEl.innerHTML = `<div>题库：<strong>${banks.length}</strong> 个 · <strong>${qCount}</strong> 题</div>
        <div class="muted" style="margin-top:4px">${last ? `最近成绩：${last.score}/${last.total}（${last.mode === 'exam' ? '考试' : '练习'}）` : '暂无答题记录'}</div>`;
    }

    if (el.__unsub) el.__unsub();
    el.__unsub = state.subscribe(() => { refresh(); });

    refresh();
  },
};