/**
 * zeyos resources
 *
 * List all resource types known to the CLI.
 */

import { listResources, resolveResource } from '../lib/resources.mjs';
import { colors as c, outputMode, printJson, printYaml } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos resources

List all resource types available for use with list/get/create/update/delete.
`;

export function run(values) {
  const resources = listResources().map((name) => {
    const res = resolveResource(name);
    const operations = ['list', 'get', 'create', 'update', 'delete']
      .filter(op => res[op]);

    return { name, operations };
  });

  const mode = outputMode(values);
  if (mode === 'json') {
    printJson(resources);
    return;
  }
  if (mode === 'yaml') {
    printYaml(resources);
    return;
  }

  process.stdout.write('\n');
  process.stdout.write(`  ${c.bold('RESOURCE')}          ${c.bold('OPERATIONS')}\n`);
  process.stdout.write(`  ${'─'.repeat(16)}  ${'─'.repeat(32)}\n`);

  for (const resource of resources) {
    process.stdout.write(`  ${resource.name.padEnd(16)}  ${c.dim(resource.operations.join(', '))}\n`);
  }

  process.stdout.write('\n');
}
