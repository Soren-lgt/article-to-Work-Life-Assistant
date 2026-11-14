// 今日计划（移动版）：按天增删改/勾选、优先级备注、日期切换、月度概览
import { TodayPlan } from '../../../app/js/lib/todayplan.js';
import { todayStr, monthStr } from '../../../app/js/lib/utils.js';
import { openModal } from '../../../app/js/ui/modal.js';
import { pushNotice, pruneNotices } from '../lib/notifycenter.js';

function pad(n){ return String(n).padStart(2,'0'); }
function shiftDate(date, delta){
  const [y,m,d]=date.split('-').map(Number); const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}
function shiftMonth(month, delta){
  const parts=String(month||'').split('-'); const y=Number(parts[0]), m=Number(parts[1]);
  const dt=new Date(y, (m||1)-1+delta, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`;
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function taskFormHTML(prefill={}){
  const v=(k)=>escapeHtml(prefill[k]==null?'':prefill[k]);
  const pri=prefill.priority||'中';
  const opts=['高','中','低'].map((p)=>`<option ${p===pri?'selected':''}>${p}</option>`).join('');
  return `<div class="field"><label>任务标题</label><input data-f="title" value="${v('title')}" placeholder="要做什么？"></div>
    <div class="field"><label>优先级</label><select data-f="priority">${opts}</select></div>
    <div class="field"><label>备注（可选）</label><input data-f="note" value="${v('note')}" placeholder="补充说明"></div>`;
}

export default {
  route:'today', title:'今日计划',
  mount(el, ctx){
    const { repo, state } = ctx;
    let date = state.currentDate || todayStr();
    let view='day', month=monthStr(), currentRows=[];
    el.innerHTML = `
      <div class="card">
        <div class="row wrap" style="justify-content:space-between;gap:8px;margin-bottom:10px">
          <div class="row daynav">
            <button class="btn sm" data-act="prev">前一天</button>
            <strong data-el="dateLabel" data-act="pickdate" style="cursor:pointer;border-bottom:1px dashed var(--line);padding:0 2px 2px"></strong>
            <button class="btn sm" data-act="next">后一天</button>
            <button class="btn sm" data-act="today"></button>
          </div>
          <div class="row wrap">
            <button class="btn sm" data-act="toggleView">月度概览</button>
            <button class="btn sm primary" data-act="add">添加任务</button>
          </div>
        </div>
        <div data-el="count" class="muted" style="margin-bottom:8px"></div>
        <div data-el="dayView"><div data-el="list"></div></div>
        <div data-el="monthView" hidden></div>
      </div>`;
    const q=(s)=>el.querySelector(s);
    const dateLabel=q('[data-el="dateLabel"]'), countEl=q('[data-el="count"]');
    const dayView=q('[data-el="dayView"]'), monthView=q('[data-el="monthView"]');
    const listEl=q('[data-el="list"]'), todayBtn=q('[data-act="today"]'), viewBtn=q('[data-act="toggleView"]');
    const prevBtn=q('[data-act="prev"]'), nextBtn=q('[data-act="next"]');
    // 日期栏跟着视图换：按天是前一天/后一天，月度概览是前一个月/后一个月
    function syncDateBar(){
      if(view==='month'){
        prevBtn.textContent='前一个月'; nextBtn.textContent='后一个月';
        dateLabel.textContent=month;
        todayBtn.textContent = month===monthStr()?'本月':'返回本月';
      } else {
        prevBtn.textContent='前一天'; nextBtn.textContent='后一天';
        dateLabel.textContent=date;
        todayBtn.textContent = date===todayStr()?'今天':'返回今天';
      }
    }

    // 点中间的日期：自己挑一天跳过去（按天视图用日期，月度概览用月份）
    function openPickDate(){
      const ctl=openModal({title:'选择日期',submitText:'确认',cancelText:'取消',
        bodyHTML:`<div class="field"><label>日期</label><input data-f="date" type="date" value="${view==='month'?month+'-01':date}"></div>`,
        onSubmit:async()=>{
          const v=String(ctl.body.querySelector('[data-f="date"]').value||'').trim();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(v)){ window.alert('请选择有效日期'); return true; }
          if(view==='month'){ month=v.slice(0,7); await refresh(); return false; }
          date=v; month=v.slice(0,7); await refresh(); return false;
        }});
    }

    function openAdd(){
      const accId=state.currentAccountId;
      if(!accId){ window.alert('请先创建并登录账号'); return; }
      const ctl=openModal({title:'新增今日计划',submitText:'添加',cancelText:'取消',bodyHTML:taskFormHTML({}),
        onSubmit:async()=>{
          const title=ctl.body.querySelector('[data-f="title"]').value.trim();
          if(!title){ window.alert('计划内容不能为空'); return true; }
          const priority=ctl.body.querySelector('[data-f="priority"]').value;
          const note=ctl.body.querySelector('[data-f="note"]').value.trim();
          const rec=await TodayPlan.add(repo,accId,{title,date,priority,note});
          await pushNotice(repo,{accountId:accId,kind:'plan',refType:'plan',refId:rec&&rec.id,title:'新增计划：'+title,body:`${date} · ${priority}${note?' · '+note:''}`});
          state.emit(); await refresh(); return false;
        }});
    }
    function openEdit(task){
      const ctl=openModal({title:'编辑计划',submitText:'保存',cancelText:'取消',bodyHTML:taskFormHTML(task),
        onSubmit:async()=>{
          const title=ctl.body.querySelector('[data-f="title"]').value.trim();
          if(!title){ window.alert('计划内容不能为空'); return true; }
          const priority=ctl.body.querySelector('[data-f="priority"]').value;
          const note=ctl.body.querySelector('[data-f="note"]').value.trim();
          await TodayPlan.update(repo,task.id,{title,priority,note});
          await pushNotice(repo,{accountId:state.currentAccountId,kind:'plan',refType:'plan',refId:task.id,title:'修改计划：'+title,body:`${task.date||date} · ${priority}`});
          state.emit(); await refresh(); return false;
        }});
    }
    function openDelete(task){
      openModal({title:'删除计划',submitText:'删除',cancelText:'取消',
        bodyHTML:`<div>确认删除「${escapeHtml(task.title)}」？此操作不可撤销。</div>`,
        onSubmit:async()=>{ await TodayPlan.remove(repo,task.id);
          await pruneNotices(repo,{refId:task.id,refType:'plan'});
          state.emit(); await refresh(); return false; }});
    }

    async function renderDay(){
      syncDateBar();
      const accId=state.currentAccountId;
      const rows = accId ? await TodayPlan.listByDate(repo,accId,date) : [];
      currentRows=rows;
      countEl.textContent=`共 ${rows.length} 项（完成 ${rows.filter(r=>r.done).length}）`;
      listEl.innerHTML = rows.length===0 ? '<div class="empty">这一天还没有计划。</div>'
        : rows.map((r)=>`
          <div class="list-item">
            <label class="row" style="gap:8px;flex:1;min-width:0">
              <input type="checkbox" ${r.done?'checked':''} data-op="toggle" data-id="${r.id}">
              <span style="flex:1;min-width:0;${r.done?'text-decoration:line-through;color:var(--muted)':''}">${escapeHtml(r.title)}</span>
              <span class="tag ${r.priority==='高'?'danger':r.priority==='低'?'ok':'warn'}">${escapeHtml(r.priority)}</span>
            </label>
          </div>
          ${r.note?`<div class="muted" style="padding:0 4px 6px 34px">${escapeHtml(r.note)}</div>`:''}
          <div class="row" style="gap:6px;justify-content:flex-end;padding:0 4px 8px">
            <button class="btn sm" data-op="edit" data-id="${r.id}">编辑</button>
            <button class="btn sm danger" data-op="del" data-id="${r.id}">删除</button>
          </div>`).join('');
    }
    async function renderMonth(){
      const accId=state.currentAccountId;
      syncDateBar();
      if(!accId){ monthView.innerHTML='<div class="muted">请先选择账号。</div>'; return; }
      const s=await TodayPlan.monthSummary(repo,accId,month);
      const days=Object.entries(s.byDay).sort((a,b)=>a[0].localeCompare(b[0]));
      monthView.innerHTML=`
        <div class="row wrap" style="gap:14px;margin-bottom:8px">
          <span>总 <strong>${s.total}</strong></span><span style="color:#2f7d3f">完成 <strong>${s.done}</strong></span>
          <span style="color:var(--danger)">未完成 <strong>${s.undone}</strong></span>
          <span class="muted">${s.total?Math.round(s.done/s.total*100):0}%</span></div>
        ${days.length?days.map(([d,v])=>`<div class="stat-line"><span>${d}</span><span class="muted">${v.done}/${v.total}</span></div>`).join(''):'<div class="empty">本月暂无计划。</div>'}`;
    }
    async function refresh(){
      if(view==='day'){ monthView.hidden=true; dayView.hidden=false; viewBtn.textContent='月度概览'; await renderDay(); }
      else { dayView.hidden=true; monthView.hidden=false; viewBtn.textContent='按天查看'; await renderMonth(); }
    }

    if(el.__clickHandler) el.removeEventListener('click',el.__clickHandler);
    const onClick=async(e)=>{
      const act=e.target.dataset.act, op=e.target.dataset.op, id=e.target.dataset.id;
      if(act==='pickdate'){ openPickDate(); }
      else if(act==='prev'){
        if(view==='month'){ month=shiftMonth(month,-1); }
        else { date=shiftDate(date,-1); month=date.slice(0,7); }
        await refresh();
      }
      else if(act==='next'){
        if(view==='month'){ month=shiftMonth(month,1); }
        else { date=shiftDate(date,1); month=date.slice(0,7); }
        await refresh();
      }
      else if(act==='today'){
        if(view==='month'){ month=monthStr(); }
        else { date=todayStr(); month=monthStr(); }
        await refresh();
      }
      else if(act==='add'){ openAdd(); }
      else if(act==='toggleView'){ view=view==='day'?'month':'day'; await refresh(); }
      else if(op==='toggle'){
        const row=currentRows.find(x=>x.id===id);
        await TodayPlan.toggle(repo,id);
        if(row){
          if(!row.done) await pruneNotices(repo,{refId:id,refType:'plan'});         // 刚勾成已完成 → 不再提醒
          else await pushNotice(repo,{accountId:state.currentAccountId,kind:'plan',refType:'plan',refId:id,
            title:'计划待完成：'+row.title,body:date});                             // 取消完成 → 回到待办提醒
        }
        state.emit(); await refresh();
      }
      else if(op==='del'){ const row=currentRows.find(x=>x.id===id); if(row) openDelete(row); }
      else if(op==='edit'){ const row=currentRows.find(x=>x.id===id); if(row) openEdit(row); }
    };
    el.addEventListener('click',onClick); el.__clickHandler=onClick;
    if(el.__unsub) el.__unsub();
    el.__unsub=state.subscribe(()=>{ refresh(); });
    refresh();
  },
};
