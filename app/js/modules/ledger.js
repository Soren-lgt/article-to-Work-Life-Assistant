// AI生成
// 每日记账页：消费卡片（点击弹窗记一笔，hover 互动）+ 按天合计 + 月度汇总；新增消费/删除均走可靠模态
import { Ledger } from '../lib/ledger.js';
import { todayStr, monthStr, formatAmount } from '../lib/utils.js';
import { openModal } from '../ui/modal.js';

function pad(n) { return String(n).padStart(2, '0'); }
function shiftDate(date, delta) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function yuan(v) { const s = formatAmount(v); return s === '' ? '0.00' : s; }

// 纯函数：“今天”按钮文案——当天“今天”，非当天“返回今天”
export function ledgerHomeButtonLabel(isToday) {
  return isToday ? '今天' : '返回今天';
}

// 纯函数：金额输入校验（必填且为有效数字）
export function ledgerAmountFromInput(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return { ok: false, value: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, value: null };
  return { ok: true, value: n };
}

// 纯函数：新增消费表单（名称 + 可选首笔金额 + 备注）
export function newConsumeFormHTML() {
  return `
    <label>消费名称</label>
    <input data-f="name" placeholder="如：餐饮、交通">
    <label>本次消费金额（元，可留空）</label>
    <input data-f="amt" type="number" step="0.01" min="0" placeholder="如 12.5">
    <label>备注（可选）</label>
    <input data-f="note" placeholder="备注">`;
}

// 纯函数：解析点击命中的记账卡片操作（点在卡片子元素上也能归到卡片本体；删除按钮最优先）
export function resolveLedgerOp(target) {
  const el = target && typeof target.closest === "function" ? target.closest("[data-op]") : target;
  if (!el || !el.dataset) return { op: null, id: null, name: "" };
  return { op: el.dataset.op || null, id: el.dataset.id || null, name: el.dataset.name || "" };
}

// 纯函数：删除消费卡片确认正文
export function removeCardConfirmHTML(name) {
  return `<div>确认删除「${escapeHtml(name)}」及其全部记账记录？此操作不可撤销。</div>`;
}

export default {
  route: 'ledger',
  title: '每日记账',
  mount(el, ctx) {
    const { repo, state } = ctx;
    let date = state.currentDate || todayStr();
    let view = 'day';
    let month = monthStr();

    el.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div class="row">
            <button class="btn" data-act="prev">&lsaquo; 前一天</button>
            <strong data-el="dateLabel"></strong>
            <button class="btn" data-act="next">后一天 &rsaquo;</button>
            <button class="btn" data-act="today"></button>
            <input type="date" data-el="datePicker" title="选择历史日期">
          </div>
          <div class="row">
            <button class="btn" data-act="addCard">+ 新增消费</button>
            <button class="btn" data-act="toggleView">月度汇总</button>
          </div>
        </div>
      </div>
      <div data-el="dayView"></div>
      <div data-el="monthView" hidden></div>`;

    const q = (s) => el.querySelector(s);
    const dateLabel = q('[data-el="dateLabel"]');
    const datePicker = q('[data-el="datePicker"]');
    const dayView = q('[data-el="dayView"]');
    const monthView = q('[data-el="monthView"]');
    const viewBtn = q('[data-act="toggleView"]');
    const todayBtn = q('[data-act="today"]');

    function syncTodayButton() {
      todayBtn.textContent = ledgerHomeButtonLabel(date === todayStr());
    }

    // 点击消费卡片：弹窗填写金额记账（删除按钮除外，见事件分支）
    function openRecordModal(card) {
      const accId = state.currentAccountId;
      if (!accId) { window.alert('请先创建并选择账号'); return; }
      const ctl = openModal({
        title: `记一笔 · ${card.name}`,
        submitText: '保存',
        cancelText: '取消',
        bodyHTML: `
          <label>金额（元，必填）</label>
          <input data-f="amt" type="number" step="0.01" min="0" placeholder="如 12.5">
          <label>备注（可选）</label>
          <input data-f="note" placeholder="备注">`,
        onSubmit: async () => {
          const amtRaw = ctl.body.querySelector('[data-f="amt"]').value;
          const { ok, value } = ledgerAmountFromInput(amtRaw);
          if (!ok) { window.alert('请填写有效金额'); return true; }
          const note = ctl.body.querySelector('[data-f="note"]').value.trim();
          try {
            await Ledger.addRecord(repo, accId, { cardId: card.cardId, amount: value, note, date });
          } catch (e) { window.alert(e.message); return true; }
          await render();
          return false;
        },
      });
    }

    // 新增消费：可靠模态，可同时录入首笔金额；自建卡不进入初始卡片管理
    function openNewConsumeModal() {
      const accId = state.currentAccountId;
      if (!accId) { window.alert('请先创建并选择账号'); return; }
      const ctl = openModal({
        title: '新增消费',
        submitText: '创建',
        cancelText: '取消',
        bodyHTML: newConsumeFormHTML(),
        onSubmit: async () => {
          const name = ctl.body.querySelector('[data-f="name"]').value.trim();
          if (!name) { window.alert('请填写消费名称'); return true; }
          const amtRaw = ctl.body.querySelector('[data-f="amt"]').value;
          const note = ctl.body.querySelector('[data-f="note"]').value.trim();
          try {
            const card = await Ledger.addCard(repo, accId, name);
            const { ok, value } = ledgerAmountFromInput(amtRaw);
            if (ok) await Ledger.addRecord(repo, accId, { cardId: card.id, amount: value, note, date });
          } catch (e) { window.alert(e.message); return true; }
          await render();
          return false;
        },
      });
    }

    // 删除消费卡片：可靠确认模态
    function openRemoveCardModal(cardId, name) {
      openModal({
        title: '删除消费',
        submitText: '删除',
        cancelText: '取消',
        bodyHTML: removeCardConfirmHTML(name),
        onSubmit: async () => {
          await Ledger.removeCard(repo, cardId);
          await render();
          return false;
        },
      });
    }

    async function renderDay() {
      const accId = state.currentAccountId;
      if (!accId) { dayView.innerHTML = '<div class="card muted">请先在设置中创建并选择账号。</div>'; return; }
      await Ledger.ensureDefaultCards(repo, accId);
      const byCard = await Ledger.dayByCard(repo, accId, date);
      const day = await Ledger.dayTotal(repo, accId, date);
      dateLabel.textContent = date; // 仅显示日期，不附加当天标记
      syncTodayButton();
      datePicker.value = date;

      dayView.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
          ${byCard.map((c) => `
            <div class="card ledger-card" data-op="pick" data-id="${c.cardId}" data-name="${escapeHtml(c.name)}" style="cursor:pointer">
              <div class="row" style="justify-content:space-between">
                <strong>${escapeHtml(c.name)}</strong>
                <button class="btn danger" data-op="delcard" data-id="${c.cardId}" data-name="${escapeHtml(c.name)}" style="padding:2px 6px;font-size:12px">删</button>
              </div>
              <div style="margin-top:8px">¥ ${yuan(c.total)}</div>
              <div class="muted">${c.count} 笔</div>
            </div>`).join('')}
        </div>
        <div class="card" style="margin-top:14px"><strong>当天合计：¥ ${yuan(day.total)}</strong><span class="muted"> · ${day.count} 笔</span></div>`;
    }

    async function renderMonth() {
      const accId = state.currentAccountId;
      if (!accId) { monthView.innerHTML = '<div class="card muted">请先选择账号。</div>'; return; }
      const s = await Ledger.monthSummary(repo, accId, month);
      dateLabel.textContent = month + ' 月度汇总';
      monthView.innerHTML = `
        <div class="card">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr><th style="text-align:left">分类</th><th style="text-align:right">笔数</th><th style="text-align:right">金额</th></tr></thead>
            <tbody>
              ${s.perCard.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td style="text-align:right">${c.count}</td><td style="text-align:right">¥ ${yuan(c.total)}</td></tr>`).join('')}
              <tr><td><strong>合计</strong></td><td style="text-align:right"><strong>${s.count}</strong></td><td style="text-align:right"><strong>¥ ${yuan(s.total)}</strong></td></tr>
            </tbody>
          </table>
        </div>`;
    }

    async function render() {
      if (view === 'day') { monthView.hidden = true; dayView.hidden = false; viewBtn.textContent = '月度汇总'; await renderDay(); }
      else { dayView.hidden = true; monthView.hidden = false; viewBtn.textContent = '按天查看'; await renderMonth(); }
    }

    datePicker.addEventListener('change', () => {
      if (datePicker.value) { date = datePicker.value; month = date.slice(0, 7); render(); }
    });

    el.addEventListener('click', async (e) => {
      const act = e.target.dataset.act;
      const hit = resolveLedgerOp(e.target);
      const op = hit.op;
      const id = hit.id;
      if (act === 'prev') { date = shiftDate(date, -1); month = date.slice(0, 7); await render(); }
      else if (act === 'next') { date = shiftDate(date, 1); month = date.slice(0, 7); await render(); }
      else if (act === 'today') { date = todayStr(); month = monthStr(); await render(); }
      else if (act === 'toggleView') { view = view === 'day' ? 'month' : 'day'; await render(); }
      else if (act === 'addCard') { openNewConsumeModal(); }
      else if (op === 'delcard') { openRemoveCardModal(id, hit.name); }
      else if (op === 'pick') { openRecordModal({ cardId: id, name: hit.name }); }
    });

    if (el.__unsub) el.__unsub();
    el.__unsub = state.subscribe(() => { render(); });

    render();
  },
};