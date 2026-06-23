/**
 * zeyos whoami
 *
 * Displays information about the currently authenticated user.
 *
 * Options:
 *   --json    Output as JSON
 *   --yaml    Output as YAML
 *   --show-token Include the current access token in output
 */

import { createInterface } from 'node:readline';
import { buildClient, syncTokens } from '../lib/client.mjs';
import { globalConfigPath, profilesConfigPath } from '../lib/config.mjs';
import { outputMode, printJson, printYaml, printRecord, formatDate, error } from '../lib/output.mjs';
import { run as runLogin } from './login.mjs';

export const USAGE = `\
Usage: zeyos whoami [options]

Show information about the currently authenticated user.

Options:
  --json        Output as JSON
  --yaml        Output as YAML
  --show-token  Include the current access token in output
  -h, --help    Show this help
`;

export async function run(values) {
  let state = _buildClientState(values);

  let userInfo;
  try {
    userInfo = await _fetchUserInfo(state);
  } catch (err) {
    const handled = await _handleFetchError(err, state, values);
    if (!handled) process.exit(1);
    state = handled.state;
    userInfo = handled.userInfo;
  }

  const mode = outputMode(values);

  const output = { ...userInfo };
  if (values['show-token']) {
    const tokenSet = await state.tokenStore.get();
    if (tokenSet?.accessToken) output.accessToken = tokenSet.accessToken;
  }

  if (mode === 'json') {
    printJson(output);
  } else if (mode === 'yaml') {
    printYaml(output);
  } else {
    // Pretty key-value record with custom formatters
    const dateFormat = state.config.dateFormat ?? 'YYYY-MM-DD HH:mm';
    const keys = Object.keys(output);
    const formatters = {};

    // Format updated_at as a human-readable date
    if (output.updated_at != null) {
      formatters.updated_at = (val) => formatDate(val, dateFormat);
    }

    // Format groups as a multi-line list
    if (Array.isArray(output.groups)) {
      formatters.groups = (val) => _formatObjectList(val, 'name', 'writable');
    }

    // Format permissions as a multi-line list
    if (Array.isArray(output.permissions)) {
      formatters.permissions = (val) => _formatObjectList(val, 'identifier', 'writable');
    }

    printRecord(output, keys, {}, formatters);
  }
}

function _buildClientState(values) {
  try {
    const state = buildClient({}, { profile: values.profile });
    return {
      client: state.client,
      config: state.config,
      tokenStore: state.tokenStore,
      configSource: state.configSource
    };
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

async function _fetchUserInfo(state) {
  const userInfo = await state.client.oauth2.getUserInfo();
  await syncTokens(state.tokenStore, state.configSource);
  return userInfo;
}

async function _handleFetchError(err, state, values) {
  const status = err?.status;
  if (status === 502 || status === 503 || status === 504) {
    error(`ZeyOS instance is temporarily unavailable (HTTP ${status}). The server at ${state.config.baseUrl} may be down or restarting — this is server-side, not your credentials.`);
    return null;
  }

  const authFailure = _authFailureSummary(err);
  if (!authFailure) {
    error(`Failed to fetch user info: ${err.message}`);
    return null;
  }

  error(_formatAuthFailure(authFailure, err, state.config, state.configSource, values));
  const reauthenticated = await _maybeReauthenticate(state.configSource, values);
  if (!reauthenticated) return null;

  const nextState = _buildClientState(values);
  try {
    return {
      state: nextState,
      userInfo: await _fetchUserInfo(nextState)
    };
  } catch (retryErr) {
    error(`Re-authentication completed, but fetching user info still failed: ${retryErr.message}`);
    return null;
  }
}

/**
 * Format an array of objects as a multi-line list.
 * Each item is shown as "name (rw)" or "name (ro)" on its own line.
 *
 * @param {Record<string, string|number|boolean|null|undefined>[]} items
 * @param {string}   nameKey     - key to use as display name
 * @param {string}   writableKey - key indicating write access (boolean)
 * @returns {string}
 */
function _formatObjectList(items, nameKey, writableKey) {
  if (!Array.isArray(items) || items.length === 0) return '(none)';
  return items
    .map(item => {
      const name = item[nameKey] ?? '?';
      const rw = item[writableKey] ? 'rw' : 'ro';
      return `· ${name} (${rw})`;
    })
    .join('\n');
}

function _isInvalidRefreshTokenError(err) {
  const detail = `${err?.message ?? ''}\n${_stringifyErrorBody(err?.body)}`;
  return [400, 401, 403].includes(err?.status) &&
    /refresh[_ -]?token|invalid_grant/i.test(detail) &&
    /invalid|expired|forbidden|invalid_grant/i.test(detail);
}

function _authFailureSummary(err) {
  if (_isInvalidRefreshTokenError(err)) {
    return 'Your stored refresh token is invalid or expired.';
  }
  if (err?.status === 401) {
    return 'Your session has expired or is invalid.';
  }
  return null;
}

function _formatAuthFailure(summary, err, config, source, values) {
  const lines = [
    summary,
    `Platform URL: ${config.baseUrl ?? '(not configured)'}`,
    `Credential source: ${_describeConfigSource(source)}`
  ];

  if (err?.url) {
    lines.push(`OAuth endpoint: ${err.url}`);
  }
  if (err?.status) {
    lines.push(`HTTP status: ${err.status}${err.statusText ? ` ${err.statusText}` : ''}`);
  }

  const detail = _authErrorDetail(err);
  if (detail) {
    lines.push(`OAuth error: ${detail}`);
  }

  lines.push(`Next step: ${_loginCommand(source, values)}`);
  if (process.env.ZEYOS_TOKEN || process.env.ZEYOS_REFRESH_TOKEN) {
    lines.push('Note: ZEYOS_TOKEN or ZEYOS_REFRESH_TOKEN is set and overrides stored credentials; update or unset it before retrying.');
  }
  return lines.join('\n');
}

function _describeConfigSource(source) {
  if (!source) {
    return 'environment variables';
  }
  if (source.kind === 'profile') {
    return `profile "${source.name}" (${profilesConfigPath()})`;
  }
  if (source.kind === 'global') {
    return `global credentials (${globalConfigPath()})`;
  }
  if (source.kind === 'local') {
    return `local file ${source.path ?? '.zeyos/auth.json'}`;
  }
  return source.kind ?? 'unknown';
}

function _loginCommand(source, values) {
  const profile = values.profile ?? (source?.kind === 'profile' ? source.name : null);
  if (profile) {
    return `zeyos login --profile ${_quoteArg(profile)} --force`;
  }
  if (source?.kind === 'global') {
    return 'zeyos login --global --force';
  }
  return 'zeyos login --force';
}

async function _maybeReauthenticate(source, values) {
  if (!_canPromptForReauthentication(source, values)) {
    return false;
  }

  const command = _loginCommand(source, values);
  const confirmed = await _confirm(`Re-authenticate now (${command})? [y/N] `);
  if (!confirmed) return false;

  await runLogin(_loginValues(source, values));
  return true;
}

function _canPromptForReauthentication(source, values) {
  return Boolean(source) &&
    !values.json &&
    !values.yaml &&
    process.stdin.isTTY &&
    process.stderr.isTTY &&
    !process.env.ZEYOS_TOKEN &&
    !process.env.ZEYOS_REFRESH_TOKEN;
}

function _loginValues(source, values) {
  return {
    ...values,
    force: true,
    profile: values.profile ?? (source?.kind === 'profile' ? source.name : undefined),
    global: source?.kind === 'global' ? true : values.global
  };
}

function _confirm(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function _authErrorDetail(err) {
  const body = _stringifyErrorBody(err?.body).trim();
  if (body) {
    return body;
  }
  return String(err?.message ?? '').trim();
}

function _stringifyErrorBody(body) {
  if (body == null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function _quoteArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) {
    return text;
  }
  return `'${text.replaceAll("'", "'\\''")}'`;
}
