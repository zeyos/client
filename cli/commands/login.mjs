/**
 * zeyos login
 *
 * Starts an OAuth 2.0 authorization-code flow.
 *
 * Always prints the authorization URL and callback URL so the user can
 * copy/paste them.  Simultaneously tries to open the browser and start
 * a local callback server to catch the redirect automatically.
 *
 * Options:
 *   --base-url <url>     ZeyOS platform URL  (e.g. https://zeyos.cms-it.de/demo)
 *   --client-id <id>     OAuth client ID
 *   --secret <secret>    OAuth client secret
 *   --scope <scope>      OAuth scope (default: all)
 *   --port <port>        Local callback server port (default: 9005)
 *   --global             Save credentials to ~/.config/zeyos/credentials.json
 *   --force              Re-authenticate even if already logged in
 *   --manual             Skip browser auto-open, prompt for code directly
 */

import { createInterface }                from 'node:readline';
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';
import { saveConfig, loadConfig }         from '../lib/config.mjs';
import { waitForCallback, callbackUri, BrowserUnavailableError } from '../lib/login-server.mjs';
import { success, error, info, warn }     from '../lib/output.mjs';

const DEFAULT_CALLBACK_PORT = 9005;

export const USAGE = `\
Usage: zeyos login [options]

Authenticate with a ZeyOS instance.

Options:
  --base-url <url>    ZeyOS platform URL  (prompted if missing)
  --client-id <id>    OAuth client ID     (prompted if missing)
  --secret <secret>   OAuth client secret (prompted if missing)
  --scope <scope>     OAuth scope  (default: all)
  --port <port>       Local callback server port  (default: 9005)
  --global            Store credentials globally (~/.config/zeyos/credentials.json)
  --force             Re-authenticate even if already logged in
  --clean             Discard saved config and re-enter all parameters
  --manual            Skip auto-browser, prompt for code paste
  -h, --help          Show this help
`;

export async function run(values) {
  const scope = values.global ? 'global' : 'local';
  const port  = values.port ? Number(values.port) : DEFAULT_CALLBACK_PORT;
  const redirectUri = callbackUri(port);

  // ── Resolve connection params ──────────────────────────────────────────────
  const existing = values.clean ? {} : loadConfig();
  if (values.clean) values.force = true;

  let baseUrl      = values['base-url']    ?? existing.baseUrl;
  let clientId     = values['client-id']   ?? existing.clientId;
  let clientSecret = values['secret']      ?? existing.clientSecret;

  // Prompt interactively for any missing values
  if (!baseUrl)      baseUrl      = await _prompt('ZeyOS platform URL');

  // Before asking for the application ID/secret, show the callback URL so the
  // user can register it as the redirect URI of their ZeyOS OAuth application
  // (the ID/secret only exist once that app has been created).
  if (!clientId || !clientSecret) {
    console.error('');
    info('Add this callback URL as the redirect URI of your ZeyOS OAuth app:');
    console.error(`    ${redirectUri}`);
    console.error('');
  }

  if (!clientId)     clientId     = await _prompt('Application ID');
  if (!clientSecret) clientSecret = await _promptSecret('Application secret');

  if (!baseUrl || !clientId || !clientSecret) {
    error('ZeyOS URL, application ID and secret are all required.');
    process.exit(1);
  }

  // Save connection params immediately so they are available on retries
  saveConfig({ baseUrl, clientId, clientSecret }, scope);

  // ── Check if already authenticated ────────────────────────────────────────
  if (existing.accessToken && !values.force) {
    warn('Already logged in.  Use --force to re-authenticate.');
    return;
  }

  // ── Build a temporary client (no token yet) ────────────────────────────────
  const tokenStore = new MemoryTokenStore();
  const client = createZeyosClient({
    platform: baseUrl,
    auth: {
      mode: 'oauth',
      oauth: { clientId, clientSecret, tokenStore, autoRefresh: false },
    },
  });

  // Generate random state for CSRF protection
  const state = _randomHex(32);

  const authUrl = client.oauth2.buildAuthorizationUrl({
    redirectUri,
    state,
    scope: values.scope,
  });

  // ── Always show URLs ───────────────────────────────────────────────────────
  console.error('');
  info('OAuth 2.0 Authorization Code Flow');
  console.error('');
  console.error('  Callback URL (redirect URI):');
  console.error(`    ${redirectUri}`);
  console.error('');
  console.error('  Authorization URL:');
  console.error(`    ${authUrl}`);
  console.error('');

  // ── Get the authorization code ─────────────────────────────────────────────
  let code;

  if (values.manual) {
    // Skip browser, prompt directly
    code = await _promptCode();
  } else {
    // Try browser + callback server; fall back to manual on any failure
    code = await _browserFlowWithFallback(authUrl, port, state);
  }

  if (!code) {
    error('No authorization code provided.');
    process.exit(1);
  }

  // ── Exchange code for tokens ───────────────────────────────────────────────
  try {
    info('Exchanging authorization code for tokens…');
    const tokenSet = await client.oauth2.exchangeAuthorizationCode({ code, redirectUri });

    saveConfig({
      baseUrl,
      clientId,
      clientSecret,
      accessToken:           tokenSet.accessToken,
      refreshToken:          tokenSet.refreshToken          ?? undefined,
      expiresAt:             tokenSet.expiresAt             ?? undefined,
      refreshTokenExpiresAt: tokenSet.refreshTokenExpiresAt ?? undefined,
    }, scope);

    success('Logged in successfully.');
  } catch (err) {
    error(`Token exchange failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Try the browser + callback server flow.
 * On any failure, fall back to prompting the user for the code.
 */
async function _browserFlowWithFallback(authUrl, port, state) {
  try {
    info('Starting local callback server and opening browser…');
    const code = await waitForCallback(authUrl, port, state);
    return code;
  } catch (err) {
    if (err instanceof BrowserUnavailableError) {
      warn('Could not open browser automatically.');
    } else {
      warn(`Callback server error: ${err.message}`);
    }
    console.error('');
    console.error('  Paste the authorization code from the browser redirect URL.');
    console.error('  (The URL looks like:  …/callback?code=XXXXXXXX&state=…)');
    console.error('');
    return _promptCode();
  }
}

function _prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(`${question}: `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function _promptSecret(question) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return _prompt(question);
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const originalWrite = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (value) => {
    if (String(value).includes(question) || value === '\n' || value === '\r\n') {
      originalWrite(value);
    }
  };

  return new Promise(resolve => {
    rl.question(`${question}: `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function _promptCode() {
  return _prompt('Paste the authorization code');
}

function _randomHex(length) {
  return Array.from(
    { length },
    () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('');
}
