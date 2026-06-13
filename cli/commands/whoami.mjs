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

import { buildClient, syncTokens } from '../lib/client.mjs';
import { outputMode, printJson, printYaml, printRecord, formatDate, error } from '../lib/output.mjs';

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
  let client, config, tokenStore, configSource;
  try {
    ({ client, config, tokenStore, configSource } = buildClient());
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  let userInfo;
  try {
    userInfo = await client.oauth2.getUserInfo();
    await syncTokens(tokenStore, configSource);
  } catch (err) {
    error(`Failed to fetch user info: ${err.message}`);
    process.exit(1);
  }

  const mode = outputMode(values);

  const output = { ...userInfo };
  if (values['show-token']) {
    const tokenSet = await tokenStore.get();
    if (tokenSet?.accessToken) output.accessToken = tokenSet.accessToken;
  }

  if (mode === 'json') {
    printJson(output);
  } else if (mode === 'yaml') {
    printYaml(output);
  } else {
    // Pretty key-value record with custom formatters
    const dateFormat = config.dateFormat ?? 'YYYY-MM-DD HH:mm';
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

/**
 * Format an array of objects as a multi-line list.
 * Each item is shown as "name (rw)" or "name (ro)" on its own line.
 *
 * @param {object[]} items
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
