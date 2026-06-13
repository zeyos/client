/**
 * ZeyOS API client singleton + high-level helper functions for the CRM sample.
 * Supports two initialization modes:
 *  - Token mode:   uses pre-obtained browser tokens via MemoryTokenStore
 *  - Session mode: uses browser session cookies
 *
 * Demonstrates:
 *  - Dot-notation joins (contact.email, contact.phone, contact.city, assigneduser.name)
 *  - Field aliasing via object-form fields
 *  - Full-text search via the `query` parameter
 *  - Pagination via limit/offset
 *  - Sorting via the sort parameter
 *
 * IMPORTANT implementation notes (from project memory):
 *  - Use `filters` (plural) NOT `filter` for list queries
 *  - Always include `visibility: 0` in filters
 *  - Normalise list responses: Array.isArray(result) ? result : (result?.data ?? [])
 */
import { createZeyosClient, MemoryTokenStore } from '../../../src/index.js';
import { loadTokens, saveTokens } from './state.js';

export let client = null;
export let tokenStore = null;

// ── Client Initialization ──────────────────────────────────────────────────

/**
 * Initialize client in token/OAuth mode.
 * Uses pre-obtained tokens from localStorage / body attributes.
 */
export function initTokenClient(url) {
  const stored = loadTokens();
  tokenStore = new MemoryTokenStore(stored ?? undefined);

  client = createZeyosClient({
    platform: url,
    auth: {
      mode: 'oauth',
      oauth: {
        tokenStore,
      },
    },
  });
  return client;
}

/**
 * Initialize client in session mode.
 * Uses browser cookies via credentials:'include'.
 * Works when the user is already logged into ZeyOS in the same browser.
 */
export function initSessionClient(url) {
  tokenStore = null;

  client = createZeyosClient({
    platform: url,
    auth: {
      mode: 'session',
      session: {
        enabled: true,
        credentials: 'include',
      },
    },
  });
  return client;
}

/**
 * Persist the current token set back to localStorage (no-op in session mode).
 * Called after API requests to keep stored token state aligned.
 */
export async function syncTokens() {
  if (!tokenStore) return; // session mode -- no tokens to sync
  try {
    const ts = await client.auth.getTokenSet();
    if (ts?.accessToken) {
      saveTokens({
        accessToken:           ts.accessToken,
        refreshToken:          ts.refreshToken,
        expiresAt:             ts.expiresAt,
        refreshTokenExpiresAt: ts.refreshTokenExpiresAt,
      });
    }
  } catch {
    // non-critical
  }
}

// ── Field-to-sort mapping ──────────────────────────────────────────────────
// Maps the aliased field names used in the UI to the raw API field paths
// needed by the `sort` parameter.

const SORT_MAP = {
  AccountNum:   'customernum',
  Name:         'lastname',
  Email:        'contact.email',
  Phone:        'contact.phone',
  City:         'contact.city',
  AssignedUser: 'assigneduser.name',
  Type:         'type',
  LastModified: 'lastmodified',
};

// ── Accounts ───────────────────────────────────────────────────────────────

/**
 * Fetch a page of accounts with dot-notation joins and optional search.
 *
 * @param {Object}  opts
 * @param {string}  [opts.search]  - Full-text search query
 * @param {string}  [opts.sortField]  - Aliased field name (e.g. 'Name', 'Email')
 * @param {string}  [opts.sortDir]    - 'asc' or 'desc'
 * @param {number}  [opts.limit=25]   - Records per page
 * @param {number}  [opts.offset=0]   - Offset for pagination
 * @returns {Promise<Array>} Array of account records with joined fields
 */
export async function fetchAccounts({ search, sortField, sortDir, limit = 25, offset = 0 } = {}) {
  // Build the sort parameter.
  // Prefix with + (asc) or - (desc) followed by the raw API field path.
  const rawSort = SORT_MAP[sortField] ?? 'lastmodified';
  const prefix  = sortDir === 'asc' ? '+' : '-';
  const sort    = [`${prefix}${rawSort}`];

  // Build request parameters with aliased field names (object form).
  // This demonstrates the field aliasing feature: the keys become the
  // property names in the response, the values are the actual DB paths.
  const params = {
    fields: {
      Id:           'ID',
      AccountNum:   'customernum',
      Name:         'lastname',
      FirstName:    'firstname',
      Email:        'contact.email',
      Phone:        'contact.phone',
      City:         'contact.city',
      AssignedUser: 'assigneduser.name',
      Type:         'type',
      LastModified: 'lastmodified',
    },
    filters: { visibility: 0 },
    sort,
    limit,
    offset,
  };

  // Full-text search via the `query` parameter (server-side search)
  if (search && search.trim()) {
    params.query = search.trim();
  }

  const result = await client.api.listAccounts(params);
  await syncTokens();

  // Normalise: the API may return an array directly or { data: [...] }
  return Array.isArray(result) ? result : (result?.data ?? []);
}

/**
 * Fetch a single account by ID with extended data.
 * @param {number|string} id - Account ID
 */
export async function getAccount(id) {
  const result = await client.api.getAccount({ ID: id, extdata: 1 });
  await syncTokens();
  return result;
}

/**
 * Create a new account.
 * @param {Object} data - Account fields (lastname, firstname, type, description, etc.)
 */
export async function createAccount(data) {
  const result = await client.api.createAccount(data);
  await syncTokens();
  return result;
}

/**
 * Update an existing account.
 * @param {number|string} id   - Account ID
 * @param {Object}        data - Fields to update
 */
export async function updateAccount(id, data) {
  const result = await client.api.updateAccount({ ID: id, body: data });
  await syncTokens();
  return result;
}

/**
 * Delete an account by ID.
 * @param {number|string} id - Account ID
 */
export async function deleteAccount(id) {
  await client.api.deleteAccount({ ID: id });
  await syncTokens();
}
