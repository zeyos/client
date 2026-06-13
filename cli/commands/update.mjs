/**
 * zeyos update <resource> <id> [--data <json>] [--field value …]
 *
 * Update an existing record.  Works like `create` but requires an ID.
 *
 * Options:
 *   --data <json>    Fields to update as a JSON object
 *   --json           Output updated record as JSON
 *   --yaml           Output updated record as YAML
 */

import { buildClient, syncTokens }        from '../lib/client.mjs';
import { resolveResource }                from '../lib/resources.mjs';
import { collectFieldFlags }              from '../lib/flags.mjs';
import { outputMode, printJson, printYaml, printRecord, success, error } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos update <resource> <id> [options]

Update an existing record.

Arguments:
  resource            Resource name (e.g. ticket, account)
  id                  Record ID

Options:
  --data <json>       Fields to update as a JSON object
  --<field> <value>   Set individual fields  e.g. --status 2
  --json              Output updated record as JSON
  --yaml              Output updated record as YAML
  -h, --help          Show this help

Examples:
  zeyos update ticket 42 --status 3
  zeyos update account 7 --data '{"email":"new@example.com"}'
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const id           = positional[1];

  if (!resourceName) {
    error('Missing resource name.  Usage: zeyos update <resource> <id>');
    process.exit(1);
  }
  if (!id) {
    error('Missing record ID.  Usage: zeyos update <resource> <id>');
    process.exit(1);
  }

  const res = resolveResource(resourceName);
  if (!res) {
    error(`Unknown resource: "${resourceName}".  Run 'zeyos resources' to see available types.`);
    process.exit(1);
  }
  if (!res.update) {
    error(`Resource "${resourceName}" does not support updates.`);
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

  Object.assign(data, collectFieldFlags(values));

  if (Object.keys(data).length === 0) {
    error('No fields provided.  Use --data or individual --<field> flags.');
    process.exit(1);
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  let record;
  try {
    const fn = client.api[res.update];
    if (typeof fn !== 'function') {
      error(`Operation "${res.update}" is not available on this client.`);
      process.exit(1);
    }
    record = await fn({ ID: id, body: data });
    await syncTokens(tokenStore, configSource);
  } catch (err) {
    if (err.status === 404) {
      error(`${resourceName} #${id} not found.`);
    } else {
      error(`API error: ${err.message}`);
    }
    process.exit(1);
  }

  const mode = outputMode(values);

  if (mode === 'json') {
    printJson(record ?? { ID: id, ...data });
  } else if (mode === 'yaml') {
    printYaml(record ?? { ID: id, ...data });
  } else {
    success(`Updated ${resourceName} #${id}.`);
    if (record) printRecord(record, res.fields);
  }
}
