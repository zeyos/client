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

import { normalizeCountResult, normalizeListResult } from '@zeyos/client';
import { loadConfig }                    from '../lib/config.mjs';
import { canonicalName }                 from '../lib/resources.mjs';
import { getListFields }                 from '../lib/resource-config.mjs';
import { outputMode, printJson, printYaml, printTable, buildDateFormatters, buildEnumFormatters, buildNumberFormatters, info, colors as _c } from '../lib/output.mjs';
import { printEntityList }            from '../lib/entity-list.mjs';
import {
  buildCliClient,
  buildPresetFilters,
  callApi,
  fail,
  maybeDryRun,
  parseIntegerOption,
  parseJsonOptionOrFile,
  requireApiMethod,
  requireNoExtraPositionals,
  requireResource
} from '../lib/command.mjs';

export const USAGE = `\
Usage: zeyos list <entity> [options]

List records of a given entity type. Run \`zeyos list\` with no entity for the
full list of what you can query.

Arguments:
  entity              Entity name (e.g. tickets, accounts, billing_invoices)

Options:
  --fields <list>     Field selection (see formats below)
  --filter <json>     JSON filter object  e.g. '{"status":1}'
                      Arrays normalize to IN; $lt/$lte/$gt/$gte/$ne/$in/$nin and suffix
                      keys like field__startswith/field__gt normalize to native operators
  --filter-file <path>
                      Read JSON filter object from a file
  --search <text>     Full-text search
  --preset <name>     Apply a business filter preset before --filter
  --sort <fields>     Sort expression  e.g. '-lastmodified'
  --limit <n>         Max records (default: 50)
  --offset <n>        Skip first N records (default: 0)
  --extdata           Include extended data fields
  --expand <list>     Expand JSON/binary columns (e.g. binfile, items)
  --json              Output as JSON
  --yaml              Output as YAML
  --dry-run           Print the request route + JSON body without sending it
  --no-validate       Skip schema validation
  -h, --help          Show this help

Fields format:
  Comma-separated:    --fields ID,name,status,duedate
  JSON object:        --fields '{"Id": "ID", "Name": "name", "City": "contact.city"}'
  JSON array:         --fields '["ID", "name", "status"]'

Transaction entities:
  Each transaction type is its own entity, so you never filter on \`type\` by hand:
    billing_quotes, billing_orders, billing_deliveries, billing_invoices, billing_credits
    procurement_requests, procurement_orders, procurement_deliveries,
    procurement_invoices, procurement_credits
    production_fabrications, production_disassemblies
  \`invoices\`, \`orders\`, \`quotes\`, \`credits\` and \`deliveries\` are shorthand for the
  billing side; \`bills\` and \`po\` for procurement. Use \`transactions\` for all types.

  Invoice and credit entities accept: --preset open | overdue | paid | draft | booked | cancelled

Examples:
  zeyos list                                    # show every entity you can list
  zeyos list tickets
  zeyos list tickets --filter '{"status":1}' --sort -lastmodified
  zeyos list tickets --filter-file ./filters/open-tickets.json
  zeyos list billing_invoices --preset overdue
  zeyos list procurement_deliveries --limit 20
  zeyos list tickets --fields ID,name,status --limit 10
  zeyos list accounts --fields '{"Name": "lastname", "City": "contact.city"}'
  zeyos list tickets --extdata
  zeyos list accounts --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];

  // `zeyos list` with no entity is how people ask what they can list. Answer it
  // rather than failing with a usage error.
  if (!resourceName) {
    printEntityList(values, { heading: `Usage: ${_c.cyan('zeyos list')} <entity> [options]` });
    return;
  }

  const res = requireResource(resourceName, 'zeyos list <resource>');
  requireNoExtraPositionals(positional, 1, 'zeyos list <entity>');

  const resName = canonicalName(resourceName);

  // ── Resolve field config ──────────────────────────────────────────────────
  const { apiFields, displayColumns } = getListFields(res, resName, values.fields);

  // ── Build request body ─────────────────────────────────────────────────────
  const body = {};

  // Pass configured fields to the API for server-side field selection
  if (apiFields) body.fields = apiFields;

  const filters = buildPresetFilters(
    res,
    resourceName,
    values.preset,
    parseJsonOptionOrFile(values, 'filter', 'filter-file')
  );
  if (filters !== undefined) {
    body.filters = filters;
  }

  if (values.search != null) body.query = values.search;

  if (values.sort) body.sort = values.sort.split(',').map(s => s.trim()).filter(Boolean);

  body.limit = values.limit != null
    ? parseIntegerOption(values.limit, '--limit', { min: 1 })
    : 50;

  if (values.offset != null) {
    body.offset = parseIntegerOption(values.offset, '--offset', { min: 0 });
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

    // Float columns (netamount, amount, sellingprice, …) get grouped thousands
    // and a fixed fraction. Table view only — JSON/YAML keep the raw number.
    const numberFormatters = fieldDefs
      ? buildNumberFormatters(displayColumns, fieldDefs, apiFields, { locale: cfg.locale })
      : {};

    printTable(records, displayColumns, {}, { ...enumFormatters, ...numberFormatters, ...dateFormatters });
  }

  if (records.length === 0 && (values.filter != null || values['filter-file'] != null || values.search != null)) {
    info(`Hint: 0 results. If a filter field or value might be wrong, check 'zeyos describe <resource>' or resolve records with 'zeyos find <resource> "<text>"'.`);
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
      if (body.query) countBody.query = body.query;
      const countResult = await fn(countBody);
      const total = normalizeCountResult(countResult);
      // Compare against the last row actually shown, not the page size: at
      // --offset 40 --limit 10 of 50 total, the result is complete even though
      // the page is full.
      if (total !== null && total > to) {
        const explicitLimit = values.limit != null;
        const why = explicitLimit ? '' : `default --limit ${limit} truncated this — `;
        info(`→ Showing ${from}–${to} of ${total}  (${why}pass --offset ${to} for the next page, or use \`zeyos count ${resourceName}\` for the total).`);
      } else if (total !== null) {
        info(`→ Showing ${from}–${to} of ${total}`);
      }
    } catch {
      // Non-critical — skip pagination info
    }
  } else if (offset > 0) {
    info(`→ Showing ${from}–${to} of ${to}`);
  }
}
