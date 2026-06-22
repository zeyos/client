/**
 * zeyos list <resource>
 *
 * Query a collection of records.
 *
 * Options:
 *   --fields <list>        Field selection (comma-separated or JSON object)
 *   --filter <json>        JSON filter object  e.g. '{"status":1}'
 *   --filter-file <path>   Read JSON filter object from a file
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
import { outputMode, printJson, printYaml, printTable, buildDateFormatters, buildEnumFormatters, info } from '../lib/output.mjs';
import {
  buildCliClient,
  callApi,
  fail,
  maybeDryRun,
  parseJsonOptionOrFile,
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
  --filter-file <path>
                      Read JSON filter object from a file
  --sort <fields>     Sort expression  e.g. '-lastmodified'
  --limit <n>         Max records (default: 50)
  --offset <n>        Skip first N records (default: 0)
  --extdata           Include extended data fields
  --expand <list>     Expand JSON/binary columns (e.g. binfile, items)
  --json              Output as JSON
  --yaml              Output as YAML
  --query             Print the request route + JSON body without sending it
  -h, --help          Show this help

Fields format:
  Comma-separated:    --fields ID,name,status,duedate
  JSON object:        --fields '{"Id": "ID", "Name": "name", "City": "contact.city"}'
  JSON array:         --fields '["ID", "name", "status"]'

Examples:
  zeyos list tickets
  zeyos list tickets --filter '{"status":1}' --sort -lastmodified
  zeyos list tickets --filter-file ./filters/open-tickets.json
  zeyos list tickets --fields ID,name,status --limit 10
  zeyos list accounts --fields '{"Name": "lastname", "City": "contact.city"}'
  zeyos list tickets --extdata
  zeyos list accounts --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const res = requireResource(resourceName, 'zeyos list <resource>');

  const resName = canonicalName(resourceName);

  // ── Resolve field config ──────────────────────────────────────────────────
  const { apiFields, displayColumns } = getListFields(res, resName, values.fields);

  // ── Build request body ─────────────────────────────────────────────────────
  const body = {};

  // Pass configured fields to the API for server-side field selection
  if (apiFields) body.fields = apiFields;

  const filters = parseJsonOptionOrFile(values, 'filter', 'filter-file');
  if (filters !== undefined) {
    body.filters = filters;
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
  const clientState = buildCliClient(values);
  if (await maybeDryRun(clientState, res.list, body, values)) return;

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
  } else if (records.length === 0) {
    // QW-7: an empty result is a neutral fact, not a warning — use the info `·`
    // glyph rather than the `⚠` glyph (which reads as an error).
    info(`No ${resourceName} match.`);
    return;
  } else {
    const cfg = loadConfig();
    const dateFormat = cfg.dateFormat ?? 'YYYY-MM-DD';
    const dateFormatters = buildDateFormatters(displayColumns, dateFormat, apiFields);

    // QW-3: schema-driven enum/ID coloring. Resolve the resource's field defs
    // (enums, FKs) via the same schema source `describe` uses, then color enum
    // values by label keyword and dim ID/FK columns. No-op when color is off.
    // Date formatters win for date columns (a column is never both).
    const schema = clientState.client.schema;
    const schemaKey = schema?.resourceForOperation?.(res.list);
    const fieldDefs = schemaKey ? schema.describe(schemaKey)?.fields : undefined;
    const enumFormatters = fieldDefs
      ? buildEnumFormatters(displayColumns, fieldDefs, apiFields)
      : {};

    printTable(records, displayColumns, {}, { ...enumFormatters, ...dateFormatters });
  }

  // ── Pagination / truncation hint ──────────────────────────────────────────
  // Emitted to stderr in EVERY output mode (including --json), so an agent that
  // pipes `list … --json` into a counter gets a signal that the default
  // --limit truncated the result, instead of a silently-wrong total. For a
  // "how many?" question, `zeyos count <resource>` returns the true total.
  const from = offset + 1;
  const to   = offset + records.length;

  if (records.length >= limit) {
    try {
      const countBody = { count: true };
      if (body.filters) countBody.filters = body.filters;
      const countResult = await fn(countBody);
      const total = countResult?.count ?? null;
      if (total !== null && total > records.length) {
        info(`→ Showing ${from}–${to} of ${total}  (default --limit ${limit} truncated this — pass --limit, --offset ${to} for the next page, or use \`zeyos count ${resourceName}\` for the total).`);
      } else if (total !== null) {
        info(`→ Showing ${from}–${to} of ${total}  (--offset ${to} for next page)`);
      }
    } catch {
      // Non-critical — skip pagination info
    }
  } else if (offset > 0) {
    info(`→ Showing ${from}–${to} of ${to}`);
  }
}
