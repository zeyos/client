/**
 * Application state -- persistence via localStorage, in-memory for runtime data.
 * Config resolution merges <body> data attributes with localStorage overrides.
 *
 * This follows the same pattern as the kanban sample app, using a separate
 * localStorage namespace (zeyos_crm_*) to avoid collisions.
 */

const KEYS = {
  URL:    'zeyos_crm_url',
  TOKENS: 'zeyos_crm_tokens',
};

// ── helpers ────────────────────────────────────────────────────────────────

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable -- silently ignore
  }
}

// ── URL ────────────────────────────────────────────────────────────────────

export function loadUrl()    { return localStorage.getItem(KEYS.URL) ?? null; }
export function saveUrl(url) { localStorage.setItem(KEYS.URL, url); }
export function clearUrl()   { localStorage.removeItem(KEYS.URL); }

// ── Tokens ─────────────────────────────────────────────────────────────────

export function loadTokens() {
  return readJson(KEYS.TOKENS, null);
}

export function saveTokens(tokens) {
  writeJson(KEYS.TOKENS, tokens);
}

export function clearTokens() {
  localStorage.removeItem(KEYS.TOKENS);
}

// ── Config Resolution ──────────────────────────────────────────────────────

/**
 * Resolve effective config by merging <body> data attributes with localStorage.
 * localStorage values (set via ZeyOS console API) override body attributes.
 * Returns { url, accessToken, refreshToken }.
 */
export function resolveConfig() {
  const body = document.body;

  // Body attributes (defaults)
  const bodyUrl     = body?.dataset.zeyosUrl?.trim()         || null;
  const bodyAccess  = body?.dataset.zeyosAccesstoken?.trim() || null;
  const bodyRefresh = body?.dataset.zeyosRefreshtoken?.trim() || null;

  // localStorage overrides
  const storedUrl    = loadUrl();
  const storedTokens = loadTokens();

  return {
    url:          storedUrl    || bodyUrl,
    accessToken:  storedTokens?.accessToken  || bodyAccess,
    refreshToken: storedTokens?.refreshToken || bodyRefresh,
  };
}

// ── In-memory runtime state (not persisted) ────────────────────────────────

export const runtime = {
  url:      null,      // resolved ZeyOS instance URL
  authMode: null,      // 'token' | 'session' | null
  accounts: [],        // current page of account records
  hasNextPage: false,  // true when the next page has at least one record
  page:     1,         // current page number (1-based)
  pageSize: 25,        // records per page
  search:   '',        // current search query
  sort:     { field: 'LastModified', dir: 'desc' }, // active sort column + direction
};
