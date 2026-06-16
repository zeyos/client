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

  const rows = Object.entries(def.fields).map(([name, field]) => {
    const notes = [];
    if (field.fk) notes.push(`→ ${field.fk}`);
    if (field.indexed) notes.push('indexed');
    if (field.enum) {
      notes.push('enum: ' + Object.entries(field.enum).map(([k, v]) => `${k}=${v}`).join(' '));
    }
    return { field: name, type: field.type, notes: notes.join('  ') };
  });

  const operations = s.operations(key);

  process.stdout.write(`\n  ${c.bold(def.name)} ${c.dim(`(${def.type}, ${rows.length} fields)`)}\n`);
  printTable(rows, ['field', 'type', 'notes']);
  if (operations.length > 0) {
    process.stdout.write(`  ${c.bold('operations')}  ${c.dim(operations.join(', '))}\n\n`);
  }
}
