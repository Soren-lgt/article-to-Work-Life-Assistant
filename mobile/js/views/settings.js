// 数据与设置（移动版）：数据概览 / 备份导出导入 / 分模块清空·整体重置 / 主题·默认页·通知 / 记账预置卡片
import { Backup } from '../../../app/js/lib/backup.js';
import { Ledger } from '../../../app/js/lib/ledger.js';
import { openModal, openConfirm, openPrompt } from '../../../app/js/ui/modal.js';
import { normalizeTheme, THEME_OPTIONS } from '../../../app/js/lib/theme.js';

const MODULE_LABELS = {
  today: '今日计划与备忘',
  ledger: '每日记账',
  devwork: '开发工作',
  quiz: '题库',
  group: '同组计划',
  accounts: '账号',
};
const OVERVIEW_HIDDEN = ['today'];

export default {
  route:'settings', title:'设置',
  mount(el, ctx){
    const { repo, app } = ctx;
    const prefs = app.prefs || {};

    el.innerHTML = `
      <div class="card"><h3 style="margin:0 0 8px">数据概览</h3><div data-el="stats"></div></div>
      <div class="card"><h3 style="margin:0 0 8px">备份与恢复</h3>
        <div class="row wrap" style="gap:8px">
          <button class="btn primary" data-act="export">导出备份文件</button>
          <button class="btn" data-act="import">从备份文件恢复</button>
        </div>
        <div class="muted" style="margin-top:8px">备份为 JSON 文件，与电脑版格式一致，可互相导入迁移。</div>
      </div>
      <div class="card"><h3 style="margin:0 0 8px">数据清理</h3><div data-el="clean" class="row wrap" style="gap:8px"></div>
        <button class="btn danger block" style="margin-top:10px" data-act="resetAll">整体重置（清空全部数据）</button>
      </div>
      <div class="card"><h3 style="margin:0 0 8px">通用设置</h3>
        <div class="field"><label>主题外观</label><select data-f="theme"></select></div>
        <div class="field"><label>默认打开页</label><select data-f="defaultRoute">
          <option value="home">首页总览</option><option value="today">今日计划</option>
          <option value="devwork">开发工作</option><option value="group">同组计划</option>
          <option value="quiz">题库</option><option value="ledger">每日记账</option>
          <option value="settings">数据与设置</option></select></div>
        <label class="option-row"><input type="checkbox" data-f="notify"><span>顶部铃铛显示未读通知数</span></label>
      </div>
      <div class="card"><h3 style="margin:0 0 8px">记账预置卡片</h3><div data-el="cards"></div></div>`;

    // ---- 数据概览 ----
    async function refreshStats(){
      const stats = await Backup.stats(repo);
      const rows = Object.entries(Backup.MODULES)
        .filter(([k])=>!OVERVIEW_HIDDEN.includes(k))
        .map(([k,stores])=>({ key:k, label:MODULE_LABELS[k]||k, count:stores.reduce((s,n)=>s+(stats[n]||0),0) }));
      el.querySelector('[data-el="stats"]').innerHTML = rows.map(r=>
        `<div class="stat-line"><span>${r.label}</span><span class="muted">${r.count} 条</span></div>`).join('') || '<div class="empty">暂无数据。</div>';
    }

    // ---- 备份导出 ----
    el.querySelector('[data-act="export"]').onclick = async ()=>{
      try{
        const dump = await Backup.exportAll(repo);
        const text = JSON.stringify(dump,null,2);
        const blob = new Blob([text],{type:'application/json'});
        const url = URL.createObjectURL(blob);
        const d = new Date();
        const a = document.createElement('a');
        a.href=url; a.download=`worklife-mobile-backup-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        window.alert('已导出备份文件。');
      }catch(e){ window.alert(e.message); }
    };

    // ---- 备份导入（覆盖 / 合并） ----
    let fileInput=null;
    el.querySelector('[data-act="import"]').onclick = ()=>{
      if(!fileInput){ fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='.json,application/json'; fileInput.style.display='none'; document.body.appendChild(fileInput); }
      fileInput.value='';
      fileInput.onchange = async ()=>{
        const file = fileInput.files && fileInput.files[0]; if(!file) return;
        const runImport = async (mode)=>{
          try{
            const text = await file.text();
            const res = await Backup.importFromText(repo, text, { mode });
            await app.refreshAccounts(); await refreshAll();
            window.alert(`恢复完成，共导入 ${res.imported} 条记录。`);
          }catch(e){ window.alert('恢复失败：'+e.message); }
          fileInput.value='';
        };
        const ctl = openModal({ title:'选择恢复方式', footer:false,
          bodyHTML:`<div class="muted" style="margin-bottom:12px">「覆盖恢复」= 先清空现有数据再导入；「合并导入」= 保留现有数据，同 id 记录被覆盖。</div>
            <div class="row wrap" style="gap:8px"><button class="btn" data-act="merge">合并导入</button>
            <button class="btn primary" data-act="replace">覆盖恢复</button></div>`,
          onSubmit:()=>false });
        ctl.overlay.addEventListener('click',(e)=>{
          const act=e.target.dataset && e.target.dataset.act;
          if(act==='replace'){ ctl.close(); runImport('replace'); }
          else if(act==='merge'){ ctl.close(); runImport('merge'); }
        });
      };
      fileInput.click();
    };

    // ---- 数据清理 ----
    const cleanBox = el.querySelector('[data-el="clean"]');
    Object.entries(MODULE_LABELS).forEach(([key,label])=>{
      const b=document.createElement('button'); b.className='btn sm'; b.textContent=`清空：${label}`;
      b.onclick=()=>openConfirm({title:'清空数据',confirmText:'清空',message:`确定清空「${label}」的全部数据？此操作不可撤销。`,
        onConfirm:async()=>{ await Backup.clearModule(repo,key); await refreshAll(); window.alert('已清空。'); }});
      cleanBox.appendChild(b);
    });
    el.querySelector('[data-act="resetAll"]').onclick=()=>openConfirm({title:'整体重置',confirmText:'下一步',
      message:'确定清空全部数据？这会删除所有账号、计划、记账、任务、题库与小组数据。',
      onConfirm:()=>openConfirm({title:'再次确认',confirmText:'确定重置',message:'再次确认：整体重置不可撤销，是否继续？',
        onConfirm:async()=>{ await Backup.resetAll(repo); await app.refreshAccounts(); await refreshAll(); window.alert('已整体重置。'); }})});

    // ---- 通用设置 ----
    const themeSel=el.querySelector('[data-f="theme"]');
    const curTheme=normalizeTheme(prefs.theme);
    THEME_OPTIONS.forEach(([val,txt])=>{ const o=document.createElement('option'); o.value=val; o.textContent=txt; if(curTheme===val) o.selected=true; themeSel.appendChild(o); });
    themeSel.onchange=()=>{ prefs.theme=themeSel.value; app.savePrefs(prefs);
      document.documentElement.setAttribute('data-theme', normalizeTheme(prefs.theme)); };
    const homeSel=el.querySelector('[data-f="defaultRoute"]');
    homeSel.value=prefs.defaultRoute||'home';
    homeSel.onchange=()=>{ prefs.defaultRoute=homeSel.value; app.savePrefs(prefs); };
    const notifyChk=el.querySelector('[data-f="notify"]');
    notifyChk.checked=prefs.notify!==false;
    notifyChk.onchange=()=>{ prefs.notify=notifyChk.checked; app.savePrefs(prefs); };

    // ---- 预置记账卡片 ----
    async function refreshCards(){
      const box=el.querySelector('[data-el="cards"]');
      const accId=app.state.currentAccountId;
      if(!accId){ box.innerHTML='<div class="muted">请先登录账号。</div>'; return; }
      await Ledger.ensureDefaultCards(repo,accId);
      const cards=(await Ledger.listCards(repo,accId)).filter(c=>c.preset===true);
      box.innerHTML='';
      if(!cards.length){ box.innerHTML='<div class="empty">暂无预置卡片。</div>'; return; }
      cards.forEach(c=>{
        const row=document.createElement('div'); row.className='member-row';
        const label=document.createElement('span'); label.style.flex='1'; label.textContent=c.name;
        const rn=document.createElement('button'); rn.className='btn sm'; rn.textContent='改名';
        rn.onclick=()=>openPrompt({title:'改名',label:'新名称',placeholder:c.name,submitText:'保存',
          onSubmit:async(n)=>{ if(!String(n||'').trim()) return true; try{ await Ledger.renameCard(repo,c.id,n); await refreshCards(); }catch(e){ window.alert(e.message); } return false; }});
        const rm=document.createElement('button'); rm.className='btn sm danger'; rm.textContent='删除';
        rm.onclick=()=>openConfirm({title:'删除卡片',confirmText:'删除',message:'删除该卡片会同时删除其记录，确定？',
          onConfirm:async()=>{ await Ledger.removeCard(repo,c.id); await refreshCards(); }});
        row.append(label,rn,rm); box.appendChild(row);
      });
    }

    async function refreshAll(){ await refreshStats(); await refreshCards(); }
    refreshAll();
  },
};
