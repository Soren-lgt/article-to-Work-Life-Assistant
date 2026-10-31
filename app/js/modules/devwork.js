// AI生成
// 开发工作页：开发任务 / Bug 记录 / 代码片段（三 Tab）；代码片段新增/编辑走可靠模态，代码用多行输入框
import { DevWork, TASK_STATUS, BUG_STATUS } from '../lib/devwork.js';
import { openModal } from '../ui/modal.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 纯函数：代码片段表单 HTML（代码区为多行 textarea，区别于任务/Bug 的单行输入）
export function snippetFormHTML(prefill = {}) {
  const v = (k) => escapeHtml(prefill[k] || '');
  return `
    <label>片段标题</label>
    <input data-f="title" value="${v('title')}" placeholder="片段名称">
    <label>语言（如 js / python，可留空）</label>
    <input data-f="lang" value="${v('lang')}" placeholder="语言标签">
    <label>代码内容（多行输入）</label>
    <textarea data-f="code" rows="8" spellcheck="false" placeholder="粘贴或编写代码……">${v('code')}</textarea>
    <label>描述（可选）</label>
    <input data-f="desc" value="${v('desc')}" placeholder="用途说明">`;
}

export default {
  route: 'devwork',
  title: '开发工作',
  mount(el, ctx) {
    const { repo, state } = ctx;
    let tab = 'task';
    const expanded = new Set();

    el.innerHTML = `
      <div class="row" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <button class="btn" data-tab="task">开发任务</button>
        <button class="btn" data-tab="bug">Bug 记录</button>
        <button class="btn" data-tab="snippet">代码片段</button>
        <span style="flex:1"></span>
        <button class="btn primary" data-act="add"></button>
      </div>
      <div data-el="body"></div>`;

    const body = el.querySelector('[data-el="body"]');
    const addBtn = el.querySelector('[data-act="add"]');

    function accId() {
      const id = state.currentAccountId;
      if (!id) window.alert('请先在设置中创建并选择账号');
      return id;
    }

    async function renderTasks() {
      addBtn.textContent = '+ 新建任务';
      const groups = await DevWork.groupTasksByProject(repo, state.currentAccountId);
      if (groups.length === 0) { body.innerHTML = '<div class="card muted">还没有开发任务。</div>'; return; }
      body.innerHTML = groups.map((g) => `
        <div class="card" style="margin-bottom:12px">
          <strong>${escapeHtml(g.projectName)}</strong>
          <div style="margin-top:8px">
            ${g.tasks.map((t) => `
              <div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)">
                <span style="flex:1">${escapeHtml(t.title)}</span>
                <select data-op="tstatus" data-id="${t.id}">
                  ${TASK_STATUS.map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                <button class="btn" data-op="tedit" data-id="${t.id}" data-title="${escapeHtml(t.title)}" data-proj="${escapeHtml(t.projectName)}" style="padding:2px 8px">编辑</button>
                <button class="btn danger" data-op="tdel" data-id="${t.id}" style="padding:2px 8px">删除</button>
              </div>`).join('')}
          </div>
        </div>`).join('');
    }

    async function renderBugs() {
      addBtn.textContent = '+ 记 Bug';
      const bugs = await DevWork.listBugs(repo, state.currentAccountId);
      if (bugs.length === 0) { body.innerHTML = '<div class="card muted">还没有 Bug 记录。</div>'; return; }
      body.innerHTML = `<div class="card">${bugs.map((b) => `
        <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
          <span style="flex:1">${escapeHtml(b.title)}${b.symptom ? ' <span class="muted">(' + escapeHtml(b.symptom) + ')</span>' : ''}</span>
          <select data-op="bstatus" data-id="${b.id}">
            ${BUG_STATUS.map((s) => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="btn" data-op="bedit" data-id="${b.id}" data-title="${escapeHtml(b.title)}" data-symptom="${escapeHtml(b.symptom || '')}" style="padding:2px 8px">编辑</button>
          <button class="btn danger" data-op="bdel" data-id="${b.id}" style="padding:2px 8px">删除</button>
        </div>`).join('')}</div>`;
    }

    async function renderSnippets() {
      addBtn.textContent = '+ 代码笔记';
      const list = await DevWork.listSnippets(repo, state.currentAccountId);
      if (list.length === 0) { body.innerHTML = '<div class="card muted">还没有代码片段。</div>'; return; }
      body.innerHTML = `<div class="card">${list.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid var(--line)">
          <div class="row" style="justify-content:space-between">
            <span style="flex:1">${escapeHtml(s.title)} <span class="muted">${escapeHtml(s.lang)}</span></span>
            <button class="btn" data-op="sexpand" data-id="${s.id}" style="padding:2px 8px">${expanded.has(s.id) ? '收起' : '查看'}</button>
            <button class="btn" data-op="sedit" data-id="${s.id}" style="padding:2px 8px">编辑</button>
            <button class="btn" data-op="scopy" data-id="${s.id}" style="padding:2px 8px">复制</button>
            <button class="btn danger" data-op="sdel" data-id="${s.id}" style="padding:2px 8px">删除</button>
          </div>
          ${expanded.has(s.id) ? '<pre style="background:var(--bg);padding:8px;border-radius:6px;overflow:auto">' + escapeHtml(s.code) + '</pre>' : ''}
          ${s.desc ? '<div class="muted">' + escapeHtml(s.desc) + '</div>' : ''}
        </div>`).join('')}</div>`;
    }

    async function render() {
      el.querySelectorAll('[data-tab]').forEach((b) => {
        b.classList.toggle('primary', b.dataset.tab === tab);
      });
      if (tab === 'task') await renderTasks();
      else if (tab === 'bug') await renderBugs();
      else await renderSnippets();
    }

    // 代码片段：新增 / 编辑共用模态，代码为多行 textarea，关闭可靠（遮罩/取消/×/提交均可关）
    function openSnippetModal(prefill = {}) {
      if (!accId()) return;
      const ctl = openModal({
        title: prefill.id ? '编辑代码片段' : '新增代码片段',
        submitText: '保存',
        bodyHTML: snippetFormHTML(prefill),
        onSubmit: async () => {
          const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title = g('title').trim();
          if (!title) { window.alert('片段标题不能为空'); return true; } // 校验失败保持弹窗
          const payload = { title, lang: g('lang').trim(), code: g('code'), desc: g('desc').trim() };
          if (prefill.id) await DevWork.updateSnippet(repo, prefill.id, payload);
          else await DevWork.addSnippet(repo, state.currentAccountId, payload);
          await render();
          return false; // 成功自动关闭
        },
      });
    }

    el.addEventListener('click', async (e) => {
      const t = e.target.dataset.tab;
      const op = e.target.dataset.op;
      const act = e.target.dataset.act;

      if (t) { tab = t; await render(); return; }

      if (act === 'add') {
        if (!accId()) return;
        if (tab === 'task') {
          const title = window.prompt('任务标题');
          if (title == null) return;
          const projectName = window.prompt('所属项目（可留空）', '') || '未分组';
          try { await DevWork.addTask(repo, state.currentAccountId, { title, projectName }); } catch (err) { window.alert(err.message); return; }
        } else if (tab === 'bug') {
          const title = window.prompt('Bug 标题');
          if (title == null) return;
          const symptom = window.prompt('现象（可留空）', '') || '';
          try { await DevWork.addBug(repo, state.currentAccountId, { title, symptom }); } catch (err) { window.alert(err.message); return; }
        } else {
          openSnippetModal({});
        }
        await render();
        return;
      }

      if (op === 'tdel') { if (window.confirm('删除该任务？')) { await DevWork.removeTask(repo, e.target.dataset.id); await render(); } }
      else if (op === 'bdel') { if (window.confirm('删除该 Bug？')) { await DevWork.removeBug(repo, e.target.dataset.id); await render(); } }
      else if (op === 'sdel') { if (window.confirm('删除该片段？')) { await DevWork.removeSnippet(repo, e.target.dataset.id); await render(); } }
      else if (op === 'sexpand') { const id = e.target.dataset.id; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); await render(); }
      else if (op === 'scopy') {
        const s = await repo.get('devSnippet', e.target.dataset.id);
        if (s) {
          try { await navigator.clipboard.writeText(s.code); window.alert('代码已复制'); }
          catch (err) { window.prompt('复制以下代码', s.code); }
        }
      }
      else if (op === 'sedit') {
        const s = await repo.get('devSnippet', e.target.dataset.id);
        if (s) openSnippetModal(s);
      }
      else if (op === 'tedit') {
        const id = e.target.dataset.id;
        const title = window.prompt('任务标题', e.target.dataset.title);
        if (title == null) return;
        const projectName = window.prompt('所属项目', e.target.dataset.proj);
        if (projectName == null) return;
        try { await DevWork.updateTask(repo, id, { title, projectName }); await render(); }
        catch (err) { window.alert(err.message); }
      }
      else if (op === 'bedit') {
        const id = e.target.dataset.id;
        const title = window.prompt('Bug 标题', e.target.dataset.title);
        if (title == null) return;
        const symptom = window.prompt('现象描述', e.target.dataset.symptom);
        if (symptom == null) return;
        try { await DevWork.updateBug(repo, id, { title, symptom }); await render(); }
        catch (err) { window.alert(err.message); }
      }
    });

    el.addEventListener('change', async (e) => {
      const op = e.target.dataset.op;
      if (op === 'tstatus') { await DevWork.setTaskStatus(repo, e.target.dataset.id, e.target.value); await render(); }
      else if (op === 'bstatus') { await DevWork.setBugStatus(repo, e.target.dataset.id, e.target.value); await render(); }
    });

    if (el.__unsub) el.__unsub();
    el.__unsub = state.subscribe(() => { render(); });

    render();
  },
};