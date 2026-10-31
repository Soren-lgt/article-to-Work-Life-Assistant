// AI生成
// 每日记账页：分类卡片 + 记一笔 + 按天查看（日期选择器）+ 当天记录列表 + 月度汇总
import { Ledger } from '../lib/ledger.js';
import { todayStr, monthStr, formatAmount } from '../lib/utils.js';

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
function yuan(v) { const s = formatAmount(v); return s === '' ? '0.00' : s; }

export default {
  route: 'ledger',
  title: '每日记账',
  mount(el, ctx) {
    const { repo, state } = ctx;
    let date = state.currentDate || todayStr();
    let view = 'day';
    let month = monthStr();
    let selectedCardId = null;

    el.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div class="row">
            <button class="btn" data-act="prev">&lsaquo; 前一天</button>
            <strong data-el="dateLabel"></strong>
            <button class="btn" data-act="next">后一天 &rsaquo;</button>
            <button class="btn" data-act="today">今天</button>
            <input type="date" data-el="datePicker" title="选择历史日期">
          </div>
          <div class="row">
            <button class="btn" data-act="addCard">+ 新建分类</button>
            <button class="btn" data-act="toggleView">月度汇总</button>
          </div>
        </div>
      </div>
      <div data-el="dayView"></div>
      <div data-el="monthView" hidden></div>
      <div data-el="recordForm" class="card" hidden style="margin-top:14px"></div>`;

    const q = (s) => el.querySelector(s);
    const dateLabel = q('[data-el="dateLabel"]');
    const datePicker = q('[data-el="datePicker"]');
    const dayView = q('[data-el="dayView"]');
    const monthView = q('[data-el="monthView"]');
    const recordForm = q('[data-el="recordForm"]');
    const viewBtn = q('[data-act="toggleView"]');

    async function renderDay() {
      const accId = state.currentAccountId;
      if (!accId) { dayView.innerHTML = '<div class="card muted">请先在设置中创建并选择账号。</div>'; return; }
      await Ledger.ensureDefaultCards(repo, accId);
      const byCard = await Ledger.dayByCard(repo, accId, date);
      const day = await Ledger.dayTotal(repo, accId, date);
      dateLabel.textContent = date + (date === todayStr() ? '（今天）' : '');
      datePicker.value = date;

      const nameOf = {};
      for (const c of byCard) nameOf[c.cardId] = c.name;

      dayView.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
          ${byCard.map((c) => `
            <div class="card" data-op="pick" data-id="${c.cardId}" style="cursor:pointer;${selectedCardId === c.cardId ? 'border-color:var(--primary)' : ''}">
              <div class="row" style="justify-content:space-between">
                <strong>${escapeHtml(c.name)}</strong>
                <span class="row" style="gap:4px">
                  <button class="btn" data-op="rename" data-id="${c.cardId}" data-name="${escapeHtml(c.name)}" style="padding:2px 6px;font-size:12px">改名</button>
                  <button class="btn danger" data-op="delcard" data-id="${c.cardId}" data-name="${escapeHtml(c.name)}" style="padding:2px 6px;font-size:12px">删</button>
                </span>
              </div>
              <div style="margin-top:8px">¥ ${yuan(c.total)}</div>
              <div class="muted">${c.count} 笔</div>
            </div>`).join('')}
        </div>
        <div class="card" style="margin-top:14px"><strong>当天合计：¥ ${yuan(day.total)}</strong><span class="muted"> · ${day.count} 笔</span></div>
        <div class="card" style="margin-top:14px">
          <strong>当天记录</strong>
          <div data-el="records" style="margin-top:8px"></div>
        </div>`;

      const records = await Ledger.listByDate(repo, accId, date);
      const recBox = dayView.querySelector('[data-el="records"]');
      recBox.innerHTML = records.length === 0
        ? '<div class="muted">当天暂无记录，点上方分类卡片记一笔。</div>'
        : records.map((rec) => `
          <div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)">
            <span style="flex:1">${escapeHtml(nameOf[rec.cardId] || '未知分类')}${rec.note ? ' · ' + escapeHtml(rec.note) : ''}</span>
            <span class="row">
              <span>${rec.amount == null ? '未填金额' : '¥ ' + formatAmount(rec.amount)}</span>
              <button class="btn danger" data-op="delrec" data-id="${rec.id}" style="padding:2px 8px">删除</button>
            </span>
          </div>`).join('');

      if (selectedCardId) {
        const card = byCard.find((c) => c.cardId === selectedCardId);
        if (card) {
          recordForm.hidden = false;
          recordForm.innerHTML = `
            <strong>记一笔 · ${escapeHtml(card.name)}</strong>
            <div class="row" style="margin-top:8px">
              <input data-el="amt" placeholder="金额（可空）" style="width:120px">
              <input data-el="note" placeholder="备注（可选）" style="flex:1">
              <button class="btn primary" data-act="save">保存</button>
              <button class="btn" data-act="cancel">取消</button>
            </div>`;
        }
      } else {
        recordForm.hidden = true;
        recordForm.innerHTML = '';
      }
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
      const op = e.target.dataset.op;
      const id = e.target.dataset.id;
      if (act === 'prev') { date = shiftDate(date, -1); month = date.slice(0, 7); await render(); }
      else if (act === 'next') { date = shiftDate(date, 1); month = date.slice(0, 7); await render(); }
      else if (act === 'today') { date = todayStr(); month = monthStr(); await render(); }
      else if (act === 'toggleView') { view = view === 'day' ? 'month' : 'day'; await render(); }
      else if (act === 'addCard') {
        const name = window.prompt('新分类名称');
        if (name != null) { try { await Ledger.addCard(repo, state.currentAccountId, name); await render(); } catch (err) { window.alert(err.message); } }
      } else if (act === 'save') {
        const amt = q('[data-el="amt"]').value;
        const note = q('[data-el="note"]').value;
        await Ledger.addRecord(repo, state.currentAccountId, { cardId: selectedCardId, amount: amt, note, date });
        q('[data-el="amt"]').value = '';
        q('[data-el="note"]').value = '';
        await render();
      } else if (act === 'cancel') { selectedCardId = null; await render(); }
      else if (op === 'pick') { selectedCardId = id; await render(); }
      else if (op === 'rename') {
        const name = window.prompt('修改分类名称', e.target.dataset.name);
        if (name != null) { await Ledger.renameCard(repo, id, name); await render(); }
      } else if (op === 'delcard') {
        if (window.confirm('删除分类「' + e.target.dataset.name + '」及其全部记录？')) { await Ledger.removeCard(repo, id); if (selectedCardId === id) selectedCardId = null; await render(); }
      } else if (op === 'delrec') {
        if (window.confirm('删除这条记账记录？')) { await Ledger.removeRecord(repo, id); await render(); }
      }
    });

    if (el.__unsub) el.__unsub();
    el.__unsub = state.subscribe(() => { render(); });

    render();
  },
};