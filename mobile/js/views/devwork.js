// 开发工作（移动版）：开发任务 / Bug 记录 / 代码片段
import { DevWork, TASK_STATUS, BUG_STATUS } from '../../../app/js/lib/devwork.js';
import { openModal } from '../../../app/js/ui/modal.js';
import { pushNotice, pruneNotices } from '../lib/notifycenter.js';

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function taskForm(prefill={}){
  const v=k=>esc(prefill[k]==null?'':prefill[k]);
  return `<div class="field"><label>任务标题</label><input data-f="title" value="${v('title')}" placeholder="要开发的任务"></div>
    <div class="field"><label>所属项目（可留空，默认未分组）</label><input data-f="projectName" value="${v('projectName')}" placeholder="未分组"></div>`;
}
function bugForm(prefill={}){
  const v=k=>esc(prefill[k]==null?'':prefill[k]);
  return `<div class="field"><label>Bug 标题</label><input data-f="title" value="${v('title')}" placeholder="Bug 简述"></div>
    <div class="field"><label>现象描述（可选）</label><textarea data-f="symptom" rows="4" placeholder="复现步骤 / 现象……">${v('symptom')}</textarea></div>`;
}
function snippetForm(prefill={}){
  const v=k=>esc(prefill[k]==null?'':prefill[k]);
  return `<div class="field"><label>片段标题</label><input data-f="title" value="${v('title')}" placeholder="片段名称"></div>
    <div class="field"><label>语言（如 js / python，可留空）</label><input data-f="lang" value="${v('lang')}" placeholder="语言标签"></div>
    <div class="field"><label>代码内容（多行输入）</label><textarea data-f="code" rows="8" spellcheck="false" placeholder="粘贴或编写代码……">${v('code')}</textarea></div>
    <div class="field"><label>描述（可选）</label><input data-f="desc" value="${v('desc')}" placeholder="用途说明"></div>`;
}

export default {
  route:'devwork', title:'开发工作',
  mount(el, ctx){
    const { repo, state } = ctx;
    let tab='task'; const expanded=new Set();
    let taskRows=[], bugRows=[], snippetRows=[];
    el.innerHTML=`<div class="row wrap" style="margin-bottom:12px;gap:8px">
      <button class="btn sm" data-tab="task">开发任务</button>
      <button class="btn sm" data-tab="bug">Bug 记录</button>
      <button class="btn sm" data-tab="snippet">代码片段</button>
      <span style="flex:1"></span>
      <button class="btn sm primary" data-act="add"></button></div>
      <div data-el="body"></div>`;
    const body=el.querySelector('[data-el="body"]'), addBtn=el.querySelector('[data-act="add"]');

    async function renderTasks(){
      addBtn.textContent='+ 新建任务';
      const groups=await DevWork.groupTasksByProject(repo,state.currentAccountId);
      taskRows=groups.flatMap(g=>g.tasks);
      if(!groups.length){ body.innerHTML='<div class="card muted">还没有开发任务。</div>'; return; }
      body.innerHTML=groups.map(g=>`
        <div class="card"><strong>${esc(g.projectName)}</strong><div style="margin-top:8px">
          ${g.tasks.map(t=>`
            <div class="member-row" style="align-items:flex-start">
              <div class="list-main"><div class="list-title">${esc(t.title)}</div></div>
              <select data-op="tstatus" data-id="${t.id}" style="min-height:36px;border:1px solid var(--line);border-radius:9px;background:var(--card)">
                ${TASK_STATUS.map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select>
              <button class="btn sm" data-op="tedit" data-id="${t.id}">编辑</button>
              <button class="btn sm danger" data-op="tdel" data-id="${t.id}">删除</button>
            </div>`).join('')}</div></div>`).join('');
    }
    async function renderBugs(){
      addBtn.textContent='+ 记 Bug';
      const bugs=await DevWork.listBugs(repo,state.currentAccountId); bugRows=bugs;
      if(!bugs.length){ body.innerHTML='<div class="card muted">还没有 Bug 记录。</div>'; return; }
      body.innerHTML=`<div class="card">${bugs.map(b=>`
        <div class="member-row" style="align-items:flex-start">
          <div class="list-main"><div class="list-title">${esc(b.title)}</div>
            ${b.symptom?`<div class="list-sub">${esc(b.symptom)}</div>`:''}</div>
          <select data-op="bstatus" data-id="${b.id}" style="min-height:36px;border:1px solid var(--line);border-radius:9px;background:var(--card)">
            ${BUG_STATUS.map(s=>`<option ${s===b.status?'selected':''}>${s}</option>`).join('')}</select>
          <button class="btn sm" data-op="bedit" data-id="${b.id}">编辑</button>
          <button class="btn sm danger" data-op="bdel" data-id="${b.id}">删除</button>
        </div>`).join('')}</div>`;
    }
    async function renderSnippets(){
      addBtn.textContent='+ 代码笔记';
      const list=await DevWork.listSnippets(repo,state.currentAccountId); snippetRows=list;
      if(!list.length){ body.innerHTML='<div class="card muted">还没有代码片段。</div>'; return; }
      body.innerHTML=`<div class="card">${list.map(s=>`
        <div style="padding:8px 0;border-bottom:1px solid var(--line)">
          <div class="row wrap" style="gap:6px">
            <span style="flex:1;min-width:120px">${esc(s.title)} <span class="muted">${esc(s.lang)}</span></span>
            <button class="btn sm" data-op="sexpand" data-id="${s.id}">${expanded.has(s.id)?'收起':'查看'}</button>
            <button class="btn sm" data-op="sedit" data-id="${s.id}">编辑</button>
            <button class="btn sm" data-op="scopy" data-id="${s.id}">复制</button>
            <button class="btn sm danger" data-op="sdel" data-id="${s.id}">删除</button>
          </div>
          ${expanded.has(s.id)?'<pre class="code-block" style="margin-top:6px">'+esc(s.code)+'</pre>':''}
          ${s.desc?'<div class="muted">'+esc(s.desc)+'</div>':''}
        </div>`).join('')}</div>`;
    }
    async function notifyDev(title,body,refType,refId){
      const accId=state.currentAccountId;
      if(!accId) return;
      await pushNotice(repo,{accountId:accId,kind:'dev',title,body:body||'',refType:refType||null,refId:refId||null});
      state.emit();
    }
    async function render(){
      el.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('primary',b.dataset.tab===tab));
      if(tab==='task') await renderTasks(); else if(tab==='bug') await renderBugs(); else await renderSnippets();
    }

    function openTask(prefill={}){
      if(!state.currentAccountId){ window.alert('请先登录账号'); return; }
      const ctl=openModal({title:prefill.id?'编辑任务':'新建任务',submitText:prefill.id?'保存':'创建',cancelText:'取消',bodyHTML:taskForm(prefill),
        onSubmit:async()=>{ const g=k=>ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title=g('title').trim(); if(!title){ window.alert('任务标题不能为空'); return true; }
          const projectName=g('projectName').trim();
          if(prefill.id){ await DevWork.updateTask(repo,prefill.id,{title,projectName}); await notifyDev('修改开发任务：'+title,projectName,'task',prefill.id); }
          else { const rec=await DevWork.addTask(repo,state.currentAccountId,{title,projectName}); await notifyDev('新建开发任务：'+title,projectName,'task',rec&&rec.id); }
          await render(); return false; }});
    }
    function openBug(prefill={}){
      if(!state.currentAccountId){ window.alert('请先登录账号'); return; }
      const ctl=openModal({title:prefill.id?'编辑 Bug':'记 Bug',submitText:prefill.id?'保存':'提交',cancelText:'取消',bodyHTML:bugForm(prefill),
        onSubmit:async()=>{ const g=k=>ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title=g('title').trim(); if(!title){ window.alert('Bug 标题不能为空'); return true; }
          const symptom=g('symptom').trim();
          if(prefill.id){ await DevWork.updateBug(repo,prefill.id,{title,symptom}); await notifyDev('修改 Bug：'+title,symptom,'bug',prefill.id); }
          else { const rec=await DevWork.addBug(repo,state.currentAccountId,{title,symptom}); await notifyDev('记录 Bug：'+title,symptom,'bug',rec&&rec.id); }
          await render(); return false; }});
    }
    function openSnippet(prefill={}){
      if(!state.currentAccountId){ window.alert('请先登录账号'); return; }
      const ctl=openModal({title:prefill.id?'编辑代码片段':'新增代码片段',submitText:'保存',cancelText:'取消',bodyHTML:snippetForm(prefill),
        onSubmit:async()=>{ const g=k=>ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title=g('title').trim(); if(!title){ window.alert('片段标题不能为空'); return true; }
          const payload={title,lang:g('lang').trim(),code:g('code'),desc:g('desc').trim()};
          if(prefill.id) await DevWork.updateSnippet(repo,prefill.id,payload);
          else await DevWork.addSnippet(repo,state.currentAccountId,payload);
          await render(); return false; }});
    }
    function openRemove(kind,id,title){
      const label={task:'任务',bug:'Bug',snippet:'代码片段'}[kind];
      openModal({title:'删除'+label,submitText:'删除',cancelText:'取消',
        bodyHTML:`<div>确认删除该${label}「${esc(title)}」？此操作不可撤销。</div>`,
        onSubmit:async()=>{ if(kind==='task') await DevWork.removeTask(repo,id); else if(kind==='bug') await DevWork.removeBug(repo,id); else await DevWork.removeSnippet(repo,id);
          if(kind!=='snippet'){ await pruneNotices(repo,{refId:id,refType:kind}); state.emit(); }
          await render(); return false; }});
    }

    if(el.__clickHandler) el.removeEventListener('click', el.__clickHandler);
    const onClick=async(e)=>{
      const t=e.target.dataset.tab, op=e.target.dataset.op, act=e.target.dataset.act, id=e.target.dataset.id;
      if(t){ tab=t; await render(); return; }
      if(act==='add'){ if(tab==='task') openTask({}); else if(tab==='bug') openBug({}); else openSnippet({}); return; }
      if(op==='tdel'){ const x=taskRows.find(r=>r.id===id); if(x) openRemove('task',id,x.title); }
      else if(op==='bdel'){ const x=bugRows.find(r=>r.id===id); if(x) openRemove('bug',id,x.title); }
      else if(op==='sdel'){ const x=snippetRows.find(r=>r.id===id); if(x) openRemove('snippet',id,x.title); }
      else if(op==='sexpand'){ expanded.has(id)?expanded.delete(id):expanded.add(id); await render(); }
      else if(op==='scopy'){ const s=snippetRows.find(r=>r.id===id);
        if(s&&navigator.clipboard){ try{ await navigator.clipboard.writeText(s.code); window.alert('代码已复制'); }catch(err){ window.alert('复制失败'); } } }
      else if(op==='tedit'){ const x=taskRows.find(r=>r.id===id); if(x) openTask(x); }
      else if(op==='bedit'){ const x=bugRows.find(r=>r.id===id); if(x) openBug(x); }
      else if(op==='sedit'){ const x=snippetRows.find(r=>r.id===id); if(x) openSnippet(x); }
    };
    el.addEventListener('click', onClick); el.__clickHandler=onClick;

    if(el.__changeHandler) el.removeEventListener('change', el.__changeHandler);
    const onChange=async(e)=>{
      const op=e.target.dataset.op;
      if(op==='tstatus'){
        const x=taskRows.find(r=>r.id===e.target.dataset.id);
        await DevWork.setTaskStatus(repo,e.target.dataset.id,e.target.value);
        if(e.target.value==='已完成'){ await pruneNotices(repo,{refId:e.target.dataset.id,refType:'task'}); state.emit(); }
        else await notifyDev('任务状态：'+e.target.value,(x?x.title:''),'task',e.target.dataset.id);
        await render();
      }
      else if(op==='bstatus'){
        const x=bugRows.find(r=>r.id===e.target.dataset.id);
        await DevWork.setBugStatus(repo,e.target.dataset.id,e.target.value);
        if(e.target.value==='已修复'||e.target.value==='已关闭'){ await pruneNotices(repo,{refId:e.target.dataset.id,refType:'bug'}); state.emit(); }
        else await notifyDev('Bug 状态：'+e.target.value,(x?x.title:''),'bug',e.target.dataset.id);
        await render();
      }
    };
    el.addEventListener('change', onChange); el.__changeHandler=onChange;
    if(el.__unsub) el.__unsub();
    el.__unsub=state.subscribe(()=>{ render(); });
    render();
  },
};
