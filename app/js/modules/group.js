// AI生成
// 同组计划模块：小组切换 / 项目看板 / 成员与入组（加入码） / 日志 / 通知 / 文件附件
import { Group, Task, roleOf, buildJoinCode, parseJoinCode } from '../lib/group.js';
import { Accounts } from '../lib/accounts.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const CAN_MANAGE = ['owner', 'deputy'];

export default {
  route: 'group',
  title: '同组计划',
  mount(el, ctx) {
    const { repo, state } = ctx;
    const v = { groupId: state.currentGroupId || null, tab: 'project', projectId: null };
    let fileInput = null;

    function readFileAsDataUrl(f) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(f);
      });
    }

    el.innerHTML = `
      <div class="card" style="padding:10px">
        <div class="row" style="justify-content:space-between">
          <div class="row" data-el="groups" style="gap:8px;flex-wrap:wrap"></div>
          <div class="row" style="gap:8px">
            <button class="btn" data-act="newGroup">+ 新建小组</button>
            <button class="btn" data-act="joinGroup">加入小组</button>
          </div>
        </div>
      </div>
      <div data-el="body"></div>`;
    const groupsBar = el.querySelector('[data-el="groups"]');
    const body = el.querySelector('[data-el="body"]');

    async function roleNow() { return v.groupId ? roleOf(repo, v.groupId, state.currentAccountId) : null; }

    async function refresh() {
      const accId = state.currentAccountId;
      if (!accId) { groupsBar.innerHTML = ''; body.innerHTML = '<div class="card muted">请先在设置中创建账号。</div>'; return; }
      const groups = await Group.listForAccount(repo, accId);
      if (v.groupId && !groups.some((g) => g.id === v.groupId)) v.groupId = null;
      if (!v.groupId && groups.length) v.groupId = groups[0].id;

      groupsBar.innerHTML = groups.map((g) =>
        `<button class="btn ${g.id === v.groupId ? 'primary' : ''}" data-g="${g.id}">${esc(g.name)}<span class="muted">(${g.role === 'owner' ? '组长' : g.role === 'deputy' ? '副组长' : '成员'})</span></button>`).join('');
      groupsBar.querySelectorAll('[data-g]').forEach((b) => {
        b.onclick = () => { v.groupId = b.dataset.g; state.set({ currentGroupId: v.groupId }); v.tab = 'project'; refresh(); };
      });

      if (!v.groupId) { body.innerHTML = '<div class="card muted">你还没有加入任何小组，点击右上「新建小组」或「加入小组」。</div>'; return; }

      const role = await roleNow();
      const tabs = [['project', '项目'], ['member', '成员'], ['log', '日志'], ['notice', '通知']];
      body.innerHTML = `
        <div class="card" style="padding:10px">
          <div class="row" data-el="tabs" style="gap:8px"></div>
        </div>
        <div data-el="pane"></div>`;
      const tabsEl = body.querySelector('[data-el="tabs"]');
      tabsEl.innerHTML = tabs.map(([k, n]) => `<button class="btn ${v.tab === k ? 'primary' : ''}" data-tab="${k}">${n}</button>`).join('');
      tabsEl.querySelectorAll('[data-tab]').forEach((b) => {
        b.onclick = () => { v.tab = b.dataset.tab; refresh(); };
      });

      const pane = body.querySelector('[data-el="pane"]');
      if (v.tab === 'project') await renderProjects(pane, role);
      else if (v.tab === 'member') await renderMembers(pane, role);
      else if (v.tab === 'log') await renderLogs(pane);
      else await renderNotices(pane);
    }

    // ---------- 项目看板 ----------
    async function renderProjects(pane, role) {
      const projects = await Task.listProjects(repo, v.groupId);
      const tasks = await Task.listTasks(repo, v.groupId);
      if (v.projectId && !projects.some((p) => p.id === v.projectId)) v.projectId = null;

      pane.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>项目</strong>
            ${CAN_MANAGE.includes(role) ? '<button class="btn primary" data-act="newProject">+ 新建项目</button>' : '<span class="muted">仅组长/副组长可管理项目</span>'}
          </div>
          <div class="row" data-el="plist" style="gap:8px;flex-wrap:wrap;margin-top:8px"></div>
        </div>
        <div data-el="board"></div>`;
      const plist = pane.querySelector('[data-el="plist"]');
      plist.innerHTML = projects.length
        ? projects.map((p) => `<button class="btn ${p.id === v.projectId ? 'primary' : ''}" data-p="${p.id}">${esc(p.name)}${p.deadline ? `<span class="muted">·截止 ${esc(p.deadline)}</span>` : ''}</button>`).join('')
        : '<span class="muted">暂无项目</span>';
      plist.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { v.projectId = b.dataset.p; refresh(); }; });

      const np = pane.querySelector('[data-act="newProject"]');
      if (np) np.onclick = async () => {
        const name = prompt('项目名称：'); if (name == null) return;
        const deadline = prompt('截止时间（可留空，如 2026-12-31）：') || null;
        try { await Task.addProject(repo, v.groupId, state.currentAccountId, { name, deadline }); refresh(); }
        catch (e) { alert(e.message); }
      };

      const board = pane.querySelector('[data-el="board"]');
      const list = v.projectId ? tasks.filter((t) => t.projectId === v.projectId) : tasks;
      const cols = [['todo', '待办'], ['review', '待审核'], ['done', '已完成']];
      board.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>任务看板 ${v.projectId ? '' : '（全部）'}</strong>
            ${CAN_MANAGE.includes(role) ? '<button class="btn" data-act="newTask">+ 新建任务</button>' : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px">
            ${cols.map(([k, n]) => `<div>
              <div class="muted" style="margin-bottom:6px">${n} (${list.filter((t) => t.status === k).length})</div>
              ${list.filter((t) => t.status === k).map((t) => taskCard(t, role)).join('') || '<div class="muted">&mdash;</div>'}
            </div>`).join('')}
          </div>
        </div>`;

      const nt = board.querySelector('[data-act="newTask"]');
      if (nt) nt.onclick = async () => {
        const title = prompt('任务标题：'); if (title == null) return;
        const desc = prompt('描述（可留空）：') || '';
        let assignee = prompt('指派给成员账号ID（可留空）：') || null;
        try { await Task.addTask(repo, v.groupId, state.currentAccountId, { projectId: v.projectId, title, desc, assigneeAccountId: assignee }); refresh(); }
        catch (e) { alert(e.message); }
      };

      // 上传附件：优先选择真实文件（存为 Base64 DataURL）
      board.querySelectorAll('[data-upload]').forEach((b) => b.onclick = () => {
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.style.display = 'none';
          document.body.appendChild(fileInput);
        }
        fileInput.value = '';
        fileInput.onchange = async () => {
          const f = fileInput.files && fileInput.files[0];
          if (!f) return;
          try {
            const dataUrl = await readFileAsDataUrl(f);
            await Task.uploadAttachment(repo, b.dataset.upload, state.currentAccountId, { name: f.name, content: dataUrl });
            refresh();
          } catch (e) { alert(e.message); }
        };
        fileInput.click();
      });
      board.querySelectorAll('[data-confirm]').forEach((b) => b.onclick = async () => {
        try { await Task.confirmTask(repo, v.groupId, state.currentAccountId, b.dataset.confirm); refresh(); } catch (e) { alert(e.message); }
      });
      board.querySelectorAll('[data-reject]').forEach((b) => b.onclick = async () => {
        try { await Task.rejectTask(repo, v.groupId, state.currentAccountId, b.dataset.reject); refresh(); } catch (e) { alert(e.message); }
      });
      board.querySelectorAll('[data-att]').forEach((b) => b.onclick = async () => {
        const atts = await Task.listAttachments(repo, b.dataset.att);
        alert(atts.length ? atts.map((a) => a.content && String(a.content).startsWith('data:')
          ? `· ${a.name}（已上传文件）`
          : `· ${a.name}: ${a.content}`).join('\n') : '暂无附件');
      });
      board.querySelectorAll('[data-deltask]').forEach((b) => b.onclick = async () => {
        if (!confirm('删除该任务？')) return;
        try { await Task.removeTask(repo, v.groupId, state.currentAccountId, b.dataset.deltask); refresh(); } catch (e) { alert(e.message); }
      });
    }

    function taskCard(t, role) {
      const badge = t.status === 'todo' ? '' : (t.status === 'review' ? ' <span class="muted">[待审核]</span>' : ' <span class="muted">[已完成]</span>');
      const actions = [];
      actions.push(`<button class="btn" data-upload="${t.id}">上传附件</button>`);
      if (t.status === 'review' && CAN_MANAGE.includes(role)) {
        actions.push(`<button class="btn primary" data-confirm="${t.id}">确认完成</button>`);
        actions.push(`<button class="btn" data-reject="${t.id}">驳回</button>`);
      }
      actions.push(`<button class="btn" data-att="${t.id}">查看附件</button>`);
      if (CAN_MANAGE.includes(role)) actions.push(`<button class="btn" data-deltask="${t.id}" style="color:#c00">删除</button>`);
      return `<div class="card" style="padding:8px;margin-bottom:6px">
        <div>${esc(t.title)}${badge}</div>
        ${t.desc ? `<div class="muted" style="margin-top:4px">${esc(t.desc)}</div>` : ''}
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${actions.join('')}</div>
      </div>`;
    }

    // ---------- 成员 ----------
    async function renderMembers(pane, role) {
      const members = await Group.listMembers(repo, v.groupId);
      const accs = await Accounts.list(repo);
      const nameOf = (id) => (accs.find((a) => a.id === id) || {}).name || id;
      const reqs = CAN_MANAGE.includes(role) ? await Group.listJoinRequests(repo, v.groupId) : [];

      pane.innerHTML = `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <strong>成员（${members.length}）</strong>
            <span class="row" style="gap:6px">
              ${CAN_MANAGE.includes(role) ? '<button class="btn" data-act="copyCode">复制加入码</button>' : ''}
              ${CAN_MANAGE.includes(role) ? '<button class="btn primary" data-act="invite">+ 邀请本机账号</button>' : ''}
            </span>
          </div>
          <div style="margin-top:8px">${members.map((m) => `
            <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
              <span>${esc(nameOf(m.accountId))} <span class="muted">${Group.ROLES[m.role]}</span></span>
              <span class="row" style="gap:6px">
                ${role === 'owner' && m.role === 'member' ? `<button class="btn" data-mdep="${m.accountId}">设副组长</button>` : ''}
                ${role === 'owner' && m.role === 'deputy' ? `<button class="btn" data-rprev="${m.accountId}">撤副组长</button>` : ''}
                ${role === 'owner' && m.role !== 'owner' ? `<button class="btn" data-trans="${m.accountId}">转让组长</button>` : ''}
                ${CAN_MANAGE.includes(role) && m.role !== 'owner' ? `<button class="btn" data-rm="${m.accountId}" style="color:#c00">移除</button>` : ''}
              </span>
            </div>`).join('')}</div>
        </div>
        ${CAN_MANAGE.includes(role) ? `<div class="card">
          <strong>入组申请（${reqs.length}）</strong>
          <div style="margin-top:8px">${reqs.length ? reqs.map((r) => `
            <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
              <span>${esc(nameOf(r.accountId))}</span>
              <span class="row" style="gap:6px">
                <button class="btn primary" data-approve="${r.id}">通过</button>
                <button class="btn" data-rejectreq="${r.id}">拒绝</button>
              </span>
            </div>`).join('') : '<span class="muted">暂无申请</span>'}</div>
        </div>` : ''}
        ${role === 'owner' ? '<div class="card"><button class="btn" data-act="delGroup" style="color:#c00">删除小组</button></div>' : ''}`;

      const call = { 'data-mdep': (id) => Group.setDeputy(repo, v.groupId, state.currentAccountId, id), 'data-rprev': (id) => Group.removeDeputy(repo, v.groupId, state.currentAccountId, id), 'data-rm': (id) => Group.removeMember(repo, v.groupId, state.currentAccountId, id), 'data-trans': (id) => Group.transferOwner(repo, v.groupId, state.currentAccountId, id) };
      for (const [attr, fn] of Object.entries(call)) {
        pane.querySelectorAll(`[${attr}]`).forEach((b) => b.onclick = async () => {
          const id = b.getAttribute(attr);
          const labels = { 'data-mdep': '设为副组长？', 'data-rprev': '撤销副组长？', 'data-rm': '移除成员？', 'data-trans': '转让组长？你将变为普通成员。' };
          if (!confirm(labels[attr])) return;
          try { await fn(id); refresh(); } catch (e) { alert(e.message); }
        });
      }
      pane.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => { await Group.handleJoinRequest(repo, v.groupId, state.currentAccountId, b.dataset.approve, true); refresh(); });
      pane.querySelectorAll('[data-rejectreq]').forEach((b) => b.onclick = async () => { await Group.handleJoinRequest(repo, v.groupId, state.currentAccountId, b.dataset.rejectreq, false); refresh(); });

      const cc = pane.querySelector('[data-act="copyCode"]');
      if (cc) cc.onclick = async () => {
        const code = buildJoinCode(v.groupId);
        try { await navigator.clipboard.writeText(code); alert('加入码已复制：' + code + '，发给组员在「加入小组」粘贴即可申请。'); }
        catch (e) { prompt('加入码（复制给组员）', code); }
      };
      const inv = pane.querySelector('[data-act="invite"]');
      if (inv) inv.onclick = async () => {
        const accId = prompt('要邀请的本机账号ID：'); if (accId == null) return;
        try { await Group.invite(repo, v.groupId, state.currentAccountId, { accountId: accId, name: nameOf(accId) }); refresh(); }
        catch (e) { alert(e.message); }
      };
      const dg = pane.querySelector('[data-act="delGroup"]');
      if (dg) dg.onclick = async () => {
        if (!confirm('删除小组将清除其全部项目、任务与日志，确定？')) return;
        try { await Group.deleteGroup(repo, v.groupId, state.currentAccountId); v.groupId = null; refresh(); } catch (e) { alert(e.message); }
      };
    }

    // ---------- 日志 ----------
    async function renderLogs(pane) {
      const logs = await Group.listLogs(repo, v.groupId);
      pane.innerHTML = `<div class="card"><strong>操作日志</strong><div style="margin-top:8px">
        ${logs.length ? logs.map((l) => `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)">
          <span>${esc(l.detail)}</span><span class="muted">${esc(new Date(l.createdAt).toLocaleString())}</span></div>`).join('') : '<span class="muted">暂无日志</span>'}
      </div></div>`;
    }

    // ---------- 通知 ----------
    async function renderNotices(pane) {
      const list = await Group.listNotifications(repo, v.groupId, state.currentAccountId);
      pane.innerHTML = `<div class="card"><strong>通知</strong><div style="margin-top:8px">
        ${list.length ? list.map((n) => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
          <span>${n.read ? '' : '<span style="color:#c00">&bull;</span> '}${esc(n.title)}${n.body ? ` — ${esc(n.body)}` : ''}</span>
          ${n.read ? '' : `<button class="btn" data-read="${n.id}">标记已读</button>`}</div>`).join('') : '<span class="muted">暂无通知</span>'}
      </div></div>`;
      pane.querySelectorAll('[data-read]').forEach((b) => b.onclick = async () => { await Group.markNotificationRead(repo, b.dataset.read); refresh(); if (typeof state.emit === 'function') state.emit(); });
    }

    el.querySelector('[data-act="newGroup"]').onclick = async () => {
      const name = prompt('小组名称：'); if (name == null) return;
      try { const g = await Group.create(repo, name, state.currentAccountId); v.groupId = g.id; state.set({ currentGroupId: g.id }); refresh(); }
      catch (e) { alert(e.message); }
    };
    el.querySelector('[data-act="joinGroup"]').onclick = async () => {
      const input = prompt('粘贴加入码（WL-开头）或直接输入小组ID：'); if (input == null) return;
      const gid = parseJoinCode(input) || String(input).trim();
      try { await Group.requestJoin(repo, gid, { accountId: state.currentAccountId }); alert('申请已提交，等待组长/副组长审核'); }
      catch (e) { alert(e.message); }
    };

    refresh();
  },
};