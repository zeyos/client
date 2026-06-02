/**
 * zeyos resources
 *
 * List all resource types known to the CLI.
 */

import { listResources, resolveResource } from '../lib/resources.mjs';
import { colors as c }                   from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos resources

List all resource types available for use with list/get/create/update/delete.
`;

export function run(_values) {
  const names = listResources();

  process.stdout.write('\n');
  process.stdout.write(`  ${c.bold('RESOURCE')}          ${c.bold('OPERATIONS')}\n`);
  process.stdout.write(`  ${'─'.repeat(16)}  ${'─'.repeat(32)}\n`);

  for (const name of names) {
    const res = resolveResource(name);
    const ops = ['list', 'get', 'create', 'update', 'delete']
      .filter(op => res[op])
      .join(', ');
    process.stdout.write(`  ${name.padEnd(16)}  ${c.dim(ops)}\n`);
  }

  process.stdout.write('\n');
}
