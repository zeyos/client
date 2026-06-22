/**
 * zeyos count <resource>
 *
 * Return the count of records matching an optional filter.
 *
 * Options:
 *   --filter <json>       JSON filter object  e.g. '{"status":1}'
 *   --filter-file <path>  Read JSON filter object from a file
 *   --json                Output as JSON
 *   --yaml                Output as YAML
 */

import { normalizeCountResult }    from '@zeyos/client';
import { buildCliClient, callApi, maybeDryRun, parseJsonOptionOrFile, requireResource } from '../lib/command.mjs';
import { outputMode, printJson, printYaml } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos count <resource> [options]

Return the number of records matching an optional filter.

Arguments:
  resource            Resource name (e.g. tickets, accounts, tasks)

Options:
  --filter <json>     JSON filter object  e.g. '{"status":1}'
  --filter-file <path>
                      Read JSON filter object from a file
  --json              Output as JSON ({ "count": N })
  --yaml              Output as YAML
  --query             Print the request route + JSON body without sending it
  -h, --help          Show this help

Examples:
  zeyos count tickets
  zeyos count tickets --filter '{"status":1}'
  zeyos count tickets --filter-file ./filters/open-tickets.json
  zeyos count accounts --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const res = requireResource(resourceName, 'zeyos count <resource>');

  // ── Build request body ─────────────────────────────────────────────────────
  const body = { count: true };

  const filters = parseJsonOptionOrFile(values, 'filter', 'filter-file');
  if (filters !== undefined) {
    body.filters = filters;
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  const clientState = buildCliClient(values);
  if (await maybeDryRun(clientState, res.list, body, values)) return;

  const result = await callApi(clientState, res.list, body);

  const count = normalizeCountResult(result);

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
