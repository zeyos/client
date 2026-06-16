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

import {
  buildCliClient,
  buildRecordPayload,
  callApi,
  requireRecordId,
  requireResource
} from '../lib/command.mjs';
import { outputMode, printJson, printYaml, printRecord, success } from '../lib/output.mjs';

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

  const res = requireResource(resourceName, 'zeyos update <resource> <id>', 'update', 'updates');
  requireRecordId(id, 'zeyos update <resource> <id>');

  // ── Build data payload ─────────────────────────────────────────────────────
  // Validate input before requiring credentials.  positional[2] is the
  // (optional) JSON body some callers pass positionally instead of via --data.
  const data = buildRecordPayload(values, positional[2]);

  const clientState = buildCliClient();

  // ── Call API ───────────────────────────────────────────────────────────────
  const record = await callApi(clientState, res.update, { ID: id, body: data }, {
    notFoundMessage: `${resourceName} #${id} not found.`
  });

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
