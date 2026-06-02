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

import { buildClient, syncTokens }        from '../lib/client.mjs';
import { loadConfig }                    from '../lib/config.mjs';
import { resolveResource, canonicalName } from '../lib/resources.mjs';
import { getGetFields, getGetParams }    from '../lib/resource-config.mjs';
import { outputMode, printJson, printYaml, printRecord, buildDateFormatters, error } from '../lib/output.mjs';

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

  if (!resourceName) {
    error('Missing resource name.  Usage: zeyos get <resource> <id>');
    process.exit(1);
  }
  if (!id) {
    error('Missing record ID.  Usage: zeyos get <resource> <id>');
    process.exit(1);
  }

  const res = resolveResource(resourceName);
  if (!res) {
    error(`Unknown resource: "${resourceName}".  Run 'zeyos resources' to see available types.`);
    process.exit(1);
  }
  if (!res.get) {
    error(`Resource "${resourceName}" does not support single-record fetch.`);
    process.exit(1);
  }

  const resName = canonicalName(resourceName);

  let client, tokenStore;
  try {
    ({ client, tokenStore } = buildClient());
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  // ── Build params ───────────────────────────────────────────────────────────
  // GET endpoints use query parameters like ?extdata=1&tags=1 to include
  // additional data.  The `expand` parameter is only for JSON/binary columns.
  const params = { ID: id };

  // Collect query params from CLI flags, config defaults, and --all
  const query = getGetParams(resName, values);

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
  let record;
  try {
    const fn = client.api[res.get];
    if (typeof fn !== 'function') {
      error(`Operation "${res.get}" is not available on this client.`);
      process.exit(1);
    }
    record = await fn(params);
    await syncTokens(tokenStore);
  } catch (err) {
    if (err.status === 404) {
      error(`${resourceName} #${id} not found.`);
    } else {
      error(`API error: ${err.message}`);
    }
    process.exit(1);
  }

  if (!record) {
    error(`${resourceName} #${id} not found.`);
    process.exit(1);
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
    const formatters = buildDateFormatters(displayKeys, dateFormat);
    printRecord(record, displayKeys, fieldLabels, formatters);
  }
}
