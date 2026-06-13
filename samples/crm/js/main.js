/**
 * CRM Account List -- Application entry point.
 *
 * Bootstraps the client, handles auth, wires up all UI events,
 * and orchestrates data loading / table rendering.
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
  fetchAccounts, getAccount, createAccount, updateAccount, deleteAccount,
} from './api.js';
import { isAuthenticated, trySessionAuth, logout } from './auth.js';
import { runtime, resolveConfig, saveUrl, saveTokens, clearTokens, clearUrl } from './state.js';
import { showToast, showLoading, hideLoading } from './ui.js';

// ── Account Type Labels & Colors ────────────────────────────────────────────
// 0 = Prospect, 1 = Customer, 2 = Supplier, 3 = Cust. & Suppl., 4 = Competitor, 5 = Employee

const ACCOUNT_TYPES = {
  0: { label: 'Prospect',       bg: 'bg-amber-100',   text: 'text-amber-700'   },
  1: { label: 'Customer',       bg: 'bg-emerald-100', text: 'text-emerald-700' },
  2: { label: 'Supplier',       bg: 'bg-purple-100',  text: 'text-purple-700'  },
  3: { label: 'Cust. & Suppl.', bg: 'bg-blue-100',    text: 'text-blue-700'    },
  4: { label: 'Competitor',     bg: 'bg-red-100',     text: 'text-red-700'     },
  5: { label: 'Employee',       bg: 'bg-slate-100',   text: 'text-slate-700'   },
};

// ── Debounce helper ─────────────────────────────────────────────────────────

let _searchTimer = null;
function debounce(fn, ms = 350) {
  return (...args) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => fn(...args), ms);
  };
}

// ── HTML escaping ───────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Format Unix timestamp (seconds) to locale date ──────────────────────────

function formatDate(ts) {
  if (!ts) return '\u2014';
  // ZeyOS timestamps are in SECONDS (not ms)
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

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

// ── Connection Screen ────────────────────────────────────────────────────────

function _showConnectionScreen(message) {
  document.getElementById('connection-screen')?.classList.remove('hidden');
  document.getElementById('app-shell')?.classList.add('hidden');

  const msgEl = document.getElementById('connection-message');
  if (msgEl) msgEl.textContent = message;
}

// ── Main App Boot ────────────────────────────────────────────────────────────

async function _bootApp() {
  document.getElementById('connection-screen')?.classList.add('hidden');
  document.getElementById('app-shell')?.classList.remove('hidden');

  _wireEvents();

  showLoading();
  try {
    await _loadAccounts();
    _renderTable();
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

// ── Data Loading ─────────────────────────────────────────────────────────────

async function _loadAccounts() {
  const offset = (runtime.page - 1) * runtime.pageSize;

  const records = await fetchAccounts({
    search:    runtime.search || undefined,
    sortField: runtime.sort.field,
    sortDir:   runtime.sort.dir,
    limit:     runtime.pageSize + 1,
    offset,
  });

  runtime.hasNextPage = records.length > runtime.pageSize;
  runtime.accounts = records.slice(0, runtime.pageSize);
}

async function _refresh() {
  showLoading();
  try {
    await _loadAccounts();
    _renderTable();
  } catch (err) {
    showToast(`Refresh failed: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ── Table Rendering ──────────────────────────────────────────────────────────

function _renderTable() {
  const tbody     = document.getElementById('accounts-tbody');
  const empty     = document.getElementById('empty-state');
  const pagBar    = document.getElementById('pagination-bar');
  const accounts  = runtime.accounts;

  if (!tbody) return;

  // Toggle empty state
  if (accounts.length === 0) {
    tbody.innerHTML = '';
    empty?.classList.remove('hidden');
  } else {
    empty?.classList.add('hidden');
    tbody.innerHTML = accounts.map(a => _accountRow(a)).join('');
  }

  // Update sort indicators on column headers
  _updateSortIndicators();

  // Update pagination controls
  _updatePagination();
}

function _accountRow(a) {
  const typeInfo = ACCOUNT_TYPES[a.Type] ?? { label: 'Unknown', bg: 'bg-slate-100', text: 'text-slate-600' };
  const name     = [a.FirstName, a.Name].filter(Boolean).join(' ') || '\u2014';

  return `
    <tr data-id="${esc(a.Id)}" class="transition-colors">
      <td class="px-4 py-3 text-slate-500 font-mono text-xs">${esc(a.AccountNum) || '\u2014'}</td>
      <td class="px-4 py-3 font-medium text-slate-800">${esc(name)}</td>
      <td class="px-4 py-3 text-slate-600">${esc(a.Email) || '\u2014'}</td>
      <td class="px-4 py-3 text-slate-600">${esc(a.Phone) || '\u2014'}</td>
      <td class="px-4 py-3 text-slate-600">${esc(a.City) || '\u2014'}</td>
      <td class="px-4 py-3 text-slate-600">${esc(a.AssignedUser) || '\u2014'}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.bg} ${typeInfo.text}">
          ${typeInfo.label}
        </span>
      </td>
      <td class="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">${formatDate(a.LastModified)}</td>
    </tr>
  `;
}

// ── Sort Indicators ──────────────────────────────────────────────────────────

function _updateSortIndicators() {
  document.querySelectorAll('.sortable-col').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc', 'text-blue-600');
    if (th.dataset.sort === runtime.sort.field) {
      th.classList.add(runtime.sort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      th.classList.add('text-blue-600');
    }
  });
}

// ── Pagination ───────────────────────────────────────────────────────────────

function _updatePagination() {
  const count    = runtime.accounts.length;
  const offset   = (runtime.page - 1) * runtime.pageSize;
  const infoEl   = document.getElementById('pagination-info');
  const pageEl   = document.getElementById('page-indicator');
  const prevBtn  = document.getElementById('btn-prev-page');
  const nextBtn  = document.getElementById('btn-next-page');

  if (infoEl) {
    if (count === 0) {
      infoEl.textContent = 'No accounts found';
    } else {
      infoEl.textContent = `Showing ${offset + 1}\u2013${offset + count} accounts`;
    }
  }

  if (pageEl) {
    pageEl.textContent = `Page ${runtime.page}`;
  }

  // Previous is disabled on page 1
  if (prevBtn) prevBtn.disabled = (runtime.page <= 1);

  if (nextBtn) nextBtn.disabled = !runtime.hasNextPage;
}

// ── Event Wiring ─────────────────────────────────────────────────────────────

function _wireEvents() {
  // -- Search input (debounced) --
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async () => {
      runtime.search = searchInput.value;
      runtime.page   = 1; // Reset to first page on new search
      await _refresh();
    }));
  }

  // -- Sortable column headers --
  document.querySelectorAll('.sortable-col').forEach(th => {
    th.addEventListener('click', async () => {
      const field = th.dataset.sort;
      if (!field) return;

      // Toggle direction if same column, otherwise default to ascending
      if (runtime.sort.field === field) {
        runtime.sort.dir = runtime.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        runtime.sort.field = field;
        runtime.sort.dir   = 'asc';
      }

      runtime.page = 1; // Reset to first page on sort change
      await _refresh();
    });
  });

  // -- Pagination --
  document.getElementById('btn-prev-page')?.addEventListener('click', async () => {
    if (runtime.page > 1) {
      runtime.page--;
      await _refresh();
    }
  });

  document.getElementById('btn-next-page')?.addEventListener('click', async () => {
    if (runtime.hasNextPage) {
      runtime.page++;
      await _refresh();
    }
  });

  // -- Reload button --
  document.getElementById('btn-reload')?.addEventListener('click', async () => {
    await _refresh();
  });

  // -- New Account button --
  document.getElementById('btn-new-account')?.addEventListener('click', () => {
    _openModal('create');
  });

  // -- Table row click -> open edit modal --
  document.getElementById('accounts-tbody')?.addEventListener('click', e => {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (id) _openModal('edit', id);
  });

  // -- Logout --
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (!confirm('Log out of ZeyOS CRM?')) return;
    await logout();
    clearUrl();
    location.reload();
  });

  // -- Modal controls --
  document.getElementById('modal-close')?.addEventListener('click', _closeModal);
  document.getElementById('btn-cancel')?.addEventListener('click', _closeModal);
  document.getElementById('account-form')?.addEventListener('submit', _handleFormSubmit);
  document.getElementById('btn-delete-account')?.addEventListener('click', _handleDelete);

  // Close modal on backdrop click
  const dialog = document.getElementById('account-modal');
  dialog?.addEventListener('click', e => {
    if (e.target === dialog) _closeModal();
  });
}

// ── Modal Logic ──────────────────────────────────────────────────────────────

/**
 * Open the account modal in 'create' or 'edit' mode.
 * @param {'create'|'edit'} mode
 * @param {string|number}   [id] - Account ID for edit mode
 */
async function _openModal(mode, id) {
  const dialog         = document.getElementById('account-modal');
  const title          = document.getElementById('modal-title');
  const formId         = document.getElementById('form-id');
  const firstname      = document.getElementById('form-firstname');
  const lastname       = document.getElementById('form-lastname');
  const type           = document.getElementById('form-type');
  const description    = document.getElementById('form-description');
  const contactSection = document.getElementById('contact-section');
  const deleteBtn      = document.getElementById('btn-delete-account');
  const contactEmail   = document.getElementById('contact-email');
  const contactPhone   = document.getElementById('contact-phone');
  const contactCity    = document.getElementById('contact-city');

  if (!dialog) return;

  if (mode === 'create') {
    // -- Create mode: empty form, hide contact info & delete --
    title.textContent = 'New Account';
    formId.value      = '';
    firstname.value   = '';
    lastname.value    = '';
    type.value        = '0';
    description.value = '';

    contactSection?.classList.add('hidden');
    deleteBtn?.classList.add('hidden');

    dialog.showModal();
  } else {
    // -- Edit mode: load account data, show contact info & delete --
    title.textContent = 'Edit Account';
    deleteBtn?.classList.remove('hidden');
    contactSection?.classList.remove('hidden');

    showLoading();
    try {
      const account = await getAccount(id);

      formId.value      = account.ID ?? id;
      firstname.value   = account.firstname ?? '';
      lastname.value    = account.lastname ?? '';
      type.value        = String(account.type ?? 0);
      description.value = account.description ?? '';

      // Also look up the row in runtime.accounts for the joined contact fields
      const row = runtime.accounts.find(a => String(a.Id) === String(id));

      if (contactEmail) contactEmail.textContent = row?.Email   || account.email   || '\u2014';
      if (contactPhone) contactPhone.textContent = row?.Phone   || account.phone   || '\u2014';
      if (contactCity)  contactCity.textContent   = row?.City    || account.city    || '\u2014';

      dialog.showModal();
    } catch (err) {
      showToast(`Failed to load account: ${err.message}`, 'error');
    } finally {
      hideLoading();
    }
  }
}

function _closeModal() {
  document.getElementById('account-modal')?.close();
}

/**
 * Handle form submission -- create or update depending on form-id value.
 */
async function _handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('form-id')?.value;
  const data = {
    firstname:   document.getElementById('form-firstname')?.value?.trim() || null,
    lastname:    document.getElementById('form-lastname')?.value?.trim()  || '',
    type:        Number(document.getElementById('form-type')?.value ?? 0),
    description: document.getElementById('form-description')?.value?.trim() || null,
  };

  if (!data.lastname) {
    showToast('Last name / company is required.', 'error');
    return;
  }

  showLoading();
  try {
    if (id) {
      // Update existing account
      await updateAccount(id, data);
      showToast('Account updated.', 'success');
    } else {
      // Create new account
      await createAccount(data);
      showToast('Account created.', 'success');
    }

    _closeModal();
    await _refresh();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Handle the delete button inside the edit modal.
 */
async function _handleDelete() {
  const id = document.getElementById('form-id')?.value;
  if (!id) return;

  const name = document.getElementById('form-lastname')?.value || 'this account';
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  showLoading();
  try {
    await deleteAccount(id);
    showToast('Account deleted.', 'success');
    _closeModal();
    await _refresh();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ── Console API ──────────────────────────────────────────────────────────────
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
      `  Page:           ${runtime.page}`,
      `  Page Size:      ${runtime.pageSize}`,
      `  Search:         ${runtime.search || '(none)'}`,
      `  Sort:           ${runtime.sort.field} ${runtime.sort.dir}`,
      `  Loaded:         ${runtime.accounts.length} accounts`,
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
