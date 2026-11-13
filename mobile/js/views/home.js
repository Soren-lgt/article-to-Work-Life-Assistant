// 首页总览（移动版）：四摘要卡 + 今日待办勾选联动 + 右下角问候
import { TodayPlan } from '../../../app/js/lib/todayplan.js';
import { Ledger } from '../../../app/js/lib/ledger.js';
import { Group, Task } from '../../../app/js/lib/group.js';
import { Quiz } from '../../../app/js/lib/quiz.js';
import { DevWork } from '../../../app/js/lib/devwork.js';
import { todayStr, monthStr, formatAmount } from '../../../app/js/lib/utils.js';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function yuan(v) { const s = formatAmount(v); return s === '' ? '0.00' : s; }

export default {
  route: 'home', title: '首页总览',
  mount(el, ctx) {
    const { repo, state } = ctx;
    el.innerHTML = `
      <div class="home-grid">
        <div class="card nav-card" data-goto="#today"><strong>今日计划</strong><div data-el="todayPlan" style="margin-top:8px"></div></div>
        <div class="card nav-card" data-goto="#group"><strong>同组计划</strong><div class="muted" data-el="group" style="margin-top:8px">&mdash;</div></div>
        <div class="card nav-card span-2" data-goto="#devwork"><strong>开发工作</strong>
          <div class="muted" data-el="devSummary" style="margin-top:4px"></div>
          <div data-el="devTasks" style="margin-top:8px"></div></div>
        <div class="card nav-card" data-goto="#quiz"><strong>题库</strong><div class="muted" data-el="quiz" style="margin-top:8px">&mdash;</div></div>
        <div class="card nav-card" data-goto="#ledger"><strong>每日记账</strong><div data-el="ledger" style="margin-top:8px"></div></div>
      </div>
      <div data-el="greet" class="greet-corner"></div>`;
    const q = (s) => el.querySelector(s);
    const greet = q('[data-el="greet"]'), todayPlanEl = q('[data-el="todayPlan"]');
    const groupEl = q('[data-el="group"]'), quizEl = q('[data-el="quiz"]'), ledgerEl = q('[data-el="ledger"]');
    const devSummaryEl = q('[data-el="devSummary"]'), devTasksEl = q('[data-el="devTasks"]');

    el.addEventListener('click', (e) => {
      const card = e.target && typeof e.target.closest === 'function' ? e.target.closest('.nav-card') : null;
      if (!card) return;
      if (e.target.closest && e.target.closest('button,input,select,textarea,label,a')) return;
      window.location.hash = card.dataset.goto;
    });
    el.addEventListener('change', async (e) => {
      const id = e.target.dataset && e.target.dataset.hToggle;
      if (id) { await TodayPlan.toggle(repo, id); await refresh(); state.emit(); }
    });

    async function refresh() {
      const accId = state.currentAccountId;
      const now = new Date();
      greet.textContent = `今天是 ${todayStr(now)}，祝你顺利`;
      if (!accId) {
        todayPlanEl.innerHTML = '<div class="muted">请先在右上角登录账号。</div>';
        groupEl.innerHTML = '&mdash;'; quizEl.innerHTML = '&mdash;';
        devSummaryEl.textContent = ''; devTasksEl.innerHTML = '<div class="muted">请先在右上角登录账号。</div>';
        ledgerEl.innerHTML = '<div class="muted">&mdash;</div>'; return;
      }
      const rows = await TodayPlan.listByDate(repo, accId, todayStr(now));
      const undone = rows.filter((r) => !r.done);
      todayPlanEl.innerHTML = rows.length === 0
        ? '<div class="muted">今天还没有计划。</div>'
        : rows.slice(0, 4).map((r) => `
          <label class="row" style="gap:8px;padding:3px 0">
            <input type="checkbox" ${r.done ? 'checked' : ''} data-h-toggle="${r.id}">
            <span style="${r.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${escapeHtml(r.title)}</span>
          </label>`).join('') + `<div class="muted" style="margin-top:6px">待完成 ${undone.length} 项 / 共 ${rows.length} 项</div>`;

      const day = await Ledger.dayTotal(repo, accId, todayStr(now));
      const ms = await Ledger.monthSummary(repo, accId, monthStr(now));
      ledgerEl.innerHTML = `<div>今日合计：<strong>¥ ${yuan(day.total)}</strong>（${day.count} 笔）</div>
        <div class="muted" style="margin-top:4px">本月合计：¥ ${yuan(ms.total)}</div>`;

      const groups = await Group.listForAccount(repo, accId);
      let pendingReview = 0, myTodo = 0;
      for (const g of groups) {
        const tasks = await Task.listTasks(repo, g.id);
        const canReview = g.role === 'owner' || g.role === 'deputy';
        for (const t of tasks) {
          if (canReview && t.status === 'review') pendingReview += 1;
          if (t.assigneeAccountId === accId && t.status !== 'done') myTodo += 1;
        }
      }
      groupEl.innerHTML = groups.length === 0 ? '<div class="muted">尚未加入小组</div>'
        : `<div>我的小组：<strong>${groups.length}</strong> 个</div><div class="muted" style="margin-top:4px">待我审核：${pendingReview} · 我的任务：${myTodo}</div>`;

      // 开发工作摘要：与「开发工作」模块共用同一份 devTask 数据
      const devTasks = await DevWork.listTasks(repo, accId);
      const doing = devTasks.filter(t => t.status === '进行中').length;
      const todo = devTasks.filter(t => t.status === '待开始').length;
      const openTasks = devTasks.filter(t => t.status !== '已完成');
      devSummaryEl.textContent = devTasks.length ? `进行中 ${doing} · 待开始 ${todo}` : '';
      if (devTasks.length === 0) {
        devTasksEl.innerHTML = '<div class="muted">暂无开发任务。</div>';
      } else {
        const shown = (openTasks.length ? openTasks : devTasks).slice(0, 4);
        devTasksEl.innerHTML = shown.map((t) => `
          <div class="row between" style="padding:3px 0">
            <span style="${t.status === '已完成' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${escapeHtml(t.title)}</span>
            <span class="muted">${escapeHtml(t.projectName || '')} · ${escapeHtml(t.status)}</span>
          </div>`).join('') + `<div class="muted" style="margin-top:6px">未完成 ${openTasks.length} 项 / 共 ${devTasks.length} 项</div>`;
      }

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
