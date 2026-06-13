/**
 * Credential configuration — cascade:
 *   1. Environment variables  (ZEYOS_BASE_URL, ZEYOS_TOKEN, …)
 *   2. .zeyos/auth.json       (walk up from CWD, like .gitconfig)
 *   3. ~/.config/zeyos/credentials.json
 *
 * The auth file stores connection params AND tokens.
 * Add .zeyos/auth.json to .gitignore.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ── Constants ────────────────────────────────────────────────────────────────

const LOCAL_DIR   = '.zeyos';
const LOCAL_FILE  = 'auth.json';
const GLOBAL_DIR  = join(homedir(), '.config', 'zeyos');
const GLOBAL_FILE = join(GLOBAL_DIR, 'credentials.json');

// ── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load the full config object using the cascade.
 * Returns a merged object; env vars always win over file values.
 */
export function loadConfig() {
  return loadConfigWithSource().config;
}

/**
 * Load config and identify the credential file scope that should receive
 * refreshed tokens. Local config overrides global config field-by-field, so a
 * partial local file cannot shadow global connection parameters.
 */
export function loadConfigWithSource() {
  const localPath = _findLocalPath();
  const globalFile = _readGlobal();
  const localFile = localPath ? _readJson(localPath) : {};
  const env = _fromEnv();

  return {
    config: { ...globalFile, ...localFile, ...env },
    source: localPath ? 'local' : (existsSync(GLOBAL_FILE) ? 'global' : null)
  };
}

/**
 * Require specific keys to be present; throws a human-friendly error if not.
 * @param {string[]} keys
 * @param {Record<string,any>} config
 */
export function requireConfig(keys, config) {
  const missing = keys.filter(k => config[k] == null || config[k] === '');
  if (missing.length === 0) return;

  const hints = {
    baseUrl:      'Set ZEYOS_BASE_URL or run: zeyos login --base-url <url>',
    clientId:     'Set ZEYOS_CLIENT_ID or run: zeyos login --client-id <id>',
    clientSecret: 'Set ZEYOS_CLIENT_SECRET or run: zeyos login --secret <secret>',
    accessToken:  'Run: zeyos login',
  };

  const messages = missing.map(k => `  • ${k}: ${hints[k] ?? 'not set'}`);
  throw new Error(`Missing required configuration:\n${messages.join('\n')}`);
}

// ── Save ─────────────────────────────────────────────────────────────────────

/**
 * Save (merge) config values into the nearest .zeyos/auth.json found while
 * walking up, or create one in the current directory.  Falls back to the
 * global file when `scope === 'global'`.
 *
 * @param {Record<string,any>} updates
 * @param {'local'|'global'} scope
 */
export function saveConfig(updates, scope = 'local') {
  if (scope === 'global') {
    _writeGlobal({ ..._readGlobal(), ...updates });
    return;
  }
  const existing = _findLocalPath();
  const path = existing ?? join(process.cwd(), LOCAL_DIR, LOCAL_FILE);
  const current = existing ? _readJson(path) : {};
  _writeJson(path, { ...current, ...updates });
}

/** Remove the stored tokens (leave connection params intact). */
export function clearTokens(scope = 'local') {
  const strip = o => {
    const { accessToken, refreshToken, expiresAt, refreshTokenExpiresAt, ...rest } = o;
    return rest;
  };
  if (scope === 'global') {
    _writeGlobal(strip(_readGlobal()));
    return;
  }
  const path = _findLocalPath();
  if (path) _writeJson(path, strip(_readJson(path)));
}

/** Return the path of the active local .zeyos/auth.json (if any). */
export function localConfigPath() {
  return _findLocalPath();
}

/** Return the global credentials file path. */
export function globalConfigPath() {
  return GLOBAL_FILE;
}

// ── Internals ────────────────────────────────────────────────────────────────

function _fromEnv() {
  const e = process.env;
  const out = {};
  if (e.ZEYOS_BASE_URL)              out.baseUrl             = e.ZEYOS_BASE_URL;
  if (e.ZEYOS_INSTANCE)              out.instance            = e.ZEYOS_INSTANCE;
  if (e.ZEYOS_CLIENT_ID)             out.clientId            = e.ZEYOS_CLIENT_ID;
  if (e.ZEYOS_CLIENT_SECRET)         out.clientSecret        = e.ZEYOS_CLIENT_SECRET;
  if (e.ZEYOS_TOKEN)                 out.accessToken         = e.ZEYOS_TOKEN;
  if (e.ZEYOS_REFRESH_TOKEN)         out.refreshToken        = e.ZEYOS_REFRESH_TOKEN;
  return out;
}

function _findLocalPath() {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, LOCAL_DIR, LOCAL_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function _readGlobal() {
  return existsSync(GLOBAL_FILE) ? _readJson(GLOBAL_FILE) : {};
}

function _writeGlobal(data) {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  _writeJson(GLOBAL_FILE, data);
}

function _readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function _writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
