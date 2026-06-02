/**
 * zeyos delete <resource> <id>
 *
 * Delete a record by ID.
 *
 * Options:
 *   --force    Skip confirmation prompt
 */

import { createInterface }         from 'node:readline';
import { buildClient, syncTokens } from '../lib/client.mjs';
import { resolveResource }         from '../lib/resources.mjs';
import { success, error, warn }    from '../lib/output.mjs';

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

  if (!resourceName) {
    error('Missing resource name.  Usage: zeyos delete <resource> <id>');
    process.exit(1);
  }
  if (!id) {
    error('Missing record ID.  Usage: zeyos delete <resource> <id>');
    process.exit(1);
  }

  const res = resolveResource(resourceName);
  if (!res) {
    error(`Unknown resource: "${resourceName}".  Run 'zeyos resources' to see available types.`);
    process.exit(1);
  }
  if (!res.delete) {
    error(`Resource "${resourceName}" does not support deletion.`);
    process.exit(1);
  }

  // ── Confirmation ───────────────────────────────────────────────────────────
  if (!values.force) {
    const confirmed = await _confirm(`Delete ${resourceName} #${id}? [y/N] `);
    if (!confirmed) {
      warn('Aborted.');
      return;
    }
  }

  let client, tokenStore;
  try {
    ({ client, tokenStore } = buildClient());
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  // ── Call API ───────────────────────────────────────────────────────────────
  try {
    const fn = client.api[res.delete];
    if (typeof fn !== 'function') {
      error(`Operation "${res.delete}" is not available on this client.`);
      process.exit(1);
    }
    await fn({ ID: id });
    await syncTokens(tokenStore);
  } catch (err) {
    if (err.status === 404) {
      error(`${resourceName} #${id} not found.`);
    } else {
      error(`API error: ${err.message}`);
    }
    process.exit(1);
  }

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
