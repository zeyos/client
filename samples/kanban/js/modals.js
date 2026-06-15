/**
 * Ticket detail popup + create/edit form modal.
 * Both use the native <dialog> element for proper focus-trap & backdrop.
 */
import { STATUSES, STATUS_MAP, PRIORITIES, PRIORITY_MAP } from './constants.js';
import { runtime } from './state.js';
import {
  getTicket, createTicket, updateTicket, deleteTicket,
  fetchTasksForTicket, createTask, deleteTask,
} from './api.js';
import { showToast } from './ui.js';

// ── Detail Modal ───────────────────────────────────────────────────────────

export async function openTicketDetail(ticketId, initialMode = 'view') {
  const dlg = document.getElementById('ticket-detail-modal');
  if (!dlg) return;

  dlg.innerHTML = '<div class="p-8 text-center text-slate-400">Loading…</div>';
  dlg.showModal();

  let ticket, tasks;
  try {
    [ticket, tasks] = await Promise.all([
      getTicket(ticketId),
      fetchTasksForTicket(ticketId),
    ]);
  } catch (err) {
    dlg.innerHTML = `<div class="p-8 text-red-500">Error: ${_esc(err.message)}</div>`;
    return;
  }

  if (initialMode === 'edit') {
    _renderEditForm(dlg, ticket, tasks, true);
  } else {
    _renderDetailView(dlg, ticket, tasks);
  }
}

function _renderDetailView(dlg, ticket, tasks) {
  const priority = PRIORITY_MAP[ticket.priority ?? 2];
  const status   = STATUS_MAP[ticket.status ?? 0];

  dlg.innerHTML = `
    <div class="flex flex-col max-h-[90vh] w-full">

      <div class="flex items-start justify-between p-5 border-b gap-3 flex-shrink-0">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-slate-400">${_esc(ticket.ticketnum ?? `#${ticket.ID}`)}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${status.headerBg};color:${status.headerText}">${_esc(status.label)}</span>
            <span class="text-xs font-semibold" style="color:${priority.color}">${priority.symbol} ${_esc(priority.label)}</span>
          </div>
          <h2 class="text-lg font-semibold text-slate-800 leading-snug">${_esc(ticket.name ?? '')}</h2>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button id="detail-btn-edit" class="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">Edit</button>
          <button id="detail-btn-close" class="px-3 py-1.5 text-sm rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>
      </div>

      <div class="overflow-y-auto flex-1 p-5 space-y-5">

        <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          ${_detailRow('Due Date',     ticket.duedate    ? _formatDate(ticket.duedate)       : '—')}
          ${_detailRow('Assigned',     ticket.assigneduser ?? '—')}
          ${_detailRow('Account',      ticket.account    ?? '—')}
          ${_detailRow('Project',      ticket.project    ?? '—')}
          ${_detailRow('Created',      ticket.creationdate ? _formatDate(ticket.creationdate) : '—')}
          ${_detailRow('Modified',     ticket.lastmodified ? _formatDate(ticket.lastmodified)  : '—')}
        </div>

        ${ticket.description ? `
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Description</h3>
            <p class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">${_esc(ticket.description)}</p>
          </div>
        ` : ''}

        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks (${tasks.length})</h3>
            <button id="detail-btn-add-task" class="text-xs font-medium text-blue-600 hover:underline">+ Add Task</button>
          </div>
          <div id="task-list">
            ${_taskTable(tasks, runtime.url)}
          </div>
        </div>

      </div>

      <div class="flex items-center justify-between p-4 border-t flex-shrink-0">
        <button id="detail-btn-delete" class="text-sm text-red-500 hover:text-red-700 hover:underline">Delete Ticket</button>
        <button id="detail-btn-close2" class="px-4 py-1.5 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Close</button>
      </div>
    </div>
  `;

  dlg.querySelector('#detail-btn-close').onclick  = () => dlg.close();
  dlg.querySelector('#detail-btn-close2').onclick = () => dlg.close();

  dlg.querySelector('#detail-btn-edit').onclick = () => {
    const t = runtime.tickets.find(x => x.ID === ticket.ID) ?? ticket;
    _renderEditForm(dlg, t, tasks, false);
  };

  dlg.querySelector('#detail-btn-delete').onclick = async () => {
    if (!confirm(`Delete "${ticket.name}"? This cannot be undone.`)) return;
    try {
      await deleteTicket(ticket.ID);
      dlg.close();
      document.dispatchEvent(new CustomEvent('app:reload'));
      showToast('Ticket deleted.', 'success');
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  // Task interactions — use event delegation on the task list to avoid
  // listener accumulation across re-renders of the detail view.
  const taskList = dlg.querySelector('#task-list');

  taskList.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('.task-delete');

    if (deleteBtn) {
      const taskId = Number(deleteBtn.dataset.taskId);
      try {
        await deleteTask(taskId);
        const t = runtime.tickets.find(x => x.ID === ticket.ID) ?? ticket;
        const refreshed = await fetchTasksForTicket(ticket.ID);
        _renderDetailView(dlg, t, refreshed);
      } catch (err) {
        showToast(`Could not delete task: ${err.message}`, 'error');
      }
    }
  });

  dlg.querySelector('#detail-btn-add-task').onclick = () => {
    _openAddTaskForm(dlg, ticket.ID);
  };

  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };
}

function _openAddTaskForm(dlg, ticketId) {
  const list = dlg.querySelector('#task-list');
  const form = document.createElement('div');
  form.className = 'mt-2 p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2';
  form.innerHTML = `
    <div class="flex gap-2">
      <input id="new-task-name" type="text" placeholder="Task name…"
        class="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      <input id="new-task-due" type="date"
        class="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
    </div>
    <div class="flex gap-2 justify-end">
      <button id="task-cancel" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-100">Cancel</button>
      <button id="task-save" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Add Task</button>
    </div>
  `;
  list.appendChild(form);

  const nameInput = form.querySelector('#new-task-name');
  nameInput.focus();

  form.querySelector('#task-cancel').onclick = () => form.remove();

  const save = async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const dueDateVal = form.querySelector('#new-task-due').value;
    const data = {
      name,
      ticket:     ticketId,
      status:     0,
      visibility: 0,
    };
    if (dueDateVal) data.duedate = Math.floor(new Date(dueDateVal).getTime() / 1000);

    try {
      await createTask(data);
      const t = runtime.tickets.find(x => x.ID === ticketId);
      const refreshed = await fetchTasksForTicket(ticketId);
      if (t) _renderDetailView(dlg, t, refreshed);
    } catch (err) {
      showToast(`Could not create task: ${err.message}`, 'error');
    }
  };

  let _saving = false;
  const guardedSave = async () => {
    if (_saving) return;
    _saving = true;
    await save();
    _saving = false;
  };

  form.querySelector('#task-save').onclick = guardedSave;
  nameInput.addEventListener('keydown', async e => { if (e.key === 'Enter') await guardedSave(); });
}

// ── Edit / Create Form Modal ───────────────────────────────────────────────

export function openCreateTicket(defaultStatus = 0) {
  const dlg = document.getElementById('ticket-form-modal');
  if (!dlg) return;
  _renderEditForm(dlg, { status: defaultStatus, priority: 2 }, [], false, true);
  dlg.showModal();
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };
}

function _renderEditForm(dlg, ticket, tasks, isInDetailDlg, isCreate = false) {
  const usedDlg = isInDetailDlg ? dlg : document.getElementById('ticket-form-modal');

  usedDlg.innerHTML = `
    <form id="ticket-form" class="flex flex-col max-h-[90vh] w-full" novalidate>

      <div class="flex items-center justify-between p-5 border-b flex-shrink-0">
        <h2 class="font-semibold text-slate-800">${isCreate ? 'New Ticket' : 'Edit Ticket'}</h2>
        <button type="button" id="form-btn-close" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none">✕</button>
      </div>

      <div class="overflow-y-auto flex-1 p-5 space-y-4">

        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Name <span class="text-red-400">*</span></label>
          <input id="f-name" type="text" value="${_esc(ticket.name ?? '')}"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select id="f-status" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${STATUSES.map(s => `<option value="${s.value}" ${s.value === ticket.status ? 'selected' : ''}>${_esc(s.label)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select id="f-priority" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${PRIORITIES.map(p => `<option value="${p.value}" ${p.value === ticket.priority ? 'selected' : ''}>${p.symbol} ${_esc(p.label)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
          <input id="f-duedate" type="date" value="${ticket.duedate ? _toDateInput(ticket.duedate) : ''}"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Description</label>
          <textarea id="f-description" rows="4"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y">${_esc(ticket.description ?? '')}</textarea>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-slate-600">Extended Data</label>
            <button type="button" id="extdata-add-row" class="text-xs text-blue-600 hover:underline">+ Add field</button>
          </div>
          <div id="extdata-rows" class="space-y-2">
            ${_buildExtdataRows(ticket.extdata)}
          </div>
        </div>

      </div>

      <div class="flex items-center justify-between p-4 border-t flex-shrink-0">
        ${isCreate ? '<span></span>' : `<button type="button" id="form-btn-delete" class="text-sm text-red-500 hover:underline">Delete</button>`}
        <div class="flex gap-3">
          <button type="button" id="form-btn-cancel" class="px-4 py-1.5 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Cancel</button>
          <button type="submit" id="form-btn-save" class="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            ${isCreate ? 'Create Ticket' : 'Save Changes'}
          </button>
        </div>
      </div>

    </form>
  `;

  const form = usedDlg.querySelector('#ticket-form');

  usedDlg.querySelector('#form-btn-close').onclick  = () => {
    if (isInDetailDlg) _renderDetailView(usedDlg, ticket, tasks);
    else usedDlg.close();
  };
  usedDlg.querySelector('#form-btn-cancel').onclick = () => {
    if (isInDetailDlg) _renderDetailView(usedDlg, ticket, tasks);
    else usedDlg.close();
  };

  if (!isCreate) {
    usedDlg.querySelector('#form-btn-delete')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${ticket.name}"? This cannot be undone.`)) return;
      try {
        await deleteTicket(ticket.ID);
        usedDlg.close();
        document.dispatchEvent(new CustomEvent('app:reload'));
        showToast('Ticket deleted.', 'success');
      } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
      }
    });
  }

  usedDlg.querySelector('#extdata-add-row').onclick = () => {
    const rows = usedDlg.querySelector('#extdata-rows');
    rows.insertAdjacentHTML('beforeend', _extdataEmptyRow());
    rows.lastElementChild.querySelector('input').focus();
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = usedDlg.querySelector('#f-name').value.trim();
    if (!name) { usedDlg.querySelector('#f-name').focus(); return; }

    const dueDateVal = usedDlg.querySelector('#f-duedate').value;
    const extdata    = _readExtdata(usedDlg);

    const data = {
      name,
      status:      Number(usedDlg.querySelector('#f-status').value),
      priority:    Number(usedDlg.querySelector('#f-priority').value),
      description: usedDlg.querySelector('#f-description').value,
      duedate:     dueDateVal ? Math.floor(new Date(dueDateVal).getTime() / 1000) : null,
      extdata,
      visibility:  0,
    };

    const saveBtn = usedDlg.querySelector('#form-btn-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      if (isCreate) {
        await createTicket(data);
        showToast('Ticket created!', 'success');
      } else {
        await updateTicket(ticket.ID, data);
        showToast('Ticket updated.', 'success');
      }
      usedDlg.close();
      document.dispatchEvent(new CustomEvent('app:reload'));
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = isCreate ? 'Create Ticket' : 'Save Changes';
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _detailRow(label, value) {
  return `
    <div>
      <dt class="text-xs text-slate-400 mb-0.5">${_esc(label)}</dt>
      <dd class="text-sm font-medium text-slate-700">${_esc(String(value))}</dd>
    </div>
  `;
}

/**
 * Render tasks as a table.
 * Link format: <baseUrl>?umi=tickets&page=details_ticket&id=<TASK_ID>&tab=0
 */
function _taskTable(tasks, baseUrl) {
  if (tasks.length === 0) {
    return '<p class="text-xs text-slate-400 italic">No tasks yet.</p>';
  }

  const base = (baseUrl ?? '').replace(/\/+$/, '');

  const rows = tasks.map(task => {
    const taskUrl  = `${base}?umi=tickets&page=details_ticket&id=${task.ID}&tab=0`;
    const taskNum  = _esc(task.tasknum ?? `#${task.ID}`);
    const nameLink = `<a href="${taskUrl}" target="_blank" rel="noopener"
        class="text-blue-600 hover:underline font-medium">${_esc(task.name ?? '(untitled)')}</a>`;
    const due      = task.duedate ? _formatDate(task.duedate) : '—';
    const assigned = _esc(task.assigneduser ?? '—');

    return `
      <tr class="border-t border-slate-100 group/row">
        <td class="py-1.5 pr-3 text-xs font-mono text-slate-400 whitespace-nowrap">${taskNum}</td>
        <td class="py-1.5 pr-3 text-sm">${nameLink}</td>
        <td class="py-1.5 pr-3 text-xs text-slate-500 whitespace-nowrap">${_esc(due)}</td>
        <td class="py-1.5 pr-3 text-xs text-slate-500 whitespace-nowrap">${assigned}</td>
        <td class="py-1.5 text-right">
          <button class="task-delete opacity-0 group-hover/row:opacity-100 transition-opacity text-slate-400 hover:text-red-500 text-xs px-1"
            data-task-id="${task.ID}" title="Delete task">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table class="w-full text-left">
      <thead>
        <tr class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          <th class="pb-1.5 pr-3 font-medium">Task #</th>
          <th class="pb-1.5 pr-3 font-medium">Name</th>
          <th class="pb-1.5 pr-3 font-medium">Due Date</th>
          <th class="pb-1.5 pr-3 font-medium">Assigned</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function _buildExtdataRows(extdata) {
  if (!extdata || typeof extdata !== 'object') return '';
  return Object.entries(extdata)
    .map(([k, v]) => `
      <div class="flex gap-2 extdata-row">
        <input type="text" placeholder="key" value="${_esc(k)}"
          class="extdata-key w-1/3 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
        <input type="text" placeholder="value" value="${_esc(String(v ?? ''))}"
          class="extdata-val flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
        <button type="button" class="extdata-rm px-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 text-xs">✕</button>
      </div>
    `).join('');
}

function _extdataEmptyRow() {
  return `
    <div class="flex gap-2 extdata-row">
      <input type="text" placeholder="key"
        class="extdata-key w-1/3 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
      <input type="text" placeholder="value"
        class="extdata-val flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
      <button type="button" class="extdata-rm px-2 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 text-xs">✕</button>
    </div>
  `;
}

function _readExtdata(container) {
  const result = {};
  container.querySelectorAll('.extdata-row').forEach(row => {
    const key = row.querySelector('.extdata-key')?.value.trim();
    const val = row.querySelector('.extdata-val')?.value ?? '';
    if (key) result[key] = val;
  });
  return Object.keys(result).length ? result : undefined;
}

// Delegate removal of extdata rows using event delegation on the modal
document.addEventListener('click', e => {
  if (e.target.classList.contains('extdata-rm')) {
    e.target.closest('.extdata-row')?.remove();
  }
});

function _formatDate(unix) {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function _toDateInput(unix) {
  const d = new Date(unix * 1000);
  return d.toISOString().split('T')[0];
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
