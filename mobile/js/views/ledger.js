// 每日记账（移动版）：消费卡片点击记一笔（替换语义）+ 当日合计 + 月度汇总
import { Ledger } from '../../../app/js/lib/ledger.js';
import { todayStr, monthStr, formatAmount } from '../../../app/js/lib/utils.js';
import { openModal } from '../../../app/js/ui/modal.js';

function pad(n){ return String(n).padStart(2,'0'); }
function shiftDate(date,delta){
  const [y,m,d]=date.split('-').map(Number); const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+delta); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function yuan(v){ const s=formatAmount(v); return s===''?'0.00':s; }

export default {
  route:'ledger', title:'每日记账',
  mount(el, ctx){
    const { repo, state } = ctx;
    let date=state.currentDate||todayStr(), view='day', month=monthStr();
    el.innerHTML=`
      <div class="card">
        <div class="row wrap" style="justify-content:space-between;gap:8px">
          <div class="row wrap">
            <button class="btn sm" data-act="prev">前一天</button>
            <strong data-el="dateLabel"></strong>
            <button class="btn sm" data-act="next">后一天</button>
            <button class="btn sm" data-act="today"></button>
          </div>
          <div class="row wrap">
            <input type="date" data-el="datePicker" style="min-height:38px;border:1px solid var(--line);border-radius:9px;padding:4px 8px;background:var(--card)">
            <button class="btn sm primary" data-act="addCard">新增消费</button>
            <button class="btn sm" data-act="toggleView">月度汇总</button>
          </div>
        </div>
      </div>
      <div data-el="dayView"></div>
      <div data-el="monthView" hidden></div>`;
    const q=(s)=>el.querySelector(s);
    const dateLabel=q('[data-el="dateLabel"]'), datePicker=q('[data-el="datePicker"]');
    const dayView=q('[data-el="dayView"]'), monthView=q('[data-el="monthView"]');
    const viewBtn=q('[data-act="toggleView"]'), todayBtn=q('[data-act="today"]');
    function syncTodayButton(){ todayBtn.textContent = date===todayStr()?'今天':'返回今天'; }

    function openRecord(card){
      const accId=state.currentAccountId;
      if(!accId){ window.alert('请先创建并选择账号'); return; }
      const ctl=openModal({title:`记一笔 · ${card.name}`,submitText:'保存',cancelText:'取消',
        bodyHTML:`<div class="field"><label>金额（元，必填）</label><input data-f="amt" type="number" step="0.01" min="0" placeholder="如 12.5"></div>
        <div class="field"><label>备注（可选）</label><input data-f="note" placeholder="备注"></div>`,
        onSubmit:async()=>{
          const raw=ctl.body.querySelector('[data-f="amt"]').value.trim();
          const n=Number(raw);
          if(raw===''||!Number.isFinite(n)){ window.alert('请填写有效金额'); return true; }
          const note=ctl.body.querySelector('[data-f="note"]').value.trim();
          try{ await Ledger.addRecord(repo,accId,{cardId:card.cardId,amount:n,note,date}); }
          catch(e){ window.alert(e.message); return true; }
          await render(); return false;
        }});
    }
    function openNewCard(){
      const accId=state.currentAccountId;
      if(!accId){ window.alert('请先创建并选择账号'); return; }
      const ctl=openModal({title:'新增消费',submitText:'创建',cancelText:'取消',
        bodyHTML:`<div class="field"><label>消费名称</label><input data-f="name" placeholder="如：餐饮、交通"></div>
        <div class="field"><label>首笔金额（元，可留空）</label><input data-f="amt" type="number" step="0.01" min="0" placeholder="如 12.5"></div>
        <div class="field"><label>备注（可选）</label><input data-f="note" placeholder="备注"></div>`,
        onSubmit:async()=>{
          const name=ctl.body.querySelector('[data-f="name"]').value.trim();
          if(!name){ window.alert('请填写消费名称'); return true; }
          const raw=ctl.body.querySelector('[data-f="amt"]').value.trim();
          const note=ctl.body.querySelector('[data-f="note"]').value.trim();
          try{
            const card=await Ledger.addCard(repo,accId,name);
            if(raw!==''){ const n=Number(raw); if(Number.isFinite(n)) await Ledger.addRecord(repo,accId,{cardId:card.id,amount:n,note,date}); }
          }catch(e){ window.alert(e.message); return true; }
          await render(); return false;
        }});
    }
    function openRemoveCard(cardId,name){
      openModal({title:'删除消费',submitText:'删除',cancelText:'取消',
        bodyHTML:`<div>确认删除「${escapeHtml(name)}」及其全部记账记录？此操作不可撤销。</div>`,
        onSubmit:async()=>{ await Ledger.removeCard(repo,cardId); await render(); return false; }});
    }

    async function renderDay(){
      const accId=state.currentAccountId;
      if(!accId){ dayView.innerHTML='<div class="card muted">请先登录账号。</div>'; return; }
      await Ledger.ensureDefaultCards(repo,accId);
      const byCard=await Ledger.dayByCard(repo,accId,date);
      const day=await Ledger.dayTotal(repo,accId,date);
      dateLabel.textContent=date; syncTodayButton(); datePicker.value=date;
      dayView.innerHTML=`
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
          ${byCard.map(c=>`
            <div class="card" data-op="pick" data-id="${c.cardId}" data-name="${escapeHtml(c.name)}" style="cursor:pointer;margin-bottom:0">
              <div class="row between"><strong style="font-size:14px">${escapeHtml(c.name)}</strong>
                <button class="btn sm danger" data-op="delcard" data-id="${c.cardId}" data-name="${escapeHtml(c.name)}">删</button></div>
              <div style="margin-top:10px;font-size:18px;font-weight:600">¥ ${yuan(c.total)}</div>
              <div class="muted" style="font-size:12px">${c.count} 笔</div>
            </div>`).join('')}
        </div>
        <div class="card" style="margin-top:14px"><strong>当天合计：¥ ${yuan(day.total)}</strong> <span class="muted">· ${day.count} 笔</span></div>`;
    }
    async function renderMonth(){
      const accId=state.currentAccountId;
      if(!accId){ monthView.innerHTML='<div class="card muted">请先登录账号。</div>'; return; }
      const s=await Ledger.monthSummary(repo,accId,month);
      dateLabel.textContent=month+' 月度汇总';
      monthView.innerHTML=`<div class="card">
        ${s.perCard.map(c=>`<div class="stat-line"><span>${escapeHtml(c.name)}</span><span class="muted">${c.count} 笔 · ¥ ${yuan(c.total)}</span></div>`).join('')}
        <div class="stat-line" style="border-top:1px solid var(--line);margin-top:6px"><span><strong>合计</strong></span><span><strong>${s.count} 笔 · ¥ ${yuan(s.total)}</strong></span></div></div>`;
    }
    async function render(){
      if(view==='day'){ monthView.hidden=true; dayView.hidden=false; viewBtn.textContent='月度汇总'; await renderDay(); }
      else{ dayView.hidden=true; monthView.hidden=false; viewBtn.textContent='按天查看'; await renderMonth(); }
    }
    datePicker.addEventListener('change',()=>{ if(datePicker.value){ date=datePicker.value; month=date.slice(0,7); render(); } });

    if(el.__clickHandler) el.removeEventListener('click',el.__clickHandler);
    const onClick=async(e)=>{
      const act=e.target.dataset.act;
      const hit=e.target.closest&&e.target.closest('[data-op]');
      const op=hit?hit.dataset.op:null, id=hit?hit.dataset.id:null, name=hit?hit.dataset.name:'';
      if(act==='prev'){ date=shiftDate(date,-1); month=date.slice(0,7); await render(); }
      else if(act==='next'){ date=shiftDate(date,1); month=date.slice(0,7); await render(); }
      else if(act==='today'){ date=todayStr(); month=monthStr(); await render(); }
      else if(act==='toggleView'){ view=view==='day'?'month':'day'; await render(); }
      else if(act==='addCard'){ openNewCard(); }
      else if(op==='delcard'){ openRemoveCard(id,name); }
      else if(op==='pick'){ openRecord({cardId:id,name}); }
    };
    el.addEventListener('click',onClick); el.__clickHandler=onClick;
    if(el.__unsub) el.__unsub();
    el.__unsub=state.subscribe(()=>{ render(); });
    render();
  },
};
