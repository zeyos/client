/**
 * ZeyOS API client singleton + high-level helper functions.
 * Supports two initialization modes:
 *  - Token mode: uses pre-obtained browser tokens via MemoryTokenStore
 *  - Session mode: uses browser session cookies
 */
import { createZeyosClient, MemoryTokenStore } from '../../../src/index.js';
import { loadTokens, saveTokens } from './state.js';

export let client = null;
export let tokenStore = null;

// ── Client Initialization ─────────────────────────────────────────────────

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

/** Persist the current token set back to localStorage (no-op in session mode). */
export async function syncTokens() {
  if (!tokenStore) return; // session mode — no tokens to sync
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

// ── Tickets ────────────────────────────────────────────────────────────────

export async function fetchTickets({ context } = {}) {
  const filters = { visibility: 0 };
  if (context?.type === 'account' && context.id) filters.account = context.id;
  if (context?.type === 'project' && context.id) filters.project = context.id;

  const result = await client.api.listTickets({
    fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate', 'lastmodified'],
    filters,
    sort:     ['-lastmodified'],
    limit:    500,
  });
  await syncTokens();
  return Array.isArray(result) ? result : (result?.data ?? []);
}

export async function getTicket(id) {
  const result = await client.api.getTicket({ ID: id, extdata: 1, tags: 1 });
  await syncTokens();
  return result;
}

export async function createTicket(data) {
  const result = await client.api.createTicket(data);
  await syncTokens();
  return result;
}

export async function updateTicket(id, data) {
  const result = await client.api.updateTicket({ ID: id, body: data });
  await syncTokens();
  return result;
}

export async function deleteTicket(id) {
  await client.api.deleteTicket({ ID: id });
  await syncTokens();
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function fetchTasksForTicket(ticketId) {
  const result = await client.api.listTasks({
    fields: ['ID', 'tasknum', 'name', 'status', 'ticket', 'duedate', 'assigneduser'],
    filters: { ticket: ticketId, visibility: 0 },
    sort:    ['+name'],
    limit:   200,
  });
  return Array.isArray(result) ? result : (result?.data ?? []);
}

export async function createTask(data) {
  return client.api.createTask(data);
}

export async function updateTask(id, data) {
  return client.api.updateTask({ ID: id, body: data });
}

export async function deleteTask(id) {
  return client.api.deleteTask({ ID: id });
}

// ── Projects ───────────────────────────────────────────────────────────────

export async function fetchProjects() {
  try {
    const result = await client.api.listProjects({
      fields: ['ID', 'name'],
      filters: { visibility: 0 },
      sort:   ['+name'],
      limit:  500,
    });
    return Array.isArray(result) ? result : (result?.data ?? []);
  } catch {
    return [];
  }
}
