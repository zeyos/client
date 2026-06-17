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

import { buildCliClient, buildRecordPayload, callApi, maybeDryRun, requireResource } from '../lib/command.mjs';
import { outputMode, printJson, printYaml, printRecord, success } from '../lib/output.mjs';

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
  --query             Print the request route + JSON body without sending it
  -h, --help          Show this help

Examples:
  zeyos create ticket --name "Fix login bug" --status 0 --priority 2
  zeyos create account --data '{"lastname":"Acme Corp","email":"info@acme.com"}'
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const res = requireResource(resourceName, 'zeyos create <resource>', 'create', 'creation');

  // ── Build data payload ─────────────────────────────────────────────────────
  // Validate input before requiring credentials.  positional[1] is the
  // (optional) JSON body some callers pass positionally instead of via --data.
  const data = buildRecordPayload(values, positional[1]);

  const clientState = buildCliClient();

  // ── Call API ───────────────────────────────────────────────────────────────
  if (await maybeDryRun(clientState, res.create, data, values)) return;

  const record = await callApi(clientState, res.create, data);

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
