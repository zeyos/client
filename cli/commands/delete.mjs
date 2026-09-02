/**
 * zeyos delete <resource> <id>
 *
 * Delete a record by ID.
 *
 * Options:
 *   --force    Skip confirmation prompt
 */

import { createInterface }         from 'node:readline';
import {
  buildCliClient,
  callApi,
  maybeDryRun,
  requireNoExtraPositionals,
  requireRecordId,
  requireResource,
  verifyBoundTypeBeforeWrite
} from '../lib/command.mjs';
import { success, warn }           from '../lib/output.mjs';
import { EXIT }                    from '../lib/exit.mjs';

export const USAGE = `\
Usage: zeyos delete <resource> <id> [options]

Delete a record by ID.

Arguments:
  resource            Resource name (e.g. ticket, account)
  id                  Record ID

Options:
  --force, --yes      Skip confirmation prompt
  --dry-run           Print the request route + JSON body without sending it
  --no-validate       Skip schema validation
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
  requireNoExtraPositionals(positional, 2, 'zeyos delete <resource> <id>');

  const clientState = buildCliClient(values);

  // ── Dry run ────────────────────────────────────────────────────────────────
  // Show the request without prompting or deleting anything.
  if (await maybeDryRun(clientState, res.delete, { ID: id }, values)) return;

  // Check the target really is this entity BEFORE prompting, so the confirmation
  // never describes the record as something it is not.
  await verifyBoundTypeBeforeWrite(clientState, res, resourceName, id, 'delete');

  // ── Confirmation ───────────────────────────────────────────────────────────
  // `--yes` is the convention in apt/gh/npm, so an agent reaches for it before
  // `--force`. Accept both rather than failing on the more idiomatic one.
  const skipPrompt = values.force || values.yes;
  if (!skipPrompt) {
    const confirmed = await _confirm(`Delete ${resourceName} #${id}? [y/N] `);
    if (!confirmed) {
      // Exit non-zero: with stdin closed (CI, a pipe) readline answers with an
      // empty string, and a silent exit 0 would tell the caller the delete
      // succeeded. Use --force to delete non-interactively.
      warn('Aborted.');
      process.exit(EXIT.ABORTED);
    }
  }

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
    let answered = false;

    // With stdin already closed (CI, `< /dev/null`) the question callback never
    // fires: the promise would never settle, the event loop would drain, and the
    // process would exit 0 having deleted nothing. Treat close as "not confirmed".
    rl.on('close', () => {
      if (!answered) {
        answered = true;
        resolve(false);
      }
    });

    rl.question(prompt, answer => {
      if (answered) return;
      answered = true;
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
