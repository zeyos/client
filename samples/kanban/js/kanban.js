/**
 * Kanban board — column rendering + HTML5 drag-and-drop.
 * Dispatches custom events for ticket interactions; all API calls are handled
 * in main.js to keep this module free of async side-effects.
 */
import { STATUS_MAP, PRIORITY_MAP } from './constants.js';
import { runtime } from './state.js';

// ── Custom Events ──────────────────────────────────────────────────────────
// 'ticket:open'   — detail({ ticketId })
// 'ticket:move'   — detail({ ticketId, toStatus })
// 'ticket:create' — detail({ status })  (quick-create in a column)

// ── Public API ─────────────────────────────────────────────────────────────

/** Render (or re-render) the entire board into #kanban-board. */
export function renderBoard() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const { settings, tickets } = runtime;

  if (settings.columns.length === 0) {
    board.innerHTML = '';
    document.getElementById('no-columns-banner')?.classList.remove('hidden');
    return;
  }

  document.getElementById('no-columns-banner')?.classList.add('hidden');
  board.innerHTML = '';

  for (const statusValue of settings.columns) {
    const status  = STATUS_MAP[statusValue];
    if (!status) continue;
    const colTickets = tickets.filter(t => t.status === statusValue);
    board.appendChild(_buildColumn(status, colTickets));
  }
}

/** Update a single column in-place (faster than full re-render). */
export function updateColumn(statusValue) {
  const col = document.querySelector(`[data-column="${statusValue}"]`);
  if (!col) { renderBoard(); return; }

  const status     = STATUS_MAP[statusValue];
  const colTickets = runtime.tickets.filter(t => t.status === statusValue);

  const badge = col.querySelector('.col-badge');
  if (badge) badge.textContent = colTickets.length;

  const list = col.querySelector('.col-cards');
  if (list) {
    list.innerHTML = '';
    for (const ticket of colTickets) list.appendChild(_buildCard(ticket));
  }
}

// ── Column Builder ─────────────────────────────────────────────────────────

function _buildColumn(status, tickets) {
  const col = document.createElement('div');
  col.className = 'kanban-col flex flex-col rounded-xl shadow-sm overflow-hidden';
  col.style.cssText = 'min-width:280px; width:280px; max-height:100%;';
  col.dataset.column = status.value;

  const header = document.createElement('div');
  header.className = 'col-header flex items-center justify-between px-3 py-2.5 flex-shrink-0';
  header.style.cssText = `background:${status.headerBg}; border-bottom:2px solid ${status.cardBorder};`;
  header.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="font-semibold text-sm" style="color:${status.headerText}">${status.label}</span>
      <span class="col-badge text-xs font-medium px-1.5 py-0.5 rounded-full bg-white/60" style="color:${status.headerText}">${tickets.length}</span>
    </div>
    <button class="col-add-btn text-lg leading-none opacity-50 hover:opacity-100 transition-opacity" style="color:${status.headerText}" title="Add ticket" data-status="${status.value}">+</button>
  `;
  col.appendChild(header);

  const body = document.createElement('div');
  body.className = 'col-cards flex-1 overflow-y-auto p-2 space-y-2 bg-white/50';
  body.style.cssText = 'min-height:80px; background:#f8fafc;';
  body.dataset.dropzone = status.value;

  for (const ticket of tickets) body.appendChild(_buildCard(ticket));

  body.addEventListener('dragover', _onDragOver);
  body.addEventListener('dragenter', _onDragEnter);
  body.addEventListener('dragleave', _onDragLeave);
  body.addEventListener('drop', _onDrop);

  col.appendChild(body);

  header.querySelector('.col-add-btn').addEventListener('click', () => {
    col.dispatchEvent(new CustomEvent('ticket:create', {
      bubbles: true, detail: { status: status.value },
    }));
  });

  return col;
}

// ── Card Builder ───────────────────────────────────────────────────────────

function _buildCard(ticket) {
  const priority = PRIORITY_MAP[ticket.priority ?? 2];
  const status   = STATUS_MAP[ticket.status ?? 0];

  const card = document.createElement('div');
  card.className =
    'kanban-card bg-white rounded-lg p-3 shadow-sm cursor-pointer ' +
    'hover:shadow-md transition-all select-none group relative';
  card.style.cssText = `border-left: 3px solid ${status?.cardBorder ?? '#94a3b8'};`;
  card.draggable = true;
  card.dataset.ticketId = ticket.ID;

  const meta = document.createElement('div');
  meta.className = 'flex items-center justify-between mb-1';
  meta.innerHTML = `
    <span class="text-xs text-slate-400 font-mono">${ticket.ticketnum ?? `#${ticket.ID}`}</span>
    <span class="text-xs font-semibold" style="color:${priority.color}" title="${priority.label}">${priority.symbol}</span>
  `;
  card.appendChild(meta);

  const name = document.createElement('p');
  name.className = 'text-sm font-medium text-slate-800 leading-snug line-clamp-2 mb-1.5';
  name.textContent = ticket.name ?? '(untitled)';
  card.appendChild(name);

  if (ticket.duedate) {
    const due = document.createElement('div');
    due.className = 'flex items-center gap-1 text-xs mb-1';
    const isOverdue = ticket.duedate * 1000 < Date.now();
    due.innerHTML = `
      <span class="${isOverdue ? 'text-red-500' : 'text-slate-400'}">📅</span>
      <span class="${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}">${_formatDate(ticket.duedate)}</span>
    `;
    card.appendChild(due);
  }

  const actions = document.createElement('div');
  actions.className =
    'absolute top-1.5 right-1.5 hidden group-hover:flex gap-1';
  actions.innerHTML = `
    <button class="card-btn-edit p-1 rounded bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 text-xs" title="Edit">✎</button>
    <button class="card-btn-delete p-1 rounded bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 text-xs" title="Delete">✕</button>
  `;
  card.appendChild(actions);

  card.addEventListener('dragstart', _onDragStart);
  card.addEventListener('dragend',   _onDragEnd);
  // Allow dropping ONTO a card (not just onto the column background). Without
  // this some browsers require e.preventDefault() at the target element level
  // and won't allow a drop when the cursor is over a child card.
  card.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });

  card.addEventListener('click', e => {
    if (e.target.closest('.card-btn-edit') || e.target.closest('.card-btn-delete')) return;
    card.dispatchEvent(new CustomEvent('ticket:open', {
      bubbles: true, detail: { ticketId: ticket.ID, mode: 'view' },
    }));
  });

  actions.querySelector('.card-btn-edit').addEventListener('click', e => {
    e.stopPropagation();
    card.dispatchEvent(new CustomEvent('ticket:open', {
      bubbles: true, detail: { ticketId: ticket.ID, mode: 'edit' },
    }));
  });

  actions.querySelector('.card-btn-delete').addEventListener('click', e => {
    e.stopPropagation();
    card.dispatchEvent(new CustomEvent('ticket:delete', {
      bubbles: true, detail: { ticketId: ticket.ID },
    }));
  });

  return card;
}

// ── Drag & Drop ────────────────────────────────────────────────────────────

let _dragTicketId = null;
let _dragSourceStatus = null;

function _onDragStart(e) {
  const card = e.currentTarget;
  _dragTicketId    = Number(card.dataset.ticketId);
  _dragSourceStatus = Number(card.closest('[data-column]')?.dataset.column);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(_dragTicketId));
  // slight delay so the ghost image renders before we fade the card
  requestAnimationFrame(() => card.style.opacity = '0.4');
}

function _onDragEnd(e) {
  e.currentTarget.style.opacity = '';
  _dragTicketId    = null;
  _dragSourceStatus = null;
  document.querySelectorAll('.col-cards').forEach(z => z.classList.remove('drop-active'));
}

function _onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function _onDragEnter(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drop-active');
}

function _onDragLeave(e) {
  // Only remove when leaving the dropzone itself, not a child element
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drop-active');
  }
}

function _onDrop(e) {
  e.preventDefault();
  const zone     = e.currentTarget;
  const toStatus = Number(zone.dataset.dropzone);
  zone.classList.remove('drop-active');

  // dataTransfer is the authoritative source — it's set in dragstart and
  // stays available through the drop event regardless of dragend timing.
  const raw      = e.dataTransfer.getData('text/plain');
  const ticketId = raw ? Number(raw) : _dragTicketId;
  if (!ticketId) return;

  // Read source status from the module variable; NaN means same-column check
  // is skipped (safe to always dispatch and let main.js do the guard).
  const srcStatus = Number.isFinite(_dragSourceStatus) ? _dragSourceStatus : toStatus + 1;
  if (toStatus === srcStatus) return;

  zone.dispatchEvent(new CustomEvent('ticket:move', {
    bubbles: true, detail: { ticketId, toStatus },
  }));
}

// ── Utilities ──────────────────────────────────────────────────────────────

function _formatDate(unix) {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
