/**
 * zeyos count <resource>
 *
 * Return the count of records matching an optional filter.
 *
 * Options:
 *   --filter <json>   JSON filter object  e.g. '{"status":1}'
 *   --json            Output as JSON
 *   --yaml            Output as YAML
 */

import { buildClient, syncTokens } from '../lib/client.mjs';
import { resolveResource }         from '../lib/resources.mjs';
import { outputMode, printJson, printYaml, error } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos count <resource> [options]

Return the number of records matching an optional filter.

Arguments:
  resource            Resource name (e.g. tickets, accounts, tasks)

Options:
  --filter <json>     JSON filter object  e.g. '{"status":1}'
  --json              Output as JSON ({ "count": N })
  --yaml              Output as YAML
  -h, --help          Show this help

Examples:
  zeyos count tickets
  zeyos count tickets --filter '{"status":1}'
  zeyos count accounts --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  if (!resourceName) {
    error('Missing resource name.  Usage: zeyos count <resource>');
    process.exit(1);
  }

  const res = resolveResource(resourceName);
  if (!res) {
    error(`Unknown resource: "${resourceName}".  Run 'zeyos resources' to see available types.`);
    process.exit(1);
  }

  let client, tokenStore;
  try {
    ({ client, tokenStore } = buildClient());
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  // ── Build request body ─────────────────────────────────────────────────────
  const body = { count: true };

  if (values.filter) {
    try {
      body.filters = JSON.parse(values.filter);
    } catch {
      error(`--filter must be valid JSON.  Got: ${values.filter}`);
      process.exit(1);
    }
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  let result;
  try {
    const fn = client.api[res.list];
    if (typeof fn !== 'function') {
      error(`Operation "${res.list}" is not available on this client.`);
      process.exit(1);
    }
    result = await fn(body);
    await syncTokens(tokenStore);
  } catch (err) {
    error(`API error: ${err.message}`);
    process.exit(1);
  }

  const count = (typeof result === 'object' && result !== null && 'count' in result)
    ? result.count
    : result;

  // ── Output ─────────────────────────────────────────────────────────────────
  const mode = outputMode(values);

  if (mode === 'json') {
    printJson({ count });
  } else if (mode === 'yaml') {
    printYaml({ count });
  } else {
    process.stdout.write(`${count}\n`);
  }
}
