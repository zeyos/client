/**
 * ZeyOS API client singleton + dashboard-specific helper functions.
 * Supports two initialization modes:
 *  - Token mode: uses pre-obtained browser tokens via MemoryTokenStore
 *  - Session mode: uses browser session cookies
 */
import { createZeyosClient, MemoryTokenStore } from '../../../src/index.js';
import { loadTokens, saveTokens } from './state.js';

export let client = null;
export let tokenStore = null;

// -- Status labels & colors ---------------------------------------------------

export const STATUS_LABELS = [
  'Not Started',           // 0
  'Awaiting Acceptance',   // 1
  'Accepted',              // 2
  'Rejected',              // 3
  'Active',                // 4
  'Inactive',              // 5
  'Feedback Required',     // 6
  'Testing',               // 7
  'Cancelled',             // 8
  'Completed',             // 9
  'Failed',                // 10
  'Booked',                // 11
];

export const STATUS_COLORS = [
  '#94a3b8', // 0  Not Started
  '#f59e0b', // 1  Awaiting Acceptance
  '#22c55e', // 2  Accepted
  '#ef4444', // 3  Rejected
  '#3b82f6', // 4  Active
  '#9ca3af', // 5  Inactive
  '#f97316', // 6  Feedback Required
  '#a855f7', // 7  Testing
  '#fb7185', // 8  Cancelled
  '#10b981', // 9  Completed
  '#dc2626', // 10 Failed
  '#14b8a6', // 11 Booked
];

// -- Client Initialization ----------------------------------------------------

/**
 * Initialize client in token/OAuth mode.
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

/** Persist the current token set back to localStorage (no-op in session mode). */
export async function syncTokens() {
  if (!tokenStore) return;
  try {
    const ts = await client.auth.getTokenSet();
    if (ts?.accessToken) {
      saveTokens({
        accessToken:            ts.accessToken,
        refreshToken:           ts.refreshToken,
        expiresAt:              ts.expiresAt,
        refreshTokenExpiresAt:  ts.refreshTokenExpiresAt,
      });
    }
  } catch {
    // non-critical
  }
}

// -- Normalise list response --------------------------------------------------

function normalise(result) {
  return Array.isArray(result) ? result : (result?.data ?? []);
}

// -- Tickets ------------------------------------------------------------------

/**
 * Count tickets matching optional filters.
 * Uses count:true to get total without fetching records.
 * @param {object} [extraFilters] - additional filter conditions
 * @returns {Promise<number>}
 */
export async function countTickets(extraFilters = {}) {
  const result = await client.api.listTickets({
    filters: { visibility: 0, ...extraFilters },
    count:   true,
  });
  await syncTokens();
  // count:true returns the count as a number directly, or { count: N }
  if (typeof result === 'number') return result;
  if (result?.count != null) return Number(result.count);
  // Fallback: if it returns an array, use its length
  return Array.isArray(result) ? result.length : 0;
}

/**
 * Fetch the most recently modified tickets.
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function fetchRecentTickets(limit = 10) {
  const result = await client.api.listTickets({
    fields:  ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'lastmodified'],
    filters: { visibility: 0 },
    sort:    ['-lastmodified'],
    limit,
  });
  await syncTokens();
  return normalise(result);
}

/**
 * Get ticket counts grouped by status.
 * Queries each status value (0-11) with count:true.
 * @returns {Promise<Array<{status: number, label: string, count: number, color: string}>>}
 */
export async function fetchTicketsByStatus() {
  const promises = STATUS_LABELS.map((label, status) =>
    countTickets({ status }).then(count => ({
      status,
      label,
      count,
      color: STATUS_COLORS[status],
    }))
  );
  const results = await Promise.all(promises);
  return results;
}

// -- Accounts -----------------------------------------------------------------

/**
 * Count total accounts.
 * @returns {Promise<number>}
 */
export async function countAccounts() {
  const result = await client.api.listAccounts({
    filters: { visibility: 0 },
    count:   true,
  });
  await syncTokens();
  if (typeof result === 'number') return result;
  if (result?.count != null) return Number(result.count);
  return Array.isArray(result) ? result.length : 0;
}

/**
 * Fetch the most recently modified accounts with dot-notation joins.
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function fetchRecentAccounts(limit = 10) {
  const result = await client.api.listAccounts({
    fields:  ['ID', 'lastname', 'firstname', 'type', 'contact.city', 'contact.email', 'assigneduser.name', 'lastmodified'],
    filters: { visibility: 0 },
    sort:    ['-lastmodified'],
    limit,
  });
  await syncTokens();
  return normalise(result);
}
