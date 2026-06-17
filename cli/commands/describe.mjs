/**
 * zeyos describe <resource>
 *
 * Print a resource's schema — fields, types, foreign keys, enums — straight
 * from the generated schema. Works offline (no login required), so an agent
 * can discover the data model before making any call.
 */

import { createZeyosClient } from '@zeyos/client';
import { resolveResource } from '../lib/resources.mjs';
import { colors as c, outputMode, printJson, printYaml, printTable, error } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos describe <resource> [options]

Show the fields, types, foreign keys and enum values for a resource.
Runs offline — no authentication required.

Arguments:
  resource            Resource name (e.g. ticket, tickets, account)

Options:
  --json              Output as JSON
  --yaml              Output as YAML
  -h, --help          Show this help

Examples:
  zeyos describe tickets
  zeyos describe accounts --json
`;

let cachedSchema;
function schema() {
  if (!cachedSchema) {
    cachedSchema = createZeyosClient({ auth: { mode: 'none' } }).schema;
  }
  return cachedSchema;
}

/**
 * Resolve a user-supplied resource name to the canonical schema key, honoring the
 * same singular/plural/alias rules the other commands use (`create`, `update`,
 * `list` go through resolveResource). Without this, `describe` was the lone command
 * that rejected singular/alias names — `describe ticket` failed while `create
 * ticket` worked. Order: exact schema match → CLI registry → bridge an operationId
 * back to its schema resource.
 */
function schemaKeyFor(s, input) {
  if (s.describe(input)) return input;
  const def = resolveResource(input);
  if (def) {
    const op = def.list || def.get || def.create || def.update || def.delete;
    const key = op ? s.resourceForOperation(op) : null;
    if (key && s.describe(key)) return key;
  }
  return null;
}

export function run(values, positional = []) {
  const resource = positional[0];
  const s = schema();

  if (!resource) {
    error('A resource is required. Example: zeyos describe tickets  (run "zeyos resources" to list common ones)');
    process.exit(1);
  }

  const key = schemaKeyFor(s, resource);
  if (!key) {
    error(`Unknown resource "${resource}". Run "zeyos resources" for common resources.`);
    process.exit(1);
  }
  const def = s.describe(key);

  const mode = outputMode(values);
  if (mode === 'json') {
    printJson(def);
    return;
  }
  if (mode === 'yaml') {
    printYaml(def);
    return;
  }

  // Keep the join-critical flags (→ fk, indexed, enum) in the table, but keep
  // the `enum:` note SHORT so the long value list never blows out the column.
  // The full enum values are printed below the table (see `enumDetails`), so FK
  // and index flags stay legible in-line and the enum codes remain discoverable.
  const enumDetails = [];
  const rows = Object.entries(def.fields).map(([name, field]) => {
    const notes = [];
    if (field.fk) notes.push(`→ ${field.fk}`);
    if (field.indexed) notes.push('indexed');
    if (field.enum) {
      const count = Object.keys(field.enum).length;
      notes.push(`enum (${count})`);
      enumDetails.push({ name, values: field.enum });
    }
    return { field: name, type: field.type, notes: notes.join('  ') };
  });

  const operations = s.operations(key);

  process.stdout.write(`\n  ${c.bold(def.name)} ${c.dim(`(${def.type}, ${rows.length} fields)`)}\n`);
  printTable(rows, ['field', 'type', 'notes']);

  // Full enum values, one field per block, below the table. Each `code = LABEL`
  // pair is on its own line so even long enums (e.g. ticket status) stay readable.
  if (enumDetails.length > 0) {
    process.stdout.write(`  ${c.bold('enums')}\n`);
    for (const { name, values } of enumDetails) {
      process.stdout.write(`    ${c.cyan(name)}\n`);
      for (const [code, label] of Object.entries(values)) {
        process.stdout.write(`      ${c.dim(code.padStart(2))}  ${label}\n`);
      }
    }
    process.stdout.write('\n');
  }

  if (operations.length > 0) {
    process.stdout.write(`  ${c.bold('operations')}  ${c.dim(operations.join(', '))}\n\n`);
  }
}
