/**
 * Dashboard application entry point.
 * Bootstraps the client, handles auth, wires up all UI events,
 * and orchestrates data loading + rendering.
 *
 * Authentication: reads config from <body> data attributes + localStorage.
 *  1. If tokens are available -> token mode
 *  2. If URL only -> try session detection via /oauth2/v1/userinfo
 *  3. Otherwise -> connection screen with troubleshooting
 *
 * Exposes a global ZeyOS console API for debugging / configuration.
 */
import {
  initTokenClient, initSessionClient,
  countTickets, fetchRecentTickets, fetchTicketsByStatus,
  countAccounts, fetchRecentAccounts,
  STATUS_LABELS, STATUS_COLORS,
} from './api.js';
import { trySessionAuth, logout }                                from './auth.js';
import { runtime, resolveConfig, saveUrl, saveTokens, clearTokens, clearUrl } from './state.js';
import { showToast, showLoading, hideLoading }                   from './ui.js';

// -- Priority labels ----------------------------------------------------------

const PRIORITY_LABELS = {
  0: 'Lowest',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
};

const PRIORITY_CLASSES = {
  0: 'bg-slate-100 text-slate-600',
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-orange-100 text-orange-700',
  4: 'bg-red-100 text-red-700',
};

// -- Boot ---------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const config = resolveConfig();

  // 1. No URL configured -> show connection screen immediately
  if (!config.url) {
    _showConnectionScreen('No ZeyOS URL configured.');
    return;
  }

  runtime.url = config.url;

  // 2. Tokens available -> initialize in token mode
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

  // 3. No tokens -> try session detection
  showLoading();
  const userInfo = await trySessionAuth(config.url);
  hideLoading();

  if (userInfo) {
    initSessionClient(config.url);
    runtime.authMode = 'session';
    await _bootApp();
    return;
  }

  // 4. Nothing works -> connection screen
  _showConnectionScreen('Could not connect. Set a token or log into ZeyOS first.');
});

// -- Connection Screen --------------------------------------------------------

function _showConnectionScreen(message) {
  document.getElementById('connection-screen')?.classList.remove('hidden');
  document.getElementById('app-shell')?.classList.add('hidden');

  const msgEl = document.getElementById('connection-message');
  if (msgEl) msgEl.textContent = message;
}

// -- Main App Boot ------------------------------------------------------------

async function _bootApp() {
  document.getElementById('connection-screen')?.classList.add('hidden');
  document.getElementById('app-shell')?.classList.remove('hidden');

  _wireNavbar();

  await _loadDashboard();
}

// -- Data Loading & Rendering -------------------------------------------------

async function _loadDashboard() {
  showLoading();
  try {
    // Fire all queries in parallel for speed
    const [
      totalTickets,
      activeTickets,
      overdueTickets,
      totalAccounts,
      statusDistribution,
      recentTickets,
      recentAccounts,
    ] = await Promise.all([
      countTickets(),
      countTickets({ status: 4 }),
      _countOverdueTickets(),
      countAccounts(),
      fetchTicketsByStatus(),
      fetchRecentTickets(10),
      fetchRecentAccounts(10),
    ]);

    _renderKPIs(totalTickets, activeTickets, overdueTickets, totalAccounts);
    _renderStatusChart(statusDistribution);
    _renderRecentTickets(recentTickets);
    _renderRecentAccounts(recentAccounts);

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

/**
 * Count overdue tickets: duedate < now AND status < 8 (not cancelled/completed/failed/booked).
 */
async function _countOverdueTickets() {
  const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const promises = [];
  for (let status = 0; status < 8; status++) {
    promises.push(
      countTickets({ status, duedate: { '<': now } })
    );
  }
  const counts = await Promise.all(promises);
  return counts.reduce((sum, c) => sum + c, 0);
}

// -- KPI Cards ----------------------------------------------------------------

function _renderKPIs(totalTickets, activeTickets, overdueTickets, totalAccounts) {
  _setKpi('kpi-total-tickets', totalTickets);
  _setKpi('kpi-active-tickets', activeTickets);
  _setKpi('kpi-overdue-tickets', overdueTickets);
  _setKpi('kpi-total-accounts', totalAccounts);
}

function _setKpi(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = typeof value === 'number' ? value.toLocaleString() : value;
}

// -- Status Distribution Chart ------------------------------------------------

function _renderStatusChart(distribution) {
  const container = document.getElementById('status-chart');
  if (!container) return;

  const withCount = distribution.filter(d => d.count > 0);

  if (withCount.length === 0) {
    container.innerHTML = '<p class="text-sm text-slate-400 italic">No ticket data available.</p>';
    return;
  }

  const maxCount = Math.max(...withCount.map(d => d.count));

  const bars = withCount.map(d => {
    const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
    return `
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-600 w-36 text-right truncate flex-shrink-0">${_esc(d.label)}</span>
        <div class="flex-1 h-7 bg-slate-100 rounded-md overflow-hidden relative">
          <div class="h-full rounded-md transition-all duration-500"
               style="width:${pct}%; background:${d.color}; min-width:${d.count > 0 ? '2px' : '0'}"></div>
        </div>
        <span class="text-sm font-semibold text-slate-700 w-10 text-right flex-shrink-0">${d.count}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = bars;
}

// -- Recent Tickets Table -----------------------------------------------------

function _renderRecentTickets(tickets) {
  const tbody = document.getElementById('recent-tickets-body');
  if (!tbody) return;

  if (tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-400 italic">No tickets found.</td></tr>';
    return;
  }

  tbody.innerHTML = tickets.map(t => {
    const statusNum = Number(t.status ?? 0);
    const statusLabel = STATUS_LABELS[statusNum] ?? `Status ${statusNum}`;
    const statusColor = STATUS_COLORS[statusNum] ?? '#94a3b8';

    const priorityNum = Number(t.priority ?? 1);
    const priorityLabel = PRIORITY_LABELS[priorityNum] ?? 'Normal';
    const priorityClass = PRIORITY_CLASSES[priorityNum] ?? PRIORITY_CLASSES[1];

    const duedate = t.duedate ? _formatDate(t.duedate) : '--';
    const isOverdue = t.duedate && t.duedate < Math.floor(Date.now() / 1000) && statusNum < 8;

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
        <td class="px-4 py-2.5 text-xs text-slate-400 font-mono">${_esc(t.ticketnum ?? t.ID)}</td>
        <td class="px-4 py-2.5 text-sm text-slate-800 font-medium max-w-xs truncate">${_esc(t.name ?? '')}</td>
        <td class="px-4 py-2.5">
          <span class="inline-flex items-center gap-1.5 text-xs font-medium">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${statusColor}"></span>
            ${_esc(statusLabel)}
          </span>
        </td>
        <td class="px-4 py-2.5">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium ${priorityClass}">${_esc(priorityLabel)}</span>
        </td>
        <td class="px-4 py-2.5 text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}">${duedate}</td>
      </tr>
    `;
  }).join('');
}

// -- Recent Accounts Table ----------------------------------------------------

function _renderRecentAccounts(accounts) {
  const tbody = document.getElementById('recent-accounts-body');
  if (!tbody) return;

  if (accounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-slate-400 italic">No accounts found.</td></tr>';
    return;
  }

  const typeLabels = {
    0: 'Prospect',
    1: 'Customer',
    2: 'Supplier',
    3: 'Cust. & Suppl.',
    4: 'Competitor',
    5: 'Employee',
  };

  tbody.innerHTML = accounts.map(a => {
    const typeNum = Number(a.type ?? 0);
    const typeLabel = typeLabels[typeNum] ?? `Type ${typeNum}`;
    const name = [a.firstname, a.lastname].filter(Boolean).join(' ') || '--';
    const city = a['contact.city'] ?? '--';
    const email = a['contact.email'] ?? '--';
    const assignee = a['assigneduser.name'] ?? '--';

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
        <td class="px-4 py-2.5 text-xs text-slate-400 font-mono">${_esc(a.ID)}</td>
        <td class="px-4 py-2.5 text-sm text-slate-800 font-medium max-w-xs truncate">${_esc(name)}</td>
        <td class="px-4 py-2.5 text-xs text-slate-600">${_esc(typeLabel)}</td>
        <td class="px-4 py-2.5 text-xs text-slate-500">${_esc(city)}</td>
        <td class="px-4 py-2.5 text-xs text-slate-500 truncate max-w-[180px]">${_esc(assignee)}</td>
      </tr>
    `;
  }).join('');
}

// -- Navbar Wiring ------------------------------------------------------------

function _wireNavbar() {
  document.getElementById('btn-reload')?.addEventListener('click', () => _loadDashboard());

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (!confirm('Log out of ZeyOS Dashboard?')) return;
    await logout();
    clearUrl();
    location.reload();
  });
}

// -- Helpers ------------------------------------------------------------------

function _formatDate(unixSeconds) {
  if (!unixSeconds) return '--';
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -- Console API --------------------------------------------------------------

globalThis.ZeyOS = {
  /**
   * Set the ZeyOS instance URL.
   * @param {string} url
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
