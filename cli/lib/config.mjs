/**
 * Credential configuration with named profiles.
 *
 * A "profile" is a full credential set (baseUrl, clientId, clientSecret, tokens)
 * stored under a name. Profiles live in a global registry; a project can pin which
 * profile it uses. The legacy single-file layout still works unchanged.
 *
 * Resolution cascade (first match decides which credential set is the base):
 *   1. --profile <name>            (CLI flag)            -> named profile
 *   2. ZEYOS_PROFILE               (env var)             -> named profile
 *   3. .zeyos/profile              (project pin, walked up) -> named profile
 *   4. .zeyos/auth.json            (legacy local, walked up)
 *   5. profiles.json "active"      (global active profile)
 *   6. ~/.config/zeyos/credentials.json  (legacy global)
 * Environment credential vars (ZEYOS_BASE_URL, ZEYOS_TOKEN, …) always field-merge
 * on top of whichever base was chosen.
 *
 * Add .zeyos/auth.json and .zeyos/profile to .gitignore.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/** @typedef {import('./types.mjs').CliConfig} CliConfig */
/** @typedef {{ kind: 'profile'|'local'|'global', name?: string, path?: string }} ConfigSource */

// ── Constants ────────────────────────────────────────────────────────────────

const LOCAL_DIR    = '.zeyos';
const LOCAL_FILE   = 'auth.json';
const PIN_FILE     = 'profile';
const GLOBAL_DIR   = join(homedir(), '.config', 'zeyos');
const GLOBAL_FILE  = join(GLOBAL_DIR, 'credentials.json');
const PROFILES_FILE = join(GLOBAL_DIR, 'profiles.json');

/** Credential fields that make up a profile / auth file. */
const CRED_KEYS = [
  'baseUrl', 'instance', 'clientId', 'clientSecret',
  'accessToken', 'refreshToken', 'expiresAt', 'refreshTokenExpiresAt'
];
const TOKEN_KEYS = ['accessToken', 'refreshToken', 'expiresAt', 'refreshTokenExpiresAt'];

// ── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load the full config object using the cascade.
 * @param {{ profile?: string }} [opts]
 */
export function loadConfig(opts = {}) {
  return loadConfigWithSource(opts).config;
}

/**
 * Load config and identify the credential store that should receive refreshed
 * tokens (the `source`). Env credential vars field-merge on top of the resolved
 * base so they always win.
 *
 * @param {{ profile?: string }} [opts]
 * @returns {{ config: CliConfig, source: ConfigSource|null, profile: { name: string, origin: string }|null }}
 */
export function loadConfigWithSource(opts = {}) {
  const env = _fromEnv();
  if (env.accessToken) {
    return { config: env, source: null, profile: null };
  }
  const selection = resolveProfileSelection({ profileFlag: opts.profile });

  let base = {};
  let source = null;

  if (selection.name) {
    // An explicit/active profile was selected (flag, env, pin, or active pointer).
    const prof = getProfile(selection.name);
    base = prof ?? {};
    source = { kind: 'profile', name: selection.name };
    // selection.missing is surfaced via resolveProfileSelection consumers; base
    // stays {} so requireConfig reports the missing fields.
  } else {
    // No named profile in play — fall back to the legacy single-file layout.
    const localPath = _findLocalPath();
    if (localPath) {
      base = _readJson(localPath);
      source = { kind: 'local', path: localPath };
    } else if (existsSync(GLOBAL_FILE)) {
      base = _readGlobal();
      source = { kind: 'global' };
    }
  }

  return {
    config: { ...base, ...env },
    source,
    profile: selection.name
      ? { name: selection.name, origin: selection.origin, missing: Boolean(selection.missing) }
      : null
  };
}

/**
 * Decide which profile name applies, and where the decision came from.
 * Order: flag > ZEYOS_PROFILE env > project pin (.zeyos/profile) > global active.
 * `.zeyos/auth.json` (legacy local) deliberately sits BELOW the pin but is handled
 * in loadConfigWithSource (it is not a named profile).
 *
 * @param {{ profileFlag?: string }} [opts]
 * @returns {{ name: string|null, origin: 'flag'|'env'|'pin'|'active'|null, path?: string, missing?: boolean }}
 */
export function resolveProfileSelection(opts = {}) {
  const flag = opts.profileFlag;
  if (flag) return _withExistence({ name: flag, origin: 'flag' });

  const envName = process.env.ZEYOS_PROFILE;
  if (envName) return _withExistence({ name: envName, origin: 'env' });

  const pin = readLocalPin();
  // A pin only selects a named profile if there is NO legacy local auth.json that
  // sits closer to the cwd (legacy projects keep working). When both exist at the
  // same place the explicit pin wins.
  if (pin) {
    const localPath = _findLocalPath();
    if (!localPath || _isSameOrShallower(pin.dir, localPath)) {
      return _withExistence({ name: pin.name, origin: 'pin', path: pin.path });
    }
  }

  // If a legacy local auth.json exists, it (not the global active profile) is the
  // base — handled by the caller. Only fall through to the active profile when no
  // local file shadows it.
  if (_findLocalPath()) return { name: null, origin: null };

  const active = getActiveProfileName();
  if (active) return _withExistence({ name: active, origin: 'active' });

  return { name: null, origin: null };
}

function _withExistence(sel) {
  return { ...sel, missing: getProfile(sel.name) == null };
}

// ── Require ──────────────────────────────────────────────────────────────────

/**
 * Require specific keys to be present; throws a human-friendly error if not.
 * @param {string[]} keys
 * @param {CliConfig} config
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

// ── Save (legacy single-file) ─────────────────────────────────────────────────

/**
 * Save (merge) config values into the nearest .zeyos/auth.json (or create one in
 * the current directory), or the global credentials file when scope === 'global'.
 *
 * @param {CliConfig} updates
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
  if (scope === 'global') {
    _writeGlobal(_stripTokens(_readGlobal()));
    return;
  }
  const path = _findLocalPath();
  if (path) _writeJson(path, _stripTokens(_readJson(path)));
}

/** Remove all credential/session fields from the resolved legacy local auth file. */
export function clearLocalCredentialsForSource(source) {
  if (!source || source.kind !== 'local') return false;
  const path = source.path ?? _findLocalPath();
  if (!path) return false;

  const current = _readJson(path);
  const hadCredentials = CRED_KEYS.some((key) => Object.prototype.hasOwnProperty.call(current, key));
  if (!hadCredentials) return false;

  const next = _stripCredentials(current);
  _writeJson(path, next);
  return true;
}

/**
 * Persist refreshed tokens back to wherever the active credentials came from.
 * @param {ConfigSource|null} source
 * @param {Partial<CliConfig>} tokens
 */
export function persistTokens(source, tokens) {
  if (!source) return;
  const slice = {};
  for (const k of TOKEN_KEYS) if (k in tokens) slice[k] = tokens[k];
  if (source.kind === 'profile') {
    upsertProfile(source.name, slice);
  } else if (source.kind === 'global') {
    saveConfig(slice, 'global');
  } else {
    saveConfig(slice, 'local');
  }
}

/** Clear tokens from whichever store the source points at. */
export function clearTokensForSource(source) {
  if (!source) return;
  if (source.kind === 'profile') {
    const prof = getProfile(source.name);
    if (prof) upsertProfile(source.name, _stripTokens(prof), { replace: true });
  } else if (source.kind === 'global') {
    clearTokens('global');
  } else {
    clearTokens('local');
  }
}

// ── Profiles ───────────────────────────────────────────────────────────────────

/** Read the profiles registry: { active, profiles }. */
export function readProfiles() {
  const raw = existsSync(PROFILES_FILE) ? _readJson(PROFILES_FILE) : {};
  return {
    active: typeof raw.active === 'string' ? raw.active : null,
    profiles: raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {}
  };
}

/** List profile names with their (token-stripped-safe) creds and the active name. */
export function listProfiles() {
  const { active, profiles } = readProfiles();
  return {
    active,
    profiles: Object.fromEntries(Object.entries(profiles).map(([name, creds]) => [name, { ...creds }]))
  };
}

/** Return a single profile's credentials, or null. */
export function getProfile(name) {
  if (!name) return null;
  const { profiles } = readProfiles();
  return profiles[name] ? { ...profiles[name] } : null;
}

/**
 * Create or update a profile (field merge by default).
 * @param {string} name
 * @param {Partial<CliConfig>} updates
 * @param {{ replace?: boolean }} [opts]  replace: overwrite instead of merge
 */
export function upsertProfile(name, updates, opts = {}) {
  if (!name) throw new Error('Profile name is required.');
  const reg = readProfiles();
  const current = opts.replace ? {} : (reg.profiles[name] || {});
  reg.profiles[name] = _onlyCredKeys({ ...current, ...updates });
  if (!reg.active) reg.active = name; // first profile becomes active
  _writeProfiles(reg);
}

/** Delete a profile. Clears the active pointer if it referenced this profile. */
export function removeProfile(name) {
  const reg = readProfiles();
  if (!(name in reg.profiles)) return false;
  delete reg.profiles[name];
  if (reg.active === name) {
    reg.active = Object.keys(reg.profiles)[0] ?? null;
  }
  _writeProfiles(reg);
  return true;
}

/** Set the global active profile. Throws if it does not exist. */
export function setActiveProfile(name) {
  const reg = readProfiles();
  if (!(name in reg.profiles)) throw new Error(`No such profile: "${name}".`);
  reg.active = name;
  _writeProfiles(reg);
}

export function getActiveProfileName() {
  return readProfiles().active;
}

// ── Project pin (.zeyos/profile) ─────────────────────────────────────────────

/** Read the nearest project pin: { name, path, dir } or null. */
export function readLocalPin() {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, LOCAL_DIR, PIN_FILE);
    if (existsSync(candidate)) {
      try {
        const name = readFileSync(candidate, 'utf8').trim();
        if (name) return { name, path: candidate, dir };
      } catch { /* ignore unreadable pin */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Pin a profile for the current project (writes ./.zeyos/profile). */
export function writeLocalPin(name, dir = process.cwd()) {
  const path = join(dir, LOCAL_DIR, PIN_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${name}\n`, { mode: 0o600 });
  return path;
}

/** Remove the nearest project pin, if any. Returns the removed path or null. */
export function clearLocalPin() {
  const pin = readLocalPin();
  if (pin) { unlinkSync(pin.path); return pin.path; }
  return null;
}

// ── Paths (for messages) ───────────────────────────────────────────────────────

export function localConfigPath() { return _findLocalPath(); }
export function globalConfigPath() { return GLOBAL_FILE; }
export function profilesConfigPath() { return PROFILES_FILE; }

/** Read the legacy global credentials file directly, without applying the cascade. */
export function loadGlobalConfig() {
  return _readGlobal();
}

// ── Internals ────────────────────────────────────────────────────────────────

function _fromEnv() {
  const e = process.env;
  const out = {};
  if (e.ZEYOS_BASE_URL)      out.baseUrl      = e.ZEYOS_BASE_URL;
  if (e.ZEYOS_INSTANCE)      out.instance     = e.ZEYOS_INSTANCE;
  if (e.ZEYOS_CLIENT_ID)     out.clientId     = e.ZEYOS_CLIENT_ID;
  if (e.ZEYOS_CLIENT_SECRET) out.clientSecret = e.ZEYOS_CLIENT_SECRET;
  if (e.ZEYOS_TOKEN)         out.accessToken  = e.ZEYOS_TOKEN;
  if (e.ZEYOS_REFRESH_TOKEN) out.refreshToken = e.ZEYOS_REFRESH_TOKEN;
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

/** True when the pin directory is at or above the auth.json's directory. */
function _isSameOrShallower(pinDir, localPath) {
  const localDir = dirname(dirname(localPath)); // strip /.zeyos/auth.json
  return pinDir.length <= localDir.length;
}

function _onlyCredKeys(obj) {
  const out = {};
  for (const k of CRED_KEYS) if (obj[k] != null) out[k] = obj[k];
  return out;
}

function _stripTokens(o) {
  const { accessToken, refreshToken, expiresAt, refreshTokenExpiresAt, ...rest } = o;
  return rest;
}

function _stripCredentials(o) {
  const out = { ...o };
  for (const key of CRED_KEYS) {
    delete out[key];
  }
  return out;
}

function _readGlobal() {
  return existsSync(GLOBAL_FILE) ? _readJson(GLOBAL_FILE) : {};
}

function _writeGlobal(data) {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  _writeJson(GLOBAL_FILE, data);
}

function _writeProfiles(reg) {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  _writeJson(PROFILES_FILE, { active: reg.active ?? null, profiles: reg.profiles ?? {} });
}

function _readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to read ${path}: ${err.message || err}`);
  }
}

function _writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}
