/**
 * zeyos list <resource>
 *
 * Query a collection of records.
 *
 * Options:
 *   --fields <list>        Field selection (comma-separated or JSON object)
 *   --filter <json>        JSON filter object  e.g. '{"status":1}'
 *   --sort <field>         Sort field, prefix with - for descending  e.g. '-lastmodified'
 *   --limit <n>            Max records to fetch  (default: 50)
 *   --offset <n>           Skip first N records  (default: 0)
 *   --extdata              Include extended data fields
 *   --expand <list>        Expand JSON/binary columns  e.g. 'binfile'
 *   --json                 Output as JSON
 *   --yaml                 Output as YAML
 */

import { normalizeListResult }            from '@zeyos/client';
import { loadConfig }                    from '../lib/config.mjs';
import { canonicalName }                 from '../lib/resources.mjs';
import { getListFields }                 from '../lib/resource-config.mjs';
import { outputMode, printJson, printYaml, printTable, buildDateFormatters, warn, info } from '../lib/output.mjs';
import {
  buildCliClient,
  callApi,
  fail,
  parseJsonOption,
  requireApiMethod,
  requireResource
} from '../lib/command.mjs';

export const USAGE = `\
Usage: zeyos list <resource> [options]

List records of a given resource type.

Arguments:
  resource            Resource name (e.g. tickets, accounts, tasks)

Options:
  --fields <list>     Field selection (see formats below)
  --filter <json>     JSON filter object  e.g. '{"status":1}'
  --sort <fields>     Sort expression  e.g. '-lastmodified'
  --limit <n>         Max records (default: 50)
  --offset <n>        Skip first N records (default: 0)
  --extdata           Include extended data fields
  --expand <list>     Expand JSON/binary columns (e.g. binfile, items)
  --json              Output as JSON
  --yaml              Output as YAML
  -h, --help          Show this help

Fields format:
  Comma-separated:    --fields ID,name,status,duedate
  JSON object:        --fields '{"Id": "ID", "Name": "name", "City": "contact.city"}'
  JSON array:         --fields '["ID", "name", "status"]'

Examples:
  zeyos list tickets
  zeyos list tickets --filter '{"status":1}' --sort -lastmodified
  zeyos list tickets --fields ID,name,status --limit 10
  zeyos list accounts --fields '{"Name": "lastname", "City": "contact.city"}'
  zeyos list tickets --extdata
  zeyos list accounts --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const res = requireResource(resourceName, 'zeyos list <resource>');

  const resName = canonicalName(resourceName);
  const clientState = buildCliClient();

  // ── Resolve field config ──────────────────────────────────────────────────
  const { apiFields, displayColumns } = getListFields(res, resName, values.fields);

  // ── Build request body ─────────────────────────────────────────────────────
  const body = {};

  // Pass configured fields to the API for server-side field selection
  if (apiFields) body.fields = apiFields;

  if (values.filter) {
    body.filters = parseJsonOption(values.filter, 'filter');
  }

  if (values.sort) body.sort = values.sort.split(',').map(s => s.trim()).filter(Boolean);

  if (values.limit != null) {
    const n = parseInt(values.limit, 10);
    if (isNaN(n)) fail('--limit must be a number.');
    body.limit = n;
  } else {
    body.limit = 50;
  }

  if (values.offset != null) {
    const n = parseInt(values.offset, 10);
    if (isNaN(n)) fail('--offset must be a number.');
    body.offset = n;
  }

  // --extdata includes extended data fields in the response
  if (values.extdata) {
    body.extdata = 1;
  }

  // --expand is for JSON/binary column expansion only (e.g. binfile, items, data)
  if (values.expand) {
    body.expand = values.expand.split(',').map(s => s.trim()).filter(Boolean);
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  const fn = requireApiMethod(clientState, res.list);
  let records = await callApi(clientState, res.list, body);

  records = normalizeListResult(records).data;

  // ── Output ─────────────────────────────────────────────────────────────────
  const mode = outputMode(values);
  const limit  = body.limit ?? 50;
  const offset = body.offset ?? 0;

  if (mode === 'json') {
    printJson(records);
  } else if (mode === 'yaml') {
    printYaml(records);
  } else {
    if (records.length === 0) {
      warn(`No ${resourceName} found.`);
      return;
    }

    const cfg = loadConfig();
    const dateFormat = cfg.dateFormat ?? 'YYYY-MM-DD';
    const formatters = buildDateFormatters(displayColumns, dateFormat, apiFields);
    printTable(records, displayColumns, {}, formatters);

    // ── Pagination info ───────────────────────────────────────────────────
    const from = offset + 1;
    const to   = offset + records.length;

    if (records.length >= limit) {
      // Might have more — fetch total count
      try {
        const countBody = {};
        countBody.count = true;
        if (body.filters) countBody.filters = body.filters;
        const countResult = await fn(countBody);
        const total = countResult?.count ?? null;
        if (total !== null) {
          info(`Showing ${from}–${to} of ${total}  (--offset ${to} for next page)`);
        }
      } catch {
        // Non-critical — skip pagination info
      }
    } else if (offset > 0) {
      info(`Showing ${from}–${to} of ${to}`);
    }
  }
}
