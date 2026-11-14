// 题库（移动版）：分类题库管理 + 跨库顺序练习（按题型排序） + 按题型配额随机考试 + 判分 + 成绩历史
import { Quiz, QUESTION_TYPE_ORDER as QUIZ_TYPE_ORDER } from '../../../app/js/lib/quiz.js';
import { gradeQuestion, filterWrong, accuracy } from '../../../app/js/lib/scoring.js';
import { openModal, openConfirm } from '../../../app/js/ui/modal.js';
import { parseDictation, buildVoiceGuideHTML } from '../../../app/js/lib/quizvoiceform.js';
import { pickChoiceIndexes, appendVoiceText } from '../../../app/js/lib/quizvoice.js';
import { speechAvailable, createDictation } from '../lib/mvoice.js';

let runnerCtl = null;
// 手机版同样要区分「代码主动关闭」与「用户点 × 关闭」，后者等同取消
let runnerClosing = false;
let runnerVoice = null;
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// 话筒图标（纯 SVG，与电脑版同款造型）
const MIC_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9.2" y="3.2" width="5.6" height="10.6" rx="2.8"/><path d="M5.6 11.8a6.4 6.4 0 0 0 12.8 0"/><path d="M12 18.2v2.6"/><path d="M9 20.8h6"/></svg>';
function micBtnHTML(){ return `<button type="button" class="btn sm mic-btn" data-act="voice" title="按一下，说一句" aria-label="语音输入">${MIC_SVG}</button>`; }
function voiceOn(){ return speechAvailable(); }

export default {
  route:'quiz', title:'题库',
  mount(el, ctx){
    const { repo, state } = ctx;
    if(el.__timer){ clearInterval(el.__timer); el.__timer=null; }
    if(runnerCtl){ try{runnerCtl.close();}catch(e){} runnerCtl=null; }

    const v = { cat:'choice', bankId:null, screen:'manage', qs:[], i:0, ans:{}, fb:{},
      deadline:0, mode:'practice', results:[], showSetup:false, startedAt:0, elapsed:0, summary:null };

    el.innerHTML = `<div class="card"><div class="row wrap" data-el="cats" style="gap:8px"></div></div><div data-el="main"></div>`;
    const catsBar=el.querySelector('[data-el="cats"]'), main=el.querySelector('[data-el="main"]');

    async function currentQuestions(){ return v.bankId ? Quiz.listQuestions(repo,v.bankId) : []; }
    function catName(){ return {choice:'选择',qa:'问答',code:'代码'}[v.cat]||''; }

    async function renderCats(){
      const cats=await Quiz.ensureCategories(repo);
      catsBar.innerHTML = cats.map(c=>`<button class="btn sm ${c.key===v.cat?'primary':''}" data-cat="${c.key}">${esc(c.name)}</button>`).join('')
        + `<span class="row wrap" style="gap:6px;margin-left:auto">
            <button class="btn sm" data-act="practice">顺序练习</button>
            <button class="btn sm" data-act="examSetup">考试模式</button>
            <button class="btn sm primary" data-act="newBank">新建题库</button></span>`;
      catsBar.querySelectorAll('[data-cat]').forEach(b=>{ b.onclick=()=>{ v.cat=b.dataset.cat; v.bankId=null; v.screen='manage'; refresh(); }; });
      catsBar.querySelector('[data-act="practice"]').onclick=async()=>{
        // 顺序练习：从「选择」第一个题库串到「代码」最后一个题库，题目按 单选/多选/判断/问答/代码 排序
        if(!state.currentAccountId){ window.alert('请先登录账号'); return; }
        const list=await Quiz.practiceQuestions(repo,state.currentAccountId);
        if(!(list.length>0)){ window.alert('题库中还没有任何题目，请先添加题目。'); return; }
        startRunner('practice',list);
      };
      catsBar.querySelector('[data-act="examSetup"]').onclick=async()=>{
        const all=await Quiz.listAllQuestions(repo,state.currentAccountId);
        if(!(all.length>0)){ window.alert('题库中还没有任何题目，请先添加题目。'); return; }
        v.showSetup=!v.showSetup; refresh();
      };
      catsBar.querySelector('[data-act="newBank"]').onclick=openNewBankModal;
    }

    async function refresh(){
      await renderCats();
      if(!state.currentAccountId){ main.innerHTML='<div class="card muted">请先登录账号。</div>'; return; }
      if(v.screen==='runner') return renderRunner();
      if(v.screen==='result') return renderResult();
      return renderManage();
    }

    function openNewBankModal(){
      const accId=state.currentAccountId; if(!accId){ window.alert('请先登录账号'); return; }
      const ctl=openModal({title:'新建题库',submitText:'创建',cancelText:'取消',
        bodyHTML:`<div class="field"><label>题库名称</label><input data-f="name" placeholder="如：数据结构题库"></div>`,
        onSubmit:async()=>{
          const name=ctl.body.querySelector('[data-f="name"]').value.trim();
          if(!name){ window.alert('题库名称不能为空'); return true; }
          try{ const b=await Quiz.addBank(repo,accId,v.cat,name); v.bankId=b.id; }
          catch(e){ window.alert(e.message); return true; }
          await refresh(); return false;
        }});
    }

    async function renderManage(){
      const accId=state.currentAccountId;
      const banks=await Quiz.listBanks(repo,accId,v.cat);
      if(v.bankId && !banks.some(b=>b.id===v.bankId)) v.bankId=null;
      const qs=await currentQuestions();
      main.innerHTML=`
        <div class="card"><strong>${esc(catName())}题库列表</strong>
          <div data-el="banks" style="margin-top:8px">${banks.length ? banks.map(b=>`
            <div class="member-row">
              <span style="flex:1;min-width:0">${esc(b.name)}${b.id===v.bankId?' <span class="tag">当前</span>':''}</span>
              <span class="row" style="gap:6px">
                <button class="btn sm primary" data-enter="${b.id}">进入</button>
                <button class="btn sm danger" data-delbank="${b.id}">删除</button>
              </span></div>`).join('') : '<div class="empty">该分类下还没有题库。</div>'}</div></div>
        ${v.bankId?`<div class="card">
          <div class="row between"><strong>当前题目（${qs.length}）</strong>
            <button class="btn sm primary" data-act="addQ">添加题目</button></div>
          <div data-el="qlist" style="margin-top:8px">${qs.length?qs.map((q,i)=>`
            <div class="member-row">
              <span class="muted">${i+1}.</span>
              <span style="flex:1;min-width:0">${esc(q.stem)}</span>
              <button class="btn sm" data-editq="${q.id}">编辑</button>
              <button class="btn sm danger" data-delq="${q.id}">删除</button>
            </div>`).join(''):'<div class="empty">此题库暂无题目。</div>'}</div></div>`:''}
        <div class="card" data-el="setup"></div>
        <div class="card" data-el="history"></div>`;

      const banksEl=main.querySelector('[data-el="banks"]');
      banksEl.querySelectorAll('[data-enter]').forEach(b=>{ b.onclick=()=>{ v.bankId=b.dataset.enter; refresh(); }; });
      banksEl.querySelectorAll('[data-delbank]').forEach(b=>{ b.onclick=()=>openConfirm({title:'删除题库',confirmText:'删除',
        message:'删除题库会同时删除其全部题目，确定？', onConfirm:async()=>{ await Quiz.removeBank(repo,b.dataset.delbank); if(v.bankId===b.dataset.delbank) v.bankId=null; refresh(); }}); });
      const addQ=main.querySelector('[data-act="addQ"]'); if(addQ) addQ.onclick=openAddQuestionModal;
      main.querySelectorAll('[data-delq]').forEach(b=>{ b.onclick=()=>openConfirm({title:'删除题目',confirmText:'删除',message:'确定删除该题目？',
        onConfirm:async()=>{ await Quiz.removeQuestion(repo,b.dataset.delq); refresh(); }}); });
      main.querySelectorAll('[data-editq]').forEach(b=>{ b.onclick=async()=>{ const list=await currentQuestions(); const q=list.find(x=>x.id===b.dataset.editq); if(q) openEditQuestionModal(q); }; });

      const setup=main.querySelector('[data-el="setup"]');
      const allQs = accId ? await Quiz.listAllQuestions(repo,accId) : [];
      const counts = Quiz.typeCounts(allQs);
      const stock = QUIZ_TYPE_ORDER.map(t=>`${Quiz.typeLabel(t)} ${counts[t]||0}`).join(' / ');
      setup.innerHTML = v.showSetup ? `
        <div class="muted">考试按题型随机抽取：${Quiz.examPlanText()}</div>
        <div class="muted">现有题目：${stock}</div>
        <div class="row" style="gap:8px;align-items:center;margin-top:8px">
          <span class="muted">时长(分钟)</span><input data-el="mins" type="number" min="1" value="30" style="width:80px">
          <button class="btn primary" data-act="startExam">开始考试</button>
        </div>` : '<div class="muted">点上方“考试模式”设置时长。</div>';
      if(v.showSetup) setup.querySelector('[data-act="startExam"]').onclick=async()=>{
        const all=await Quiz.listAllQuestions(repo,state.currentAccountId);
        if(!all.length){ window.alert('题库中还没有任何题目，请先添加题目。'); return; }
        // 按 20 单选 / 5 多选 / 10 判断 / 5 问答 / 2 代码 定量随机抽取（共 42 题）
        const draw=Quiz.drawExamQuestions(all);
        if(!draw.list.length){ window.alert('题目不足，无法开始考试。'); return; }
        const mins=Math.max(1,Number(setup.querySelector('[data-el="mins"]').value)||30);
        v.deadline=Date.now()+mins*60000;
        startRunner('exam',draw.list);
      };

      const hist=main.querySelector('[data-el="history"]');
      const atts=await Quiz.listAttempts(repo,accId);
      hist.innerHTML=`<strong>成绩历史</strong><div style="margin-top:8px">${atts.length?atts.slice(0,10).map((a,idx)=>{
        const when=new Date(a.createdAt).toLocaleString();
        const spent=a.timeSpent?` · ${Math.round(a.timeSpent/1000)}s`:'';
        return `<div class="member-row"><span style="flex:1;min-width:0">${idx+1}. ${a.mode==='exam'?'考试':'练习'} ${esc(when)}${spent} · <strong>${a.score}/${a.total}</strong></span>
          <span class="row" style="gap:6px"><button class="btn sm" data-histview="${a.id}">查看</button>
          <button class="btn sm danger" data-histdel="${a.id}">删除</button></span></div>`;}).join(''):'<div class="empty">暂无记录。</div>'}</div>`;
      hist.querySelectorAll('[data-histview]').forEach(b=>b.onclick=()=>openHistoryView(b.dataset.histview));
      hist.querySelectorAll('[data-histdel]').forEach(b=>b.onclick=async()=>{ await Quiz.removeAttempt(repo,b.dataset.histdel); refresh(); });
    }

    async function openHistoryView(id){
      const atts=await Quiz.listAttempts(repo,state.currentAccountId);
      const att=atts.find(a=>a.id===id); if(!att) return;
      const rows=(att.details||[]).map((r,i)=>{
        const label=r.manual?'待人工批改':(r.correct?'正确':'错误');
        const color=r.manual?'var(--muted)':(r.correct?'#2f7d3f':'var(--danger)');
        const ref=r.categoryKey==='choice'?(Array.isArray(r.answer)?r.answer.join('、'):String(r.answer??'')):(r.categoryKey==='qa'?(r.answer||''):(r.refCode||''));
        const mine=r.userAnswer==null?'':(Array.isArray(r.userAnswer)?r.userAnswer.join('、'):String(r.userAnswer));
        return `<div style="padding:6px 0;border-bottom:1px solid var(--line)">
          <div class="row between"><span>${i+1}. ${esc(r.stem)}</span><span style="color:${color}">${label}</span></div>
          <div class="muted" style="padding-left:14px">我的答案：${esc(mine)||'（未作答）'}</div>
          <div class="muted" style="padding-left:14px">参考答案：${esc(ref)||'—'}</div></div>`;
      }).join('');
      openModal({title:'历史作答（只读）',submitText:'关闭',cancelText:'返回',
        bodyHTML:`<div class="muted" style="margin-bottom:8px">${att.mode==='exam'?'考试':'练习'} · ${att.score}/${att.total}</div>${rows||'<div class="empty">无明细。</div>'}`,
        onSubmit:()=>false});
    }

    // ---------- 录题 ----------
    function buildQuestionForm(cat){
      let extra='';
      if(cat==='choice'){
        extra=`<div class="field"><label>题型</label><select data-f="type">
          <option value="single">单选</option><option value="multiple">多选</option><option value="judge">判断</option></select></div>
          <div data-opts></div>
          <div class="field"><label>解析（可选）</label><input data-f="analysis" placeholder="解析"></div>`;
      }else if(cat==='qa'){
        extra=`<div class="field"><label>参考答案</label><textarea data-f="answer" rows="3"></textarea></div>
          <div class="field"><label>关键词（逗号分隔，命中全部即判对）</label><input data-f="keywords" placeholder="如：有序,可变"></div>`;
      }else{
        extra=`<div class="field"><label>语言</label><input data-f="lang" placeholder="如 python"></div>
          <div class="field"><label>参考代码</label><textarea data-f="refCode" rows="6" spellcheck="false"></textarea></div>
          <div class="field"><label>提示（可选）</label><input data-f="hint"></div>`;
      }
      const head = cat === 'code' ? '' : `${buildVoiceGuideHTML(cat)}<div class="muted" data-el="vmsg" style="min-height:16px"></div>`;
      return `${head}<div class="field"><label>题干</label><input data-f="stem" placeholder="题目题干"></div>${extra}`;
    }
    function bindQuestionForm(cat,ctl){
      const voiceHandle=bindFormVoice(cat,ctl);
      if(cat!=='choice') return voiceHandle;
      const typeSel=ctl.body.querySelector('[data-f="type"]');
      renderChoiceOptions(ctl,typeSel.value);
      typeSel.onchange=()=>renderChoiceOptions(ctl,typeSel.value);
      return voiceHandle;
    }
    function renderChoiceOptions(ctl,type){
      const box=ctl.body.querySelector('[data-opts]');
      if(type==='judge'){ box.innerHTML='<div class="field"><label>正确答案（判断）</label><div class="row wrap"><label class="row" style="gap:8px"><input type="radio" name="jok" value="对">正确</label><label class="row" style="gap:8px"><input type="radio" name="jok" value="错">错误</label></div></div>'; return; }
      box.innerHTML=`<div class="field"><label>选项（勾选“正确”作为答案）</label><div data-optlist></div>
        <button type="button" class="btn sm" data-addopt>添加选项</button></div>`;
      const list=box.querySelector('[data-optlist]');
      const addRow=()=>{
        list.insertAdjacentHTML('beforeend',`<div class="row" data-optrow="1" style="gap:8px;margin-bottom:8px">
          <input data-opttext placeholder="选项内容" style="flex:1;min-width:0;min-height:40px;border:1px solid var(--line);border-radius:9px;padding:8px">
          <label class="row" style="gap:4px"><input type="${type==='multiple'?'checkbox':'radio'}" ${type==='multiple'?'':'name="rec-ok"'} data-optok>正确</label>
          <button type="button" class="btn sm danger" data-rowdel>删</button></div>`);
        const row=list.lastElementChild;
        row.querySelector('[data-rowdel]').onclick=()=>row.remove();
      };
      box.querySelector('[data-addopt]').onclick=addRow; addRow(); addRow();
    }
    // ---------- 语音：手机版走浏览器自带的 SpeechRecognition ----------
    function idleMic(btn, msg){
      if(btn){ btn.classList.remove('rec'); btn.title='按一下，说一句'; }
      if(msg) msg.textContent='';
    }
    // 题干说一句话就回填整张表单
    function bindFormVoice(cat, ctl){
      if(!voiceOn()) return null;
      const btn=ctl.overlay.querySelector('[data-act="voice"]');
      if(!btn) return null;
      const msg=ctl.body.querySelector('[data-el="vmsg"]');
      let d=null;
      btn.onclick=()=>{
        if(d && d.isRunning()){ d.stop(); return; }
        d=createDictation({
          onState:(s)=>{ if(s==='listening'){ btn.classList.add('rec'); btn.title='再点一下结束'; if(msg) msg.textContent='正在听…'; } },
          onPartial:(t)=>{ if(msg) msg.textContent=t?('在听：'+t):'正在听…'; },
          onFinal:(t)=>{ idleMic(btn,msg); const p=parseDictation(t); const note=applyDictation(cat,ctl,p); if(msg) msg.textContent=note||('已识别：'+t); },
          onError:(e)=>{ idleMic(btn,msg); if(msg) msg.textContent=e; },
        });
        if(!d.start()) idleMic(btn,msg);
      };
      return { stop:()=>{ if(d && d.isRunning()) d.stop(); } };
    }
    function choiceRowHTML(type, text, ok){
      return `<div class="row" data-optrow="1" style="gap:8px;margin-bottom:8px">
        <input data-opttext value="${esc(text)}" style="flex:1;min-width:0;min-height:40px;border:1px solid var(--line);border-radius:9px;padding:8px">
        <label class="row" style="gap:4px"><input type="${type==='multiple'?'checkbox':'radio'}" ${type==='multiple'?'':'name="rec-ok"'} data-optok ${ok?'checked':''}>正确</label>
        <button type="button" class="btn sm danger" data-rowdel>删</button></div>`;
    }
    function applyDictation(cat, ctl, p){
      if(!p || !p.ok) return '没听懂，换个说法再说一遍';
      const g=(k)=>ctl.body.querySelector(`[data-f="${k}"]`);
      const labels={choice:'选择',qa:'问答',code:'代码'};
      const filled=[];
      const stemInput=g('stem');
      if(p.stem && stemInput){ stemInput.value=p.stem; filled.push('题干'); }
      const sameCat=!p.category || p.category===cat;
      if(sameCat){
        if(cat==='choice'){
          const typeSel=g('type');
          const type=p.type || (typeSel?typeSel.value:'single');
          if(typeSel && typeSel.value!==type){ typeSel.value=type; renderChoiceOptions(ctl,type); }
          if(type==='judge'){
            if(p.judgeAnswer){
              const pick=ctl.body.querySelector(`input[name="jok"][value="${p.judgeAnswer}"]`);
              if(pick){ pick.checked=true; filled.push('判断答案'); }
            }
          }else if(Array.isArray(p.options) && p.options.length){
            const list=ctl.body.querySelector('[data-optlist]');
            if(list){
              const letters=Array.isArray(p.answerLetters)?p.answerLetters:[];
              list.innerHTML='';
              p.options.forEach((o,i)=>{
                const mark=letters.includes(o.letter || String.fromCharCode(65+i));
                list.insertAdjacentHTML('beforeend', choiceRowHTML(type, o.text, mark));
                const row=list.lastElementChild;
                const del=row.querySelector('[data-rowdel]');
                if(del) del.onclick=()=>row.remove();
              });
              filled.push('选项');
            }
          }
          if(p.analysis && g('analysis')){ g('analysis').value=p.analysis; filled.push('解析'); }
        }else if(cat==='qa'){
          if(p.refAnswer && g('answer')){ g('answer').value=p.refAnswer; filled.push('参考答案'); }
          if(p.keywords && p.keywords.length && g('keywords')){ g('keywords').value=p.keywords.join(','); filled.push('关键词'); }
        }else{
          if(p.lang && g('lang')){ g('lang').value=p.lang; filled.push('语言'); }
          if(p.refCode && g('refCode')){ g('refCode').value=p.refCode; filled.push('参考代码'); }
          if(p.hint && g('hint')){ g('hint').value=p.hint; filled.push('提示'); }
        }
      }
      if(!filled.length) return '没听出能填的字段，再说一遍';
      if(!sameCat) return `这是${labels[p.category]||''}题，先只填了题干`;
      const miss=(p.missing && p.missing.length)?`（还差：${p.missing.join('、')}）`:'';
      return '已填：'+filled.join('、')+miss;
    }
    // 答题窗：选择题选答案，问答题/代码题把话写进作答框
    function bindRunnerVoice(q, body){
      if(!voiceOn()) return null;
      const btn=body.querySelector('[data-act="voice"]');
      if(!btn) return null;
      const msg=body.querySelector('[data-el="vmsg"]');
      let d=null;
      btn.onclick=()=>{
        if(d && d.isRunning()){ d.stop(); return; }
        d=createDictation({
          onState:(s)=>{ if(s==='listening'){ btn.classList.add('rec'); btn.title='再点一下结束'; if(msg) msg.textContent='正在听…'; } },
          onPartial:(t)=>{ if(msg) msg.textContent=t?('在听：'+t):'正在听…'; },
          onFinal:(t)=>{ idleMic(btn,msg); applyRunnerVoice(q,t,body,msg); },
          onError:(e)=>{ idleMic(btn,msg); if(msg) msg.textContent=e; },
        });
        if(!d.start()) idleMic(btn,msg);
      };
      return { stop:()=>{ if(d && d.isRunning()) d.stop(); } };
    }
    function applyRunnerVoice(q, text, body, msg){
      if(q.categoryKey==='choice' && Array.isArray(q.options) && q.options.length){
        const idxs=pickChoiceIndexes(text, q.options, {multiple:q.type==='multiple'});
        if(!idxs.length){ if(msg) msg.textContent='没对上选项，换种说法再试'; return; }
        const inputs=Array.from(body.querySelectorAll('[name="opt"]'));
        idxs.forEach((i)=>{ if(inputs[i]) inputs[i].checked=true; });
        if(msg) msg.textContent='已选：'+idxs.map((i)=>q.options[i]).join('、');
        return;
      }
      const ta=body.querySelector('[data-ans]');
      if(ta){ ta.value=appendVoiceText(ta.value, text); if(msg) msg.textContent='已写进作答框'; return; }
      if(msg) msg.textContent='这题没有能写入的输入框';
    }

    function collectQuestion(cat,ctl){
      const g=k=>ctl.body.querySelector(`[data-f="${k}"]`);
      const stem=g('stem').value.trim(); if(!stem) return {__error:'题干不能为空'};
      const data={stem};
      if(cat==='choice'){
        const type=g('type').value;
        if(type==='judge'){
          const picked=ctl.body.querySelector('input[name="jok"]:checked');
          if(!picked) return {__error:'判断题请选择正确或错误'};
          data.type='judge'; data.answer=picked.value;
        }else{
          const rows=Array.from(ctl.body.querySelectorAll('[data-optrow]'));
          const options=[],correct=[];
          rows.forEach(row=>{ const text=row.querySelector('[data-opttext]').value.trim(); if(!text) return; options.push(text); if(row.querySelector('[data-optok]').checked) correct.push(text); });
          if(options.length<2) return {__error:'单选/多选至少需要 2 个选项'};
          if(correct.length===0) return {__error:'请标记至少一个正确选项'};
          data.type=type; data.options=options; data.answer=type==='multiple'?correct:correct[0]; data.analysis=g('analysis').value.trim();
        }
      }else if(cat==='qa'){
        data.answer=g('answer').value.trim();
        data.keywords=g('keywords').value.split(',').map(s=>s.trim()).filter(Boolean);
        if(data.keywords.length===0) return {__error:'请至少填写一个关键词'};
      }else{
        data.lang=g('lang').value.trim(); data.refCode=g('refCode').value; data.hint=g('hint').value.trim();
      }
      return data;
    }
    function openAddQuestionModal(){
      let voiceHandle=null;
      const ctl=openModal({title:'添加题目',submitText:'保存题目',cancelText:'取消',bodyHTML:buildQuestionForm(v.cat),
        footExtra:(v.cat==='code'||!voiceOn())?'':micBtnHTML(),
        onClose:()=>{ if(voiceHandle){ try{voiceHandle.stop();}catch(e){} } },
        onSubmit:async()=>{ const data=collectQuestion(v.cat,ctl);
          if(data.__error){ window.alert(data.__error); return true; }
          try{ await Quiz.addQuestion(repo,v.bankId,data); }catch(e){ window.alert(e.message); return true; }
          await refresh(); return false; }});
      voiceHandle=bindQuestionForm(v.cat,ctl);
    }
    function openEditQuestionModal(q){
      let voiceHandle=null;
      const ctl=openModal({title:'编辑题目',submitText:'保存修改',cancelText:'取消',bodyHTML:buildQuestionForm(q.categoryKey),
        footExtra:(q.categoryKey==='code'||!voiceOn())?'':micBtnHTML(),
        onClose:()=>{ if(voiceHandle){ try{voiceHandle.stop();}catch(e){} } },
        onSubmit:async()=>{ const data=collectQuestion(q.categoryKey,ctl);
          if(data.__error){ window.alert(data.__error); return true; }
          try{ await Quiz.updateQuestion(repo,q.id,data); }catch(e){ window.alert(e.message); return true; }
          await refresh(); return false; }});
      voiceHandle=bindQuestionForm(q.categoryKey,ctl);
      const g=k=>ctl.body.querySelector(`[data-f="${k}"]`);
      g('stem').value=q.stem||'';
      if(q.categoryKey==='choice'){
        const typeSel=g('type'); typeSel.value=q.type||'single'; renderChoiceOptions(ctl,typeSel.value);
        if(typeSel.value==='judge'){ const pick=ctl.body.querySelector(`input[name="jok"][value="${q.answer}"]`); if(pick) pick.checked=true; }
        else{
          const list=ctl.body.querySelector('[data-optlist]'); list.innerHTML='';
          const ansSet=new Set(Array.isArray(q.answer)?q.answer:[q.answer]);
          (q.options||[]).forEach(text=>{
            list.insertAdjacentHTML('beforeend',`<div class="row" data-optrow="1" style="gap:8px;margin-bottom:8px">
              <input data-opttext value="${esc(text)}" style="flex:1;min-width:0;min-height:40px;border:1px solid var(--line);border-radius:9px;padding:8px">
              <label class="row" style="gap:4px"><input type="${typeSel.value==='multiple'?'checkbox':'radio'}" ${typeSel.value==='multiple'?'':'name="rec-ok"'} data-optok ${ansSet.has(text)?'checked':''}>正确</label>
              <button type="button" class="btn sm danger" data-rowdel>删</button></div>`);
            list.lastElementChild.querySelector('[data-rowdel]').onclick=()=>list.lastElementChild.remove();
          });
        }
        if(g('analysis')) g('analysis').value=q.analysis||'';
      }else if(q.categoryKey==='qa'){ g('answer').value=q.answer||''; g('keywords').value=(q.keywords||[]).join(','); }
      else{ g('lang').value=q.lang||''; g('refCode').value=q.refCode||''; g('hint').value=q.hint||''; }
    }

    // ---------- 答题 ----------
    // 点右上角 × 等同取消：停计时、断句柄、回题库管理，绝不让旧句柄挡住下一次开始
    function openRunnerModal(){
      if(runnerCtl && !runnerCtl.closed()) return;
      runnerCtl=null;
      runnerCtl=openModal({title:v.mode==='exam'?'考试模式':'顺序练习',footer:false,bodyHTML:'<div data-el="rbody"></div>',
        onClose:()=>{
          if(runnerClosing){ runnerClosing=false; return; }
          cleanupRunner();
          v.screen='manage'; v.qs=[]; v.i=0; v.ans={}; v.fb={}; v.results=[]; v.summary=null;
          refresh();
        }});
    }
    // 统一收尾：停计时、断开弹窗句柄（幂等，多处调用无副作用）
    function cleanupRunner(){
      if(el.__timer){ clearInterval(el.__timer); el.__timer=null; }
      if(runnerVoice){ try{runnerVoice.stop();}catch(e){} runnerVoice=null; }
      runnerCtl=null;
    }
    function closeRunner(){
      runnerClosing=true;
      const c=runnerCtl;
      cleanupRunner();
      if(c){ try{c.close();}catch(e){} }
    }
    function startRunner(mode,qs){
      v.mode=mode; v.qs=qs; v.i=0; v.ans={}; v.fb={}; v.results=[]; v.screen='runner'; v.startedAt=Date.now();
      openRunnerModal(); refresh();
    }
    function collectAnswer(q){
      const scope=runnerCtl?runnerCtl.body:main;
      if(q.categoryKey==='choice'){
        const nodes=scope.querySelectorAll('[name="opt"]:checked');
        const vals=Array.from(nodes).map(n=>n.value);
        return q.type==='multiple'?vals:(vals[0]||'');
      }
      const ta=scope.querySelector('[data-ans]'); return ta?ta.value:'';
    }
    function questionHtml(q){
      const cur=v.ans[v.i]; let body='';
      if(q.categoryKey==='choice'){
        body=q.options.map(opt=>{
          const checked=q.type==='multiple'?(Array.isArray(cur)&&cur.includes(opt)?'checked':''):(cur===opt?'checked':'');
          return `<label class="option-row"><input type="${q.type==='multiple'?'checkbox':'radio'}" name="opt" value="${esc(opt)}" ${checked}><span>${esc(opt)}</span></label>`;
        }).join('');
      }else if(q.categoryKey==='qa'){
        body=`<textarea data-ans class="field" style="min-height:84px" placeholder="输入你的回答">${esc(cur||'')}</textarea>`;
      }else{
        body=`<textarea data-ans class="code-block" style="width:100%;min-height:120px" placeholder="写出你的代码（不运行，待人工批改）">${esc(cur||'')}</textarea>`;
      }
      const fb=v.fb[v.i]; let fbHtml='';
      if(v.mode==='practice'&&fb){
        fbHtml=`<div class="muted" style="margin-top:8px;color:${fb.correct===null?'var(--muted)':(fb.correct?'#2f7d3f':'var(--danger)')}">
          ${fb.correct===null?'已保存，待人工批改':(fb.correct?'回答正确':'回答错误')}${fb.correct===false&&fb.total!=null?`（关键词命中 ${fb.hit}/${fb.total}）`:''}</div>`;
      }
      return `<div class="quiz-progress">第 ${v.i+1} / ${v.qs.length} 题${v.mode==='exam'?' · 考试中':''}</div>
        <div style="font-weight:600;margin:6px 0 10px">${esc(q.stem)}</div>
        <div>${body}</div>${fbHtml}
        <div class="row wrap" style="gap:8px;margin-top:12px">
          <button class="btn sm" data-act="prev" ${v.i===0?'disabled':''}>上一题</button>
          ${v.mode==='practice'?'<button class="btn sm primary" data-act="check">提交本题</button>':''}
          <button class="btn sm" data-act="next" ${v.i>=v.qs.length-1?'disabled':''}>下一题</button>
          ${voiceOn()?'<button type="button" class="btn sm mic-btn" data-act="voice" title="按一下，说一句" aria-label="语音输入">'+MIC_SVG+'</button>':''}
          <button class="btn sm danger" data-act="quit">退出</button>
          ${v.mode==='exam'?'<button class="btn sm primary" data-act="submit">交卷</button>':'<button class="btn sm" data-act="finish">结束练习</button>'}
        </div>
        <div class="muted" data-el="vmsg" style="min-height:16px;margin-top:6px"></div>`;
    }
    function renderRunner(){
      const q=v.qs[v.i]; if(!runnerCtl) openRunnerModal();
      const body=runnerCtl.body.querySelector('[data-el="rbody"]');
      body.innerHTML=questionHtml(q);
      if(v.mode==='exam'){
        if(el.__timer) clearInterval(el.__timer);
        body.insertAdjacentHTML('afterbegin','<div data-el="clock" class="muted" style="margin-bottom:6px"></div>');
        const tick=()=>{ const left=Math.max(0,Math.round((v.deadline-Date.now())/1000));
          const badge=body.querySelector('[data-el="clock"]'); if(badge) badge.textContent=`剩余 ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
          if(left<=0){ clearInterval(el.__timer); el.__timer=null; finishExam(); } };
        tick(); el.__timer=setInterval(tick,1000);
      }
      body.querySelector('[data-act="prev"]').onclick=()=>{ v.ans[v.i]=collectAnswer(q); v.i--; refresh(); };
      body.querySelector('[data-act="next"]').onclick=()=>{ v.ans[v.i]=collectAnswer(q); v.i++; refresh(); };
      const chk=body.querySelector('[data-act="check"]');
      if(chk) chk.onclick=()=>{ v.ans[v.i]=collectAnswer(q); const r=gradeQuestion(q,v.ans[v.i]); v.fb[v.i]={correct:r.correct,hit:r.hit,total:r.total}; refresh(); };
      const fin=body.querySelector('[data-act="finish"]'); if(fin) fin.onclick=()=>finish(false);
      const sub=body.querySelector('[data-act="submit"]');
      if(sub) sub.onclick=()=>openConfirm({title:'交卷确认',message:'确定交卷？',confirmText:'交卷',onConfirm:()=>finishExam()});
      body.querySelector('[data-act="quit"]').onclick=()=>{ closeRunner(); v.screen='manage'; refresh(); };
      if(voiceOn()) runnerVoice=bindRunnerVoice(q, body);
    }
    function finishExam(){ v.ans[v.i]=collectAnswer(v.qs[v.i]); finish(true); }
    async function finish(){
      closeRunner(); let score=0; const startedAt=v.startedAt||Date.now();
      v.results=v.qs.map((q,idx)=>{ const r=gradeQuestion(q,v.ans[idx]); if(r.score) score+=r.score;
        return {questionId:q.id,stem:q.stem,categoryKey:q.categoryKey,correct:r.correct,manual:!!r.manual,
          userAnswer:v.ans[idx],hit:r.hit,total:r.total,answer:q.answer,analysis:q.analysis,refCode:q.refCode,hint:q.hint,keywords:q.keywords}; });
      const timeSpent=Date.now()-startedAt; v.elapsed=timeSpent; v.screen='result';
      await Quiz.saveAttempt(repo,state.currentAccountId,{bankId:v.bankId,mode:v.mode,score,total:v.qs.length,details:v.results,startedAt,submittedAt:Date.now(),timeSpent});
      v.summary={score,total:v.qs.length}; refresh();
    }
    function answerText(r){ if(r.categoryKey==='choice') return Array.isArray(r.answer)?r.answer.join('、'):String(r.answer??''); if(r.categoryKey==='qa') return r.answer||''; return r.refCode||''; }
    function renderResult(){
      const {score,total}=v.summary||{score:0,total:0};
      const wrong=filterWrong(v.results); const rate=Math.round(accuracy(score,total)*100);
      const sec=v.elapsed?Math.round(v.elapsed/1000):0;
      main.innerHTML=`<div class="card">
        <strong>本次成绩：${score} / ${total}</strong>
        <div class="muted" style="margin-top:4px">正确率 ${rate}% · 错题 ${wrong.length} · 用时 ${sec}s</div>
        <div style="margin-top:10px">${v.results.map((r,i)=>{
          const label=r.manual?'待人工批改':(r.correct?'正确':'错误');
          const color=r.manual?'var(--muted)':(r.correct?'#2f7d3f':'var(--danger)');
          const showAns=r.manual===false||r.correct===false?`<div class="muted" style="padding-left:14px;margin:2px 0 6px">参考答案：${esc(answerText(r))}${r.analysis?` · ${esc(r.analysis)}`:''}${r.categoryKey==='qa'&&r.keywords?`（关键词：${esc(r.keywords.join('、'))}）`:''}${r.hint?`<br>提示：${esc(r.hint)}`:''}</div>`:'';
          return `<div style="padding:5px 0;border-bottom:1px solid var(--line)"><div class="row between"><span>${i+1}. ${esc(r.stem)}</span><span style="color:${color}">${label}</span></div>${showAns}</div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn primary" data-act="back">返回题库</button></div></div>`;
      main.querySelector('[data-act="back"]').onclick=()=>{ v.screen='manage'; refresh(); };
    }

    refresh();
  },
};
