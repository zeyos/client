/**
 * Application entry point.
 * Bootstraps the client, handles auth, wires up all UI events,
 * and orchestrates data loading / board re-renders.
 *
 * Authentication: reads config from <body> data attributes + localStorage.
 *  1. If tokens are available → token mode
 *  2. If URL only → try session detection via /oauth2/v1/userinfo
 *  3. Otherwise → connection screen with troubleshooting
 *
 * Exposes a global ZeyOS console API for debugging / configuration.
 */
import { initTokenClient, initSessionClient, fetchTickets, fetchProjects, updateTicket, deleteTicket } from './api.js';
import { trySessionAuth, logout } from './auth.js';
import { runtime, resolveConfig, saveUrl, saveTokens, clearTokens, clearUrl, saveContext } from './state.js';
import { renderBoard, updateColumn }               from './kanban.js';
import { openTicketDetail, openCreateTicket }      from './modals.js';
import { openSettings, closeSettings, onSettingsChange } from './settings.js';
import { showToast, showLoading, hideLoading }     from './ui.js';

// ── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const config = resolveConfig();

  // 1. No URL configured → show connection screen immediately
  if (!config.url) {
    _showConnectionScreen('No ZeyOS URL configured.');
    return;
  }

  runtime.url = config.url;

  // 2. Tokens available → initialize in token mode
  if (config.accessToken) {
    saveTokens({
      accessToken:  config.accessToken,
      refreshToken: config.refreshToken ?? null,
    });
    initTokenClient(config.url);
    runtime.authMode = 'token';
    await _bootApp();
    return;
  }

  // 3. No tokens → try session detection
  showLoading();
  const userInfo = await trySessionAuth(config.url);
  hideLoading();

  if (userInfo) {
    initSessionClient(config.url);
    runtime.authMode = 'session';
    await _bootApp();
    return;
  }

  // 4. Nothing works → connection screen
  _showConnectionScreen('Could not connect. Set a token or log into ZeyOS first.');
});

// ── Connection Screen ────────────────────────────────────────────────────────

function _showConnectionScreen(message) {
  document.getElementById('connection-screen')?.classList.remove('hidden');
  document.getElementById('app-shell')?.classList.add('hidden');

  const msgEl = document.getElementById('connection-message');
  if (msgEl) msgEl.textContent = message;
}

// ── Main App Boot ───────────────────────────────────────────────────────────

async function _bootApp() {
  document.getElementById('connection-screen')?.classList.add('hidden');
  document.getElementById('app-shell')?.classList.remove('hidden');

  onSettingsChange(_refreshBoard);

  _wireNavbar();
  _wireBoard();

  showLoading();
  try {
    await _loadContextData();
    await _loadTickets();
    renderBoard();
  } catch (err) {
    if (err?.status === 401) {
      showToast('Session expired. Please log in again.', 'error');
      setTimeout(async () => { await logout(); location.reload(); }, 2000);
      return;
    }
    showToast(`Failed to load data: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ── Data Loading ────────────────────────────────────────────────────────────

async function _loadContextData() {
  runtime.projects = await fetchProjects();
  _renderContextDropdown();
  _updateContextLabel();
}

async function _loadTickets() {
  runtime.tickets = await fetchTickets({ context: runtime.context });
}

async function _refreshBoard() {
  showLoading();
  try {
    await _loadTickets();
    renderBoard();
  } catch (err) {
    showToast(`Refresh failed: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ── Navbar Wiring ───────────────────────────────────────────────────────────

function _wireNavbar() {
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-open-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings);
  document.getElementById('settings-overlay')?.addEventListener('click', closeSettings);

  document.getElementById('btn-new-ticket')?.addEventListener('click', () => {
    openCreateTicket(runtime.settings.columns[0] ?? 0);
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (!confirm('Log out of ZeyOS Kanban?')) return;
    await logout();
    clearUrl();
    location.reload();
  });

  // Context button toggle
  document.getElementById('btn-context')?.addEventListener('click', e => {
    e.stopPropagation();
    const drop = document.getElementById('context-dropdown');
    if (!drop) return;
    if (drop.classList.contains('hidden')) {
      const rect = e.currentTarget.getBoundingClientRect();
      drop.style.top  = `${rect.bottom + 4}px`;
      drop.style.left = `${rect.left}px`;
      drop.classList.remove('hidden');
    } else {
      drop.classList.add('hidden');
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#context-dropdown') && !e.target.closest('#btn-context')) {
      document.getElementById('context-dropdown')?.classList.add('hidden');
    }
  });
}

// ── Board Event Wiring ──────────────────────────────────────────────────────

function _wireBoard() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  // Ticket open
  board.addEventListener('ticket:open', async e => {
    const { ticketId, mode } = e.detail;
    await openTicketDetail(ticketId, mode);
  });

  // Drag-and-drop move
  board.addEventListener('ticket:move', async e => {
    const { ticketId, toStatus } = e.detail;
    const ticket = runtime.tickets.find(t => t.ID === ticketId);
    if (!ticket) return;

    const fromStatus = ticket.status;
    // Optimistic update
    ticket.status = toStatus;
    updateColumn(fromStatus);
    updateColumn(toStatus);

    try {
      const updated = await updateTicket(ticketId, { status: toStatus });

      // Use the server-confirmed status from the response body.
      // If the API rejected or clamped the value it will differ from toStatus.
      const confirmedStatus = updated?.status ?? toStatus;
      if (confirmedStatus !== toStatus) {
        ticket.status = confirmedStatus;
        updateColumn(toStatus);
        updateColumn(confirmedStatus);
        showToast(`Status set to ${confirmedStatus} (server override).`, 'info');
      } else {
        showToast('Status updated.', 'success');
      }
    } catch (err) {
      // Revert on failure
      ticket.status = fromStatus;
      updateColumn(fromStatus);
      updateColumn(toStatus);
      showToast(`Move failed: ${err.message}`, 'error');
    }
  });

  // Quick-create
  board.addEventListener('ticket:create', e => {
    openCreateTicket(e.detail.status);
  });

  // Delete from card hover button
  board.addEventListener('ticket:delete', async e => {
    const { ticketId } = e.detail;
    const ticket = runtime.tickets.find(t => t.ID === ticketId);
    if (!confirm(`Delete "${ticket?.name ?? ticketId}"?`)) return;
    try {
      await deleteTicket(ticketId);
      runtime.tickets = runtime.tickets.filter(t => t.ID !== ticketId);
      renderBoard();
      showToast('Ticket deleted.', 'success');
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  });

  // Reload after create/update/delete inside modals
  document.addEventListener('app:reload', _refreshBoard);
}

// ── Context Dropdown ────────────────────────────────────────────────────────

function _renderContextDropdown() {
  const drop = document.getElementById('context-dropdown');
  if (!drop) return;

  const allItem      = { type: 'all',     id: null, name: 'All Tickets' };
  const projectItems = runtime.projects.map(p => ({ type: 'project', id: p.ID, name: p.name }));

  const groupHtml = (title, list) =>
    list.length === 0 ? '' : `
      ${title ? `<li class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">${title}</li>` : ''}
      ${list.map(item => `
        <li>
          <button class="ctx-item w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700 flex items-center gap-2"
            data-type="${item.type}" data-id="${item.id ?? ''}" data-name="${_esc(item.name)}">
            <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.type === 'all' ? 'bg-slate-400' : 'bg-purple-400'}"></span>
            ${_esc(item.name)}
          </button>
        </li>
      `).join('')}
    `;

  drop.innerHTML = `<ul class="py-1">
    ${groupHtml('', [allItem])}
    ${groupHtml('Projects', projectItems)}
  </ul>`;

  drop.querySelectorAll('.ctx-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      drop.classList.add('hidden');
      const ctx = {
        type: btn.dataset.type,
        id:   btn.dataset.id ? Number(btn.dataset.id) : null,
        name: btn.dataset.name,
      };
      runtime.context = ctx;
      saveContext(ctx);
      _updateContextLabel();
      await _refreshBoard();
    });
  });
}

function _updateContextLabel() {
  const el = document.getElementById('context-label');
  if (el) el.textContent = runtime.context.name ?? 'All Tickets';
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Console API ─────────────────────────────────────────────────────────────
// Provides ZeyOS.setUrl(), ZeyOS.setToken(), ZeyOS.status(), etc.
// Values set via the console are persisted to localStorage and override
// <body> data attributes on next page load.

globalThis.ZeyOS = {
  /**
   * Set the ZeyOS instance URL.
   * @param {string} url - e.g. 'https://cloud.zeyos.com/demo/'
   */
  setUrl(url) {
    if (!url || typeof url !== 'string') {
      console.error('[ZeyOS] Usage: ZeyOS.setUrl("https://cloud.zeyos.com/demo/")');
      return;
    }
    saveUrl(url.trim());
    console.log(`%c[ZeyOS]%c URL set to: ${url}`, 'color:#2563eb;font-weight:bold', '');
    console.log('%c[ZeyOS]%c Call ZeyOS.reconnect() to apply.', 'color:#2563eb;font-weight:bold', '');
  },

  /**
   * Set access (and optionally refresh) token.
   * @param {string} accessToken
   * @param {string} [refreshToken]
   */
  setToken(accessToken, refreshToken) {
    if (!accessToken || typeof accessToken !== 'string') {
      console.error('[ZeyOS] Usage: ZeyOS.setToken("access-token", "optional-refresh-token")');
      return;
    }
    saveTokens({
      accessToken:  accessToken.trim(),
      refreshToken: refreshToken?.trim() ?? null,
    });
    console.log('%c[ZeyOS]%c Token saved.', 'color:#2563eb;font-weight:bold', '');
    console.log('%c[ZeyOS]%c Call ZeyOS.reconnect() to apply.', 'color:#2563eb;font-weight:bold', '');
  },

  /**
   * Print the current connection status to the console.
   */
  status() {
    const config = resolveConfig();
    const lines = [
      '',
      `  URL:            ${config.url ?? '(not set)'}`,
      `  Access Token:   ${config.accessToken ? config.accessToken.slice(0, 16) + '...' : '(not set)'}`,
      `  Refresh Token:  ${config.refreshToken ? 'yes' : 'no'}`,
      `  Auth Mode:      ${runtime.authMode ?? '(not connected)'}`,
      '',
    ];
    console.log(`%c[ZeyOS] Status%c\n${lines.join('\n')}`, 'color:#2563eb;font-weight:bold', 'color:inherit');
  },

  /**
   * Clear all stored config (URL + tokens) and reload.
   */
  logout() {
    clearTokens();
    clearUrl();
    console.log('%c[ZeyOS]%c Config cleared. Reloading...', 'color:#2563eb;font-weight:bold', '');
    location.reload();
  },

  /**
   * Reload the page to re-run the boot sequence with current config.
   */
  reconnect() {
    console.log('%c[ZeyOS]%c Reconnecting...', 'color:#2563eb;font-weight:bold', '');
    location.reload();
  },
};
