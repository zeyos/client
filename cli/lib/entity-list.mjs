/**
 * Shared renderer for the "what can I list?" entity overview.
 *
 * Used by `zeyos resources` and by a bare `zeyos list` — running `list` with no
 * entity is a discovery gesture, not a mistake, so it answers the question
 * instead of printing a usage error.
 */

import { listResourceGroups } from './resources.mjs';
import { colors as c, printJson, printYaml, outputMode } from './output.mjs';

/**
 * Print the grouped entity overview in the caller's output mode.
 *
 * @param {Record<string, unknown>} values - parsed CLI flags (for --json/--yaml)
 * @param {{ heading?: string, footer?: boolean }} [opts]
 */
export function printEntityList(values = {}, opts = {}) {
  const groups = listResourceGroups();
  const mode = outputMode(values);

  // Machine-readable output stays a FLAT array of entities, as it has always
  // been — `.find(e => e.name === 'ticket').operations` must keep working. The
  // grouping is carried per entity rather than nesting them, so consumers gain
  // `group`, `description` and `boundType` without any of them having to change.
  if (mode === 'json' || mode === 'yaml') {
    const flat = groups.flatMap((group) =>
      group.entities.map((entity) => ({
        name: entity.name,
        group: group.label,
        ...(entity.description ? { description: entity.description } : {}),
        ...(entity.boundType === undefined ? {} : { transactionType: entity.boundType }),
        operations: entity.operations
      }))
    );
    if (mode === 'json') printJson(flat);
    else printYaml(flat);
    return;
  }

  const width = Math.max(
    ...groups.flatMap((g) => g.entities.map((e) => e.name.length))
  );

  if (opts.heading) {
    process.stdout.write(`\n${opts.heading}\n`);
  }

  for (const group of groups) {
    process.stdout.write(`\n  ${c.bold(group.label)}\n`);
    for (const entity of group.entities) {
      // Pseudo-entities show the transactions.type they bind, so the mapping to
      // the underlying table is never a mystery.
      const bound = entity.boundType === undefined
        ? ''
        : c.gray(` (transactions type ${entity.boundType})`);
      const desc = entity.description ? c.dim(entity.description) : '';
      process.stdout.write(`    ${c.cyan(entity.name.padEnd(width))}  ${desc}${bound}`.trimEnd() + '\n');
    }
  }

  if (opts.footer !== false) {
    process.stdout.write(
      `\n  ${c.dim('Singular, plural and hyphenated spellings all work (billing_invoice, billing-invoices).')}\n` +
      `  ${c.dim('Run')} ${c.cyan('zeyos describe <entity>')} ${c.dim('for its fields, types and enum values.')}\n\n`
    );
  }
}
