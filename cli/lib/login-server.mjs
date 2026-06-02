/**
 * Lightweight OAuth callback server.
 *
 * Starts a temporary HTTP server on localhost:PORT, opens the authorization
 * URL in the system browser, waits for the redirect, extracts `?code=`, then
 * shuts itself down.
 *
 * Falls back gracefully when no browser is available (CI, SSH, headless).
 */

import { createServer } from 'node:http';
import { exec }         from 'node:child_process';

const DEFAULT_PORT    = 9005;
const CALLBACK_PATH   = '/callback';
const TIMEOUT_MS      = 5 * 60 * 1000; // 5 minutes

// ── Browser opener ────────────────────────────────────────────────────────────

/** Open a URL in the system default browser. Returns true if a command was spawned. */
function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"` :
    process.platform === 'win32'  ? `start "" "${url}"` :
    /* linux/other */                `xdg-open "${url}"`;

  return new Promise(resolve => {
    exec(cmd, err => resolve(!err));
  });
}

// ── Server ────────────────────────────────────────────────────────────────────

/**
 * Start a temporary local server, open the browser, and resolve with the
 * authorization code once ZeyOS redirects back.
 *
 * @param {string} authUrl        - Full authorization URL to open
 * @param {number} [port]         - Local port to listen on
 * @param {string} [expectedState] - Expected OAuth state param for CSRF validation
 * @returns {Promise<string>}     - Resolves with the `code` query param
 */
export async function waitForCallback(authUrl, port = DEFAULT_PORT, expectedState = undefined) {
  return new Promise((resolve, reject) => {
    let server;
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      try { server?.close(); } catch { /* ignore */ }
    };

    server = createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${port}`);

      // Only handle the callback path; ignore favicon etc.
      if (u.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }

      const code          = u.searchParams.get('code');
      const error         = u.searchParams.get('error');
      const returnedState = u.searchParams.get('state');

      // CSRF check: validate state matches if we sent one
      if (expectedState && returnedState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(_html('State mismatch', '<p>OAuth state parameter does not match. This may be a CSRF attack.</p><p>Please try again.</p>', true));
        cleanup();
        reject(new Error('OAuth state mismatch — possible CSRF attack. Please retry login.'));
        return;
      }

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(_html('Authorization failed', `<p>Error: <strong>${_esc(error)}</strong></p><p>You may close this tab.</p>`, true));
        cleanup();
        reject(new Error(`OAuth error: ${error} — ${u.searchParams.get('error_description') ?? ''}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(_html('Bad request', '<p>No authorization code in callback.</p>', true));
        cleanup();
        reject(new Error('No authorization code received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(_html('Authorized', '<p>You are now logged in. You may close this tab.</p>', false));
      cleanup();
      resolve(code);
    });

    server.on('error', err => {
      cleanup();
      reject(err);
    });

    server.listen(port, '127.0.0.1', async () => {
      // Set a hard timeout so the process doesn't hang forever
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Login timed out after 5 minutes'));
      }, TIMEOUT_MS);

      const opened = await openBrowser(authUrl);
      if (!opened) {
        // Can't open browser — caller should fall back to manual flow
        cleanup();
        reject(new BrowserUnavailableError(authUrl));
      }
    });
  });
}

/** @returns {string} The redirect URI for this server. */
export function callbackUri(port = DEFAULT_PORT) {
  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

// ── Custom error type ─────────────────────────────────────────────────────────

export class BrowserUnavailableError extends Error {
  constructor(authUrl) {
    super('Could not open browser');
    this.name = 'BrowserUnavailableError';
    this.authUrl = authUrl;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _html(title, body, isError) {
  const color = isError ? '#c0392b' : '#27ae60';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${_esc(title)} — ZeyOS</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
.box{background:#fff;border-radius:8px;padding:2rem 3rem;box-shadow:0 2px 8px rgba(0,0,0,.12);text-align:center;max-width:400px}
h1{color:${color};margin-bottom:.5rem}p{color:#555;line-height:1.5}</style>
</head><body><div class="box"><h1>${_esc(title)}</h1>${body}</div></body></html>`;
}
