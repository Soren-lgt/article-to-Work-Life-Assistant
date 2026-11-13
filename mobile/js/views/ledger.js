// 每日记账（移动版）：消费卡片点击记一笔（替换语义）+ 当日合计 + 月度汇总 + 年度汇总
import { Ledger } from '../../../app/js/lib/ledger.js';
import { todayStr, monthStr, formatAmount } from '../../../app/js/lib/utils.js';
import { openModal } from '../../../app/js/ui/modal.js';
import { migrateLegacyCards } from '../lib/ledgerday.js';
import { ensureCardsReady } from '../lib/ledgerinit.js';
import { shiftMonth, shiftYear, monthRange, summarizeYear } from '../lib/ledgerperiod.js';

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
    let date=state.currentDate||todayStr(), view='day', month=monthStr(), year=todayStr().slice(0,4);
    el.innerHTML=`
      <div class="card">
        <div class="row wrap" style="justify-content:space-between;gap:8px">
          <div class="row wrap">
            <button class="btn sm" data-act="prev">前一天</button>
            <strong data-el="dateLabel" data-act="pickdate" style="cursor:pointer;border-bottom:1px dashed var(--line);padding:0 2px 2px"></strong>
            <button class="btn sm" data-act="next">后一天</button>
            <button class="btn sm" data-act="today"></button>
          </div>
          <div class="row wrap">
            <button class="btn sm primary" data-act="addCard">新增消费</button>
            <button class="btn sm" data-act="toggleView">月度汇总</button>
          </div>
        </div>
      </div>
      <div data-el="dayView"></div>
      <div data-el="monthView" hidden></div>
      <div data-el="yearView" hidden></div>`;
    const q=(s)=>el.querySelector(s);
    const dateLabel=q('[data-el="dateLabel"]');
    const dayView=q('[data-el="dayView"]'), monthView=q('[data-el="monthView"]'), yearView=q('[data-el="yearView"]');
    const viewBtn=q('[data-act="toggleView"]'), todayBtn=q('[data-act="today"]');
    const prevBtn=q('[data-act="prev"]'), nextBtn=q('[data-act="next"]');

    // 三种状态：按天查看 / 月度汇总 / 年度汇总，日期栏按钮文案跟着状态变
    function syncDateBar(){
      if(view==='day'){
        prevBtn.textContent='前一天'; nextBtn.textContent='后一天';
        dateLabel.textContent=date;
        todayBtn.textContent = date===todayStr()?'今天':'返回今天';
      } else if(view==='month'){
        prevBtn.textContent='前一个月'; nextBtn.textContent='后一个月';
        dateLabel.textContent=month;
        todayBtn.textContent = month===monthStr()?'本月':'返回本月';
      } else {
        prevBtn.textContent='前一年'; nextBtn.textContent='后一年';
        dateLabel.textContent=year;
        todayBtn.textContent = year===todayStr().slice(0,4)?'今年':'返回今年';
      }
    }

    // 点日期 / 月份 / 年份：按当前状态挑一个跳过去
    function openPickDate(){
      const accId=state.currentAccountId;
      if(!accId){ window.alert('请先登录账号'); return; }
      if(view==='month'){
        const ctl=openModal({title:'选择月份',submitText:'确认',cancelText:'取消',
          bodyHTML:`<div class="field"><label>月份</label><input data-f="month" type="month" value="${month}"></div>`,
          onSubmit:async()=>{
            const v=String(ctl.body.querySelector('[data-f="month"]').value||'').trim();
            if(!/^\d{4}-\d{2}$/.test(v)){ window.alert('请选择有效月份'); return true; }
            month=v; view='month'; await render(); return false;
          }});
        return;
      }
      if(view==='year'){
        let ctl=null;
        ctl=openModal({title:'选择年份',submitText:'确认',cancelText:'取消',
          bodyHTML:`<div class="field"><label>年份</label><input data-f="year" type="number" min="2000" max="2100" step="1" value="${year}"></div>`,
          onSubmit:async()=>{
            const v=String(ctl.body.querySelector('[data-f="year"]').value||'').trim();
            if(!/^\d{4}$/.test(v)){ window.alert('请选择有效年份'); return true; }
            year=v; view='year'; await render(); return false;
          }});
        return;
      }
      const ctl=openModal({title:'选择日期',submitText:'确认',cancelText:'取消',
        bodyHTML:`<div class="field"><label>日期</label><input data-f="date" type="date" value="${date}"></div>`,
        onSubmit:async()=>{
          const v=String(ctl.body.querySelector('[data-f="date"]').value||'').trim();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){ window.alert('请选择有效日期'); return true; }
          date=v; month=v.slice(0,7); view='day'; await render(); return false;
        }});
    }
    function openRecord(card){
      const accId=state.currentAccountId;
      if(!accId){ window.alert('请先登录账号'); return; }
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
      if(!accId){ window.alert('请先登录账号'); return; }
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
            // 新增消费建的卡只属于当天：带上 date，之后的日子不再出现
            const card=await Ledger.addCard(repo,accId,name,{date});
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
      await ensureCardsReady(repo,accId);
      await migrateLegacyCards(repo,accId);
      const byCard=await Ledger.dayByCard(repo,accId,date);
      const day=await Ledger.dayTotal(repo,accId,date);
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
      monthView.innerHTML=`<div class="card">
        ${s.perCard.map(c=>`<div class="stat-line"><span>${escapeHtml(c.name)}</span><span class="muted">${c.count} 笔 · ¥ ${yuan(c.total)}</span></div>`).join('')}
        <div class="stat-line" style="border-top:1px solid var(--line);margin-top:6px"><span><strong>本月合计</strong></span><span><strong>${s.count} 笔 · ¥ ${yuan(s.total)}</strong></span></div></div>`;
    }
    async function renderYear(){
      const accId=state.currentAccountId;
      if(!accId){ yearView.innerHTML='<div class="card muted">请先登录账号。</div>'; return; }
      const list=[];
      for(const m of monthRange(year)) list.push({ month:m, ...(await Ledger.monthSummary(repo,accId,m)) });
      const s=summarizeYear(list);
      yearView.innerHTML=`
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
          ${s.months.map(m=>`
            <div class="card" data-op="pickmonth" data-month="${m.month}" style="cursor:pointer;margin-bottom:0">
              <div class="row between"><strong style="font-size:14px">${m.month}</strong>
                <span class="muted" style="font-size:12px">${m.count} 笔</span></div>
              <div style="margin-top:10px;font-size:18px;font-weight:600">¥ ${yuan(m.total)}</div>
            </div>`).join('')}
        </div>
        <div class="card" style="margin-top:14px"><strong>全年合计：¥ ${yuan(s.total)}</strong> <span class="muted">· ${s.count} 笔</span></div>`;
    }
    async function render(){
      syncDateBar();
      dayView.hidden = view!=='day';
      monthView.hidden = view!=='month';
      yearView.hidden = view!=='year';
      viewBtn.textContent = view==='day'?'月度汇总':(view==='month'?'年度汇总':'按天查看');
      if(view==='day') await renderDay();
      else if(view==='month') await renderMonth();
      else await renderYear();
    }
    if(el.__clickHandler) el.removeEventListener('click',el.__clickHandler);
    const onClick=async(e)=>{
      const act=e.target.dataset.act;
      const hit=e.target.closest&&e.target.closest('[data-op]');
      const op=hit?hit.dataset.op:null, id=hit?hit.dataset.id:null, name=hit?hit.dataset.name:'';
      if(act==='prev'||act==='next'){
        const delta = act==='prev'?-1:1;
        if(view==='day'){ date=shiftDate(date,delta); month=date.slice(0,7); }
        else if(view==='month'){ month=shiftMonth(month,delta); }
        else { year=shiftYear(year,delta); }
        await render();
      }
      else if(act==='today'){ date=todayStr(); month=monthStr(); year=todayStr().slice(0,4); await render(); }
      else if(act==='toggleView'){
        view = view==='day'?'month':(view==='month'?'year':'day');
        if(view==='year') year=month.slice(0,4);
        await render();
      }
      else if(act==='pickdate'){ openPickDate(); }
      else if(act==='addCard'){ openNewCard(); }
      else if(op==='pickmonth'){ month=hit.dataset.month; view='month'; await render(); }
      else if(op==='delcard'){ openRemoveCard(id,name); }
      else if(op==='pick'){ openRecord({cardId:id,name}); }
    };
    el.addEventListener('click',onClick); el.__clickHandler=onClick;
    if(el.__unsub) el.__unsub();
    el.__unsub=state.subscribe(()=>{ render(); });
    render();
  },
};
