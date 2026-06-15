/**
 * zeyos delete <resource> <id>
 *
 * Delete a record by ID.
 *
 * Options:
 *   --force    Skip confirmation prompt
 */

import { createInterface }         from 'node:readline';
import { buildCliClient, callApi, requireRecordId, requireResource } from '../lib/command.mjs';
import { success, warn }           from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos delete <resource> <id> [options]

Delete a record by ID.

Arguments:
  resource            Resource name (e.g. ticket, account)
  id                  Record ID

Options:
  --force             Skip confirmation prompt
  -h, --help          Show this help

Examples:
  zeyos delete ticket 42
  zeyos delete account 7 --force
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const id           = positional[1];

  const res = requireResource(resourceName, 'zeyos delete <resource> <id>', 'delete', 'deletion');
  requireRecordId(id, 'zeyos delete <resource> <id>');

  // ── Confirmation ───────────────────────────────────────────────────────────
  if (!values.force) {
    const confirmed = await _confirm(`Delete ${resourceName} #${id}? [y/N] `);
    if (!confirmed) {
      warn('Aborted.');
      return;
    }
  }

  const clientState = buildCliClient();

  // ── Call API ───────────────────────────────────────────────────────────────
  await callApi(clientState, res.delete, { ID: id }, {
    notFoundMessage: `${resourceName} #${id} not found.`
  });

  success(`Deleted ${resourceName} #${id}.`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _confirm(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
