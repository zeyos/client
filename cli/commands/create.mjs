/**
 * zeyos create <resource> [--data <json>] [--field value …]
 *
 * Create a new record.  Field values can be supplied either as:
 *   - a JSON blob via --data '{"name":"foo","status":1}'
 *   - individual --<field> <value> flags (converted automatically)
 *
 * Options:
 *   --data <json>    Full record as JSON object
 *   --json           Output created record as JSON
 *   --yaml           Output created record as YAML
 */

import { buildClient, syncTokens }        from '../lib/client.mjs';
import { resolveResource }                from '../lib/resources.mjs';
import { outputMode, printJson, printYaml, printRecord, success, error } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos create <resource> [options]

Create a new record.

Arguments:
  resource            Resource name (e.g. ticket, account)

Options:
  --data <json>       Record fields as a JSON object
  --<field> <value>   Set individual fields  e.g. --name "My Ticket" --status 1
  --json              Output created record as JSON
  --yaml              Output created record as YAML
  -h, --help          Show this help

Examples:
  zeyos create ticket --name "Fix login bug" --status 0 --priority 2
  zeyos create account --data '{"name":"Acme Corp","email":"info@acme.com"}'
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  if (!resourceName) {
    error('Missing resource name.  Usage: zeyos create <resource>');
    process.exit(1);
  }

  const res = resolveResource(resourceName);
  if (!res) {
    error(`Unknown resource: "${resourceName}".  Run 'zeyos resources' to see available types.`);
    process.exit(1);
  }
  if (!res.create) {
    error(`Resource "${resourceName}" does not support creation.`);
    process.exit(1);
  }

  let client, tokenStore;
  try {
    ({ client, tokenStore } = buildClient());
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  // ── Build data payload ─────────────────────────────────────────────────────
  let data = {};

  if (values.data) {
    try {
      data = JSON.parse(values.data);
    } catch {
      error(`--data must be valid JSON.  Got: ${values.data}`);
      process.exit(1);
    }
  }

  // Merge extra --key value flags (skip known CLI flags)
  const SKIP = new Set([
    'data', 'json', 'yaml', 'help', 'h',
    'no-color', 'force', 'fields', 'filter', 'sort',
    'limit', 'offset', 'expand', 'base-url', 'client-id',
    'secret', 'scope', 'global', 'port', 'manual',
  ]);
  for (const [k, v] of Object.entries(values)) {
    if (!SKIP.has(k)) data[k] = _coerce(v);
  }

  if (Object.keys(data).length === 0) {
    error('No fields provided.  Use --data or individual --<field> flags.');
    process.exit(1);
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  let record;
  try {
    const fn = client.api[res.create];
    if (typeof fn !== 'function') {
      error(`Operation "${res.create}" is not available on this client.`);
      process.exit(1);
    }
    record = await fn(data);
    await syncTokens(tokenStore);
  } catch (err) {
    error(`API error: ${err.message}`);
    process.exit(1);
  }

  const mode = outputMode(values);

  if (mode === 'json') {
    printJson(record);
  } else if (mode === 'yaml') {
    printYaml(record);
  } else {
    const id = record?.ID ?? record?.id ?? '?';
    success(`Created ${resourceName} #${id}.`);
    if (record) printRecord(record, res.fields);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce string values from CLI flags to appropriate JS types. */
function _coerce(v) {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  if (v === 'null')  return null;
  if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}
