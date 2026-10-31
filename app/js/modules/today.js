// AI生成
// 今日计划页：按天增删改/勾选、优先级、备注；日期切换；月度概览
import { TodayPlan } from '../lib/todayplan.js';
import { todayStr, monthStr } from '../lib/utils.js';

function pad(n) { return String(n).padStart(2, '0'); }
function shiftDate(date, delta) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default {
  route: 'today',
  title: '今日计划',
  mount(el, ctx) {
    const { repo, state } = ctx;
    let date = state.currentDate || todayStr();
    let view = 'day';
    let month = monthStr();

    el.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <div class="row">
            <button class="btn" data-act="prev">&lsaquo; 前一天</button>
            <strong data-el="dateLabel"></strong>
            <button class="btn" data-act="next">后一天 &rsaquo;</button>
            <button class="btn" data-act="today">今天</button>
          </div>
          <div class="row">
            <span class="muted" data-el="count"></span>
            <button class="btn" data-act="toggleView">月度概览</button>
          </div>
        </div>
        <div data-el="dayView">
          <div class="row" style="gap:8px;margin-bottom:8px">
            <input data-el="newTitle" placeholder="添加今天要做的事" style="flex:1">
            <select data-el="newPriority"><option>高</option><option selected>中</option><option>低</option></select>
          </div>
          <input data-el="newNote" placeholder="备注（可选）" style="width:100%;margin-bottom:8px">
          <button class="btn primary" data-act="add">添加</button>
          <div data-el="list" style="margin-top:10px"></div>
        </div>
        <div data-el="monthView" hidden></div>
      </div>`;

    const q = (s) => el.querySelector(s);
    const dateLabel = q('[data-el="dateLabel"]');
    const countEl = q('[data-el="count"]');
    const dayView = q('[data-el="dayView"]');
    const monthView = q('[data-el="monthView"]');
    const listEl = q('[data-el="list"]');
    const newTitle = q('[data-el="newTitle"]');
    const newPriority = q('[data-el="newPriority"]');
    const newNote = q('[data-el="newNote"]');
    const viewBtn = q('[data-act="toggleView"]');

    async function add() {
      const accId = state.currentAccountId;
      if (!accId) { window.alert('请先在设置中创建并选择账号'); return; }
      try {
        await TodayPlan.add(repo, accId, {
          title: newTitle.value, date, priority: newPriority.value, note: newNote.value.trim(),
        });
        newTitle.value = ''; newNote.value = '';
        await refresh();
      } catch (err) { window.alert(err.message); }
    }

    async function renderDay() {
      dateLabel.textContent = date + (date === todayStr() ? '（今天）' : '');
      const accId = state.currentAccountId;
      const rows = accId ? await TodayPlan.listByDate(repo, accId, date) : [];
      countEl.textContent = '共 ' + rows.length + ' 项（完成 ' + rows.filter((r) => r.done).length + '）';
      listEl.innerHTML = rows.length === 0
        ? '<div class="muted">这一天还没有计划。</div>'
        : rows.map((r) => `
          <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
            <label class="row" style="gap:8px;flex:1;flex-wrap:wrap">
              <input type="checkbox" ${r.done ? 'checked' : ''} data-op="toggle" data-id="${r.id}">
              <span style="${r.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${escapeHtml(r.title)}</span>
              <span class="muted">[${escapeHtml(r.priority)}]</span>
              ${r.note ? `<span class="muted">· ${escapeHtml(r.note)}</span>` : ''}
            </label>
            <span class="row">
              <button class="btn" data-op="edit" data-id="${r.id}" data-title="${escapeHtml(r.title)}">编辑</button>
              <button class="btn danger" data-op="del" data-id="${r.id}">删除</button>
            </span>
          </div>`).join('');
    }

    async function renderMonth() {
      const accId = state.currentAccountId;
      dateLabel.textContent = month + ' 月度概览';
      if (!accId) { monthView.innerHTML = '<div class="muted">请先选择账号。</div>'; return; }
      const s = await TodayPlan.monthSummary(repo, accId, month);
      const days = Object.entries(s.byDay).sort((a, b) => a[0].localeCompare(b[0]));
      monthView.innerHTML = `
        <div class="row" style="gap:16px;margin-bottom:10px">
          <span>总计划：<strong>${s.total}</strong></span>
          <span style="color:green">已完成：<strong>${s.done}</strong></span>
          <span style="color:#c00">未完成：<strong>${s.undone}</strong></span>
          <span class="muted">完成率：${s.total ? Math.round((s.done / s.total) * 100) : 0}%</span>
        </div>
        ${days.length ? days.map(([d, v]) => `<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)">
          <span>${d}</span><span class="muted">完成 ${v.done}/${v.total}</span></div>`).join('') : '<div class="muted">本月暂无计划。</div>'}`;
    }

    async function refresh() {
      if (view === 'day') {
        monthView.hidden = true; dayView.hidden = false; viewBtn.textContent = '月度概览';
        await renderDay();
      } else {
        dayView.hidden = true; monthView.hidden = false; viewBtn.textContent = '按天查看';
        await renderMonth();
      }
    }

    el.addEventListener('click', async (e) => {
      const act = e.target.dataset.act;
      const op = e.target.dataset.op;
      const id = e.target.dataset.id;
      if (act === 'prev') { date = shiftDate(date, -1); month = date.slice(0, 7); await refresh(); }
      else if (act === 'next') { date = shiftDate(date, 1); month = date.slice(0, 7); await refresh(); }
      else if (act === 'today') { date = todayStr(); month = monthStr(); await refresh(); }
      else if (act === 'add') { await add(); }
      else if (act === 'toggleView') { view = view === 'day' ? 'month' : 'day'; await refresh(); }
      else if (op === 'toggle') { await TodayPlan.toggle(repo, id); await refresh(); }
      else if (op === 'del') { if (window.confirm('确认删除该计划？')) { await TodayPlan.remove(repo, id); await refresh(); } }
      else if (op === 'edit') {
        const t = window.prompt('修改内容', e.target.dataset.title);
        if (t != null) { await TodayPlan.update(repo, id, { title: t }); await refresh(); }
      }
    });

    newTitle.addEventListener('keydown', async (e) => { if (e.key === 'Enter') await add(); });

    if (el.__unsub) el.__unsub();
    el.__unsub = state.subscribe(() => { refresh(); });

    refresh();
  },
};