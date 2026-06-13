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
import { collectFieldFlags }              from '../lib/flags.mjs';
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
  zeyos create account --data '{"lastname":"Acme Corp","email":"info@acme.com"}'
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

  let client, tokenStore, configSource;
  try {
    ({ client, tokenStore, configSource } = buildClient());
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

  // Merge extra --<field> value flags on top of any --data payload
  Object.assign(data, collectFieldFlags(values));

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
    await syncTokens(tokenStore, configSource);
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
