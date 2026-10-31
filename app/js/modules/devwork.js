// AI生成
// 开发工作页：开发任务 / Bug 记录 / 代码片段（三 Tab）；新增/编辑/删除均走可靠模态弹窗
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

// 纯函数：开发任务表单（标题 + 所属项目）
export function taskFormHTML(prefill = {}) {
  const v = (k) => escapeHtml(prefill[k] == null ? '' : prefill[k]);
  return `
    <label>任务标题</label>
    <input data-f="title" value="${v('title')}" placeholder="要开发的任务">
    <label>所属项目（可留空，默认未分组）</label>
    <input data-f="projectName" value="${v('projectName')}" placeholder="未分组">`;
}

// 纯函数：Bug 表单（标题 + 多行现象描述）
export function bugFormHTML(prefill = {}) {
  const v = (k) => escapeHtml(prefill[k] == null ? '' : prefill[k]);
  return `
    <label>Bug 标题</label>
    <input data-f="title" value="${v('title')}" placeholder="Bug 简述">
    <label>现象描述（可选）</label>
    <textarea data-f="symptom" rows="4" placeholder="复现步骤 / 现象……">${v('symptom')}</textarea>`;
}

// 纯函数：删除确认弹窗正文
export function devConfirmHTML(kindLabel, title) {
  return `<div>确认删除该${kindLabel}「${escapeHtml(title)}」？此操作不可撤销。</div>`;
}

export default {
  route: 'devwork',
  title: '开发工作',
  mount(el, ctx) {
    const { repo, state } = ctx;
    let tab = 'task';
    const expanded = new Set();
    let taskRows = [];
    let bugRows = [];
    let snippetRows = [];

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
      taskRows = groups.flatMap((g) => g.tasks);
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
                <button class="btn" data-op="tedit" data-id="${t.id}" style="padding:2px 8px">编辑</button>
                <button class="btn danger" data-op="tdel" data-id="${t.id}" style="padding:2px 8px">删除</button>
              </div>`).join('')}
          </div>
        </div>`).join('');
    }

    async function renderBugs() {
      addBtn.textContent = '+ 记 Bug';
      const bugs = await DevWork.listBugs(repo, state.currentAccountId);
      bugRows = bugs;
      if (bugs.length === 0) { body.innerHTML = '<div class="card muted">还没有 Bug 记录。</div>'; return; }
      body.innerHTML = `<div class="card">${bugs.map((b) => `
        <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
          <span style="flex:1">${escapeHtml(b.title)}${b.symptom ? ' <span class="muted">(' + escapeHtml(b.symptom) + ')</span>' : ''}</span>
          <select data-op="bstatus" data-id="${b.id}">
            ${BUG_STATUS.map((s) => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="btn" data-op="bedit" data-id="${b.id}" style="padding:2px 8px">编辑</button>
          <button class="btn danger" data-op="bdel" data-id="${b.id}" style="padding:2px 8px">删除</button>
        </div>`).join('')}</div>`;
    }

    async function renderSnippets() {
      addBtn.textContent = '+ 代码笔记';
      const list = await DevWork.listSnippets(repo, state.currentAccountId);
      snippetRows = list;
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

    // 任务：新增 / 编辑共用模态
    function openTaskModal(prefill = {}) {
      if (!accId()) return;
      const ctl = openModal({
        title: prefill.id ? '编辑任务' : '新建任务',
        submitText: prefill.id ? '保存' : '创建',
        cancelText: '取消',
        bodyHTML: taskFormHTML(prefill),
        onSubmit: async () => {
          const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title = g('title').trim();
          if (!title) { window.alert('任务标题不能为空'); return true; }
          const projectName = g('projectName').trim();
          if (prefill.id) await DevWork.updateTask(repo, prefill.id, { title, projectName });
          else await DevWork.addTask(repo, state.currentAccountId, { title, projectName });
          await render();
          return false;
        },
      });
    }

    // Bug：新增 / 编辑共用模态
    function openBugModal(prefill = {}) {
      if (!accId()) return;
      const ctl = openModal({
        title: prefill.id ? '编辑 Bug' : '记 Bug',
        submitText: prefill.id ? '保存' : '提交',
        cancelText: '取消',
        bodyHTML: bugFormHTML(prefill),
        onSubmit: async () => {
          const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title = g('title').trim();
          if (!title) { window.alert('Bug 标题不能为空'); return true; }
          const symptom = g('symptom').trim();
          if (prefill.id) await DevWork.updateBug(repo, prefill.id, { title, symptom });
          else await DevWork.addBug(repo, state.currentAccountId, { title, symptom });
          await render();
          return false;
        },
      });
    }

    // 代码片段：新增 / 编辑共用模态，代码为多行 textarea
    function openSnippetModal(prefill = {}) {
      if (!accId()) return;
      const ctl = openModal({
        title: prefill.id ? '编辑代码片段' : '新增代码片段',
        submitText: '保存',
        cancelText: '取消',
        bodyHTML: snippetFormHTML(prefill),
        onSubmit: async () => {
          const g = (k) => ctl.body.querySelector(`[data-f="${k}"]`).value;
          const title = g('title').trim();
          if (!title) { window.alert('片段标题不能为空'); return true; }
          const payload = { title, lang: g('lang').trim(), code: g('code'), desc: g('desc').trim() };
          if (prefill.id) await DevWork.updateSnippet(repo, prefill.id, payload);
          else await DevWork.addSnippet(repo, state.currentAccountId, payload);
          await render();
          return false;
        },
      });
    }

    // 通用删除确认模态（任务 / Bug / 代码片段）
    function openRemoveModal(kind, id, title) {
      const label = { task: '任务', bug: 'Bug', snippet: '代码片段' }[kind];
      openModal({
        title: '删除' + label,
        submitText: '删除',
        cancelText: '取消',
        bodyHTML: devConfirmHTML(label, title),
        onSubmit: async () => {
          if (kind === 'task') await DevWork.removeTask(repo, id);
          else if (kind === 'bug') await DevWork.removeBug(repo, id);
          else await DevWork.removeSnippet(repo, id);
          await render();
          return false;
        },
      });
    }

    el.addEventListener('click', async (e) => {
      const t = e.target.dataset.tab;
      const op = e.target.dataset.op;
      const act = e.target.dataset.act;
      const id = e.target.dataset.id;

      if (t) { tab = t; await render(); return; }

      if (act === 'add') {
        if (tab === 'task') openTaskModal({});
        else if (tab === 'bug') openBugModal({});
        else openSnippetModal({});
        return;
      }

      if (op === 'tdel') { const x = taskRows.find((r) => r.id === id); if (x) openRemoveModal('task', id, x.title); }
      else if (op === 'bdel') { const x = bugRows.find((r) => r.id === id); if (x) openRemoveModal('bug', id, x.title); }
      else if (op === 'sdel') { const x = snippetRows.find((r) => r.id === id); if (x) openRemoveModal('snippet', id, x.title); }
      else if (op === 'sexpand') { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); await render(); }
      else if (op === 'scopy') {
        const s = snippetRows.find((r) => r.id === id);
        if (s && typeof navigator !== 'undefined' && navigator.clipboard) {
          try { await navigator.clipboard.writeText(s.code); window.alert('代码已复制'); }
          catch (err) { window.alert(err.message || '复制失败'); }
        }
      }
      else if (op === 'tedit') { const x = taskRows.find((r) => r.id === id); if (x) openTaskModal(x); }
      else if (op === 'bedit') { const x = bugRows.find((r) => r.id === id); if (x) openBugModal(x); }
      else if (op === 'sedit') { const x = snippetRows.find((r) => r.id === id); if (x) openSnippetModal(x); }
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