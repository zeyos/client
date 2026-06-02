/**
 * Authentication helpers.
 * Supports two modes:
 *  - Token mode:   pre-obtained browser tokens provided via body attributes or console API
 *  - Session mode: browser cookies sent to ZeyOS (user already logged in)
 *
 * Session detection probes /oauth2/v1/userinfo with credentials:'include'.
 */
import { client } from './api.js';
import { loadTokens, clearTokens } from './state.js';

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Probe the ZeyOS instance for an active browser session.
 * Calls GET {url}/oauth2/v1/userinfo with credentials:'include' to
 * check whether the user is already logged in via a session cookie.
 * Returns the user info object on success, null otherwise.
 */
export async function trySessionAuth(url) {
  try {
    const endpoint = `${url.replace(/\/+$/, '')}/oauth2/v1/userinfo`;
    const res = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // A valid userinfo response must have a subject (user identifier)
    return (data && (data.sub || data.ID)) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if a valid (non-expired) access token exists in localStorage.
 */
export function isAuthenticated() {
  const tokens = loadTokens();
  if (!tokens?.accessToken) return false;
  if (!tokens.expiresAt) return true;
  // Token still valid with 2-minute buffer
  return Date.now() < tokens.expiresAt - 120_000;
}

/**
 * Clear tokens and revoke the access token if possible.
 */
export async function logout() {
  const tokens = loadTokens();
  if (tokens?.accessToken && client) {
    try {
      await client.oauth2.revokeToken({ token: tokens.accessToken });
    } catch {
      // best-effort revocation
    }
  }
  clearTokens();
}
