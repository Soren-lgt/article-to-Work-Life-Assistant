// AI生成
// 同组计划模块：小组切换 / 项目看板 / 成员与入组（10位数字加入码、按名字邀请）/ 日志 / 通知 / 附件（成员下载、本人删除）
import { Group, Task, roleOf, buildJoinCode, parseJoinCode, findGroupByJoinCode } from '../lib/group.js';
import { Accounts } from '../lib/accounts.js';
import { openModal, openConfirm, openPrompt } from '../ui/modal.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 纯函数：把 datetime-local 的 T 分隔符展示为空格，纯日期原样保留
export function formatDeadline(s) {
  if (!s) return '';
  return String(s).replace('T', ' ');
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
      if (np) np.onclick = () => {
        const ctl = openModal({
          title: '新建项目', submitText: '创建', cancelText: '取消',
          bodyHTML: `<label class="acc-field"><span>项目名称</span><input data-f="pname"></label>
            <label class="acc-field"><span>截止时间（可留空，如 2026-12-31）</span><input data-f="pdead"></label>`,
          onSubmit: async () => {
            const name = ctl.body.querySelector('[data-f="pname"]').value;
            const deadline = ctl.body.querySelector('[data-f="pdead"]').value || null;
            if (!String(name || '').trim()) return true;
            try { await Task.addProject(repo, v.groupId, state.currentAccountId, { name, deadline }); refresh(); }
            catch (e) { alert(e.message); return true; }
            return false;
          },
        });
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

      // 新建任务：可靠模态，含标题/描述/指派人/截止时间
      const nt = board.querySelector('[data-act="newTask"]');
      if (nt) nt.onclick = async () => {
        const members = await Group.listMembers(repo, v.groupId);
        const me = state.currentAccountId;
        const assigneeOpts = members
          .filter((m) => m.accountId !== me)
          .map((m) => {
            const acc = members.find((x) => x.accountId === m.accountId);
            return `<option value="${m.accountId}">${esc(m.name || m.accountId)}</option>`;
          }).join('');
        const ctl = openModal({
          title: '新建任务',
          submitText: '创建',
          bodyHTML: `
            <label>任务标题</label><input data-f="title" placeholder="任务标题">
            <label>描述（可留空）</label><textarea data-f="desc" rows="3" placeholder="补充说明"></textarea>
            <label>指派给（可留空）</label>
            <select data-f="assignee"><option value="">不指派</option>${assigneeOpts}</select>
            <label>截止时间（可留空，含时:分）</label><input type="datetime-local" data-f="deadline">`,
          onSubmit: async () => {
            const title = ctl.body.querySelector('[data-f="title"]').value.trim();
            if (!title) { window.alert('任务标题不能为空'); return true; }
            const desc = ctl.body.querySelector('[data-f="desc"]').value.trim();
            const assignee = ctl.body.querySelector('[data-f="assignee"]').value || null;
            const deadline = ctl.body.querySelector('[data-f="deadline"]').value || null;
            try {
              await Task.addTask(repo, v.groupId, state.currentAccountId, { projectId: v.projectId, title, desc, assigneeAccountId: assignee, deadline });
            } catch (e) { window.alert(e.message); return true; }
            await refresh();
            return false;
          },
        });
      };

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
      board.querySelectorAll('[data-att]').forEach((b) => b.onclick = () => openAttachModal(b.dataset.att));
      board.querySelectorAll('[data-deltask]').forEach((b) => b.onclick = () => {
        openConfirm({
          title: '删除任务', confirmText: '删除', message: '删除该任务？',
          onConfirm: async () => {
            try { await Task.removeTask(repo, v.groupId, state.currentAccountId, b.dataset.deltask); refresh(); } catch (e) { alert(e.message); }
          },
        });
      });
    }

    function triggerDownload(a) {
      if (a.content && String(a.content).startsWith('data:')) {
        const link = document.createElement('a');
        link.href = a.content; link.download = a.name;
        document.body.appendChild(link); link.click(); link.remove();
      } else {
        const ctl = openModal({
          title: '附件文本内容（可复制）', submitText: '关闭',
          bodyHTML: '<div data-el="txt" style="white-space:pre-wrap;word-break:break-all"></div>',
          onSubmit: async () => false,
        });
        ctl.body.querySelector('[data-el="txt"]').textContent = a.content || '';
      }
    }

    // 查看附件：其他成员可下载；上传者本人可删除自己的附件
    async function openAttachModal(taskId) {
      const atts = await Task.listAttachments(repo, taskId);
      const me = state.currentAccountId;
      const rows = atts.map((a) => {
        const mine = a.uploadedBy === me;
        return `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
          <span style="flex:1">${esc(a.name)}</span>
          <span class="row" style="gap:6px">
            <button class="btn" data-dl="${a.id}">下载</button>
            ${mine ? `<button class="btn danger" data-delatt="${a.id}">删除</button>` : ''}
          </span>
        </div>`;
      }).join('');
      const ctl = openModal({
        title: '任务附件',
        submitText: '关闭',
        bodyHTML: rows || '<div class="muted">暂无附件</div>',
        onSubmit: () => false,
      });
      ctl.body.querySelectorAll('[data-dl]').forEach((b) => b.onclick = async () => {
        try { const a = await Task.downloadAttachment(repo, me, b.dataset.dl); triggerDownload(a); }
        catch (e) { window.alert(e.message); }
      });
      ctl.body.querySelectorAll('[data-delatt]').forEach((b) => b.onclick = () => {
        openConfirm({
          title: '删除附件', confirmText: '删除', message: '删除自己上传的该附件？',
          onConfirm: async () => {
            try { await Task.removeAttachment(repo, me, b.dataset.delatt); ctl.close(); await refresh(); }
            catch (e) { window.alert(e.message); }
          },
        });
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
        ${t.deadline ? `<div class="muted" style="margin-top:4px">截止：${esc(formatDeadline(t.deadline))}</div>` : ''}
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
              ${CAN_MANAGE.includes(role) ? '<button class="btn primary" data-act="invite">+ 邀请</button>' : ''}
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

      const call = { 'data-mdep': (id) => Group.setDeputy(repo, v.groupId, state.currentAccountId, id), 'data-rprev': (id) => Group.removeDeputy(repo, v.groupId, state.currentAccountId, id), 'data-rm': (id) => Group.removeMember(repo, v.groupId, state.currentAccountId, id), 'data-trans': (id) => Group.transferOwner(repo, v.groupId, id) };
      for (const [attr, fn] of Object.entries(call)) {
        pane.querySelectorAll(`[${attr}]`).forEach((b) => b.onclick = () => {
          const id = b.getAttribute(attr);
          const labels = { 'data-mdep': '设为副组长？', 'data-rprev': '撤销副组长？', 'data-rm': '移除成员？', 'data-trans': '转让组长？你将变为普通成员。' };
          openConfirm({
            title: '成员操作', confirmText: '确定', message: labels[attr],
            onConfirm: async () => { try { await fn(id); refresh(); } catch (e) { alert(e.message); } },
          });
        });
      }
      pane.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => { await Group.handleJoinRequest(repo, v.groupId, state.currentAccountId, b.dataset.approve, true); refresh(); });
      pane.querySelectorAll('[data-rejectreq]').forEach((b) => b.onclick = async () => { await Group.handleJoinRequest(repo, v.groupId, state.currentAccountId, b.dataset.rejectreq, false); refresh(); });

      const cc = pane.querySelector('[data-act="copyCode"]');
      if (cc) cc.onclick = async () => {
        const g = await Group.get(repo, v.groupId);
        const code = buildJoinCode(g);
        try { await navigator.clipboard.writeText(code); alert('加入码已复制：' + code + '（10位数字），发给组员在「加入小组」粘贴即可申请。'); }
        catch (e) {
          const ccCtl = openModal({
            title: '加入码（复制给组员，10位数字）', submitText: '关闭',
            bodyHTML: '<div data-el="cc" style="word-break:break-all"></div>',
            onSubmit: async () => false,
          });
          ccCtl.body.querySelector('[data-el="cc"]').textContent = code;
        }
      };

      // 邀请：按对方名字选择本机账号（弹窗可可靠关闭）
      const inv = pane.querySelector('[data-act="invite"]');
      if (inv) inv.onclick = async () => {
        const all = await Accounts.list(repo);
        const taken = new Set(members.map((m) => m.accountId));
        const candidates = all.filter((a) => !taken.has(a.id));
        const opts = candidates.length
          ? candidates.map((a) => `<option value="${a.id}">${esc(a.name)}（${a.id}）</option>`).join('')
          : '<option value="">暂无可邀请的本机账号</option>';
        const ctl = openModal({
          title: '邀请伙伴（按名字选择）',
          submitText: '邀请',
          bodyHTML: `<label>选择伙伴姓名</label><select data-f="acc">${opts}</select>`,
          onSubmit: async () => {
            const accId = ctl.body.querySelector('[data-f="acc"]').value;
            if (!accId) { window.alert('请选择要邀请的伙伴'); return true; }
            const acc = candidates.find((a) => a.id === accId);
            try { await Group.invite(repo, v.groupId, state.currentAccountId, { accountId: accId, name: acc ? acc.name : '' }); }
            catch (e) { window.alert(e.message); return true; }
            await refresh();
            return false;
          },
        });
      };

      const dg = pane.querySelector('[data-act="delGroup"]');
      if (dg) dg.onclick = () => {
        openConfirm({
          title: '删除小组', confirmText: '删除',
          message: '删除小组将清除其全部项目、任务与日志，确定？',
          onConfirm: async () => {
            try { await Group.deleteGroup(repo, v.groupId, state.currentAccountId); v.groupId = null; refresh(); } catch (e) { alert(e.message); }
          },
        });
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

    el.querySelector('[data-act="newGroup"]').onclick = () => {
      openPrompt({
        title: '新建小组', label: '小组名称', submitText: '创建',
        onSubmit: async (name) => {
          if (!String(name || '').trim()) return true;
          try { const g = await Group.create(repo, name, state.currentAccountId); v.groupId = g.id; state.set({ currentGroupId: g.id }); refresh(); }
          catch (e) { alert(e.message); return true; }
          return false;
        },
      });
    };
    el.querySelector('[data-act="joinGroup"]').onclick = () => {
      openPrompt({
        title: '加入小组', label: '粘贴 10 位数字加入码，或直接输入小组ID：', submitText: '申请加入',
        onSubmit: async (input) => {
          let gid = parseJoinCode(input);
          if (gid) {
            const g = await findGroupByJoinCode(repo, gid);
            if (!g) { alert('加入码无效或已失效'); return true; }
            gid = g.id;
          } else {
            gid = String(input || '').trim();
          }
          try { await Group.requestJoin(repo, gid, { accountId: state.currentAccountId }); alert('申请已提交，等待组长/副组长审核'); }
          catch (e) { alert(e.message); return true; }
          return false;
        },
      });
    };

    refresh();
  },
};