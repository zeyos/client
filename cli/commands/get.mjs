/**
 * zeyos get <resource> <id>
 * zeyos show <resource> <id>
 *
 * Fetch and display a single record by ID.
 *
 * Options:
 *   --fields <list>    Fields to display (comma-separated or JSON)
 *   --extdata          Include extended data fields
 *   --tags             Include tags
 *   --expand <list>    Expand JSON/binary columns  e.g. 'binfile'
 *   --all              Fetch all data (extdata, tags, all fields)
 *   --json             Output as JSON
 *   --yaml             Output as YAML
 */

import { loadConfig }                    from '../lib/config.mjs';
import { canonicalName }                 from '../lib/resources.mjs';
import { getGetFields, getGetParams }    from '../lib/resource-config.mjs';
import { outputMode, printJson, printYaml, printRecord, buildDateFormatters, buildEnumFormatters } from '../lib/output.mjs';
import {
  buildCliClient,
  callApi,
  fail,
  maybeDryRun,
  requireRecordId,
  requireResource
} from '../lib/command.mjs';

export const USAGE = `\
Usage: zeyos get <resource> <id> [options]
       zeyos show <resource> <id> [options]

Fetch and display a single record.

Arguments:
  resource            Resource name (e.g. ticket, account)
  id                  Record ID

Options:
  --fields <list>     Fields to display
  --extdata           Include extended data fields
  --tags              Include tags
  --expand <list>     Expand JSON/binary columns (e.g. binfile, items)
  --all               Fetch all data (extdata + tags + all fields)
  --json              Output as JSON
  --yaml              Output as YAML
  --query             Print the request route + JSON body without sending it
  -h, --help          Show this help

Fields format:
  Comma-separated:    --fields ID,name,status,duedate
  JSON object:        --fields '{"Id": "ID", "Name": "name"}'

Examples:
  zeyos get ticket 42
  zeyos get ticket 42 --extdata
  zeyos get ticket 42 --extdata --tags
  zeyos get ticket 42 --all
  zeyos show account 7 --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const id           = positional[1];

  const res = requireResource(resourceName, 'zeyos get <resource> <id>', 'get', 'single-record fetch');
  requireRecordId(id, 'zeyos get <resource> <id>');

  const resName = canonicalName(resourceName);
  const clientState = buildCliClient();

  // ── Build params ───────────────────────────────────────────────────────────
  // GET endpoints use query parameters like ?extdata=1&tags=1 to include
  // additional data.  The `expand` parameter is only for JSON/binary columns.
  const params = { ID: id };

  // Collect query params from CLI flags, config defaults, and --all
  const query = getGetParams(resName);

  // Explicit CLI flags always win
  if (values.extdata) query.extdata = 1;
  if (values.tags)    query.tags = 1;

  // --all includes everything
  if (values.all) {
    query.extdata   = 1;
    query.tags      = 1;
    query.positions = 1;
  }

  // --expand is for JSON/binary column expansion (e.g. binfile, items, data)
  if (values.expand) {
    const expandCols = values.expand.split(',').map(s => s.trim()).filter(Boolean);
    for (const col of expandCols) query[col] = 1;
  }

  if (Object.keys(query).length > 0) {
    params.query = query;
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  if (await maybeDryRun(clientState, res.get, params, values)) return;

  const record = await callApi(clientState, res.get, params, {
    notFoundMessage: `${resourceName} #${id} not found.`
  });

  if (!record) {
    fail(`${resourceName} #${id} not found.`);
  }

  // ── Determine display fields ───────────────────────────────────────────────
  const fieldConfig = values.all ? undefined : getGetFields(resName, values.fields);
  const fields = fieldConfig?.keys;
  const fieldLabels = fieldConfig?.labels ?? {};

  const mode = outputMode(values);

  if (mode === 'json') {
    printJson(record);
  } else if (mode === 'yaml') {
    printYaml(record);
  } else {
    const cfg = loadConfig();
    const dateFormat = cfg.dateFormat ?? 'YYYY-MM-DD';
    const displayKeys = fields ?? Object.keys(record);
    const dateFormatters = buildDateFormatters(displayKeys, dateFormat);

    // QW-3: schema-driven enum/ID coloring in the single-record view too.
    // Enum values are colored by their resolved label keyword; ID/FK fields are
    // dimmed. Date formatters win for date columns. No-op when color is off.
    const schema = clientState.client.schema;
    const schemaKey = schema?.resourceForOperation?.(res.get);
    const fieldDefs = schemaKey ? schema.describe(schemaKey)?.fields : undefined;
    const enumFormatters = fieldDefs ? buildEnumFormatters(displayKeys, fieldDefs) : {};

    printRecord(record, displayKeys, fieldLabels, { ...enumFormatters, ...dateFormatters });
  }
}
