/**
 * zeyos describe <resource>
 *
 * Print a resource's schema — fields, types, foreign keys, enums — straight
 * from the generated schema. Works offline (no login required), so an agent
 * can discover the data model before making any call.
 */

import { createZeyosClient } from '@zeyos/client';
import { canonicalName, resolveResource, suggestResource } from '../lib/resources.mjs';
import { FILTER_VOCABULARY } from '../lib/command.mjs';
import { colors as c, outputMode, printJson, printYaml, printTable, emitError } from '../lib/output.mjs';
import { EXIT } from '../lib/exit.mjs';

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
    emitError('A resource is required. Example: zeyos describe tickets', {
      exitCode: EXIT.USAGE, code: 'usage',
      actions: ["Run 'zeyos list' to see every entity."] });
    process.exit(EXIT.USAGE);
  }

  const key = schemaKeyFor(s, resource);
  if (!key) {
    const suggestion = suggestResource(resource);
    emitError(`Unknown entity "${resource}".` + (suggestion ? `  Did you mean "${suggestion}"?` : ''), {
      exitCode: EXIT.USAGE, code: 'unknown_entity', field: resource,
      ...(suggestion ? { suggestion } : {}),
      actions: ["Run 'zeyos list' to see every entity."] });
    process.exit(EXIT.USAGE);
  }
  const resourceDef = resolveResource(resource);
  const presetNames = Object.keys(resourceDef?.presets || {});
  const schemaDef = s.describe(key);
  const def = presetNames.length ? { ...schemaDef, presets: presetNames } : schemaDef;

  const mode = outputMode(values);
  if (mode === 'json' || mode === 'yaml') {
    // Ship the filter vocabulary with the schema: `describe` is where an agent
    // already looks before writing a query, so it should not have to discover
    // the operator syntax by trial and 400.
    const payload = {
      ...def,
      // Name the entity that was asked about and the slice it denotes. Without
      // these, `describe billing_invoices --json` just says "transactions" and a
      // machine consumer cannot tell it is looking at a bound subset.
      canonicalResource: canonicalName(resource) ?? null,
      ...(resourceDef?.boundFilters ? { boundFilters: resourceDef.boundFilters } : {}),
      ...(resourceDef?.boundFilters?.type === undefined
        ? {}
        : { transactionType: resourceDef.boundFilters.type }),
      filterOperators: FILTER_VOCABULARY
    };
    if (mode === 'json') printJson(payload);
    else printYaml(payload);
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
  const vocab = FILTER_VOCABULARY;

  process.stdout.write(`\n  ${c.bold(def.name)} ${c.dim(`(${def.type}, ${rows.length} fields)`)}\n`);

  // A pseudo-entity describes its underlying table, so say which slice of it the
  // name refers to — otherwise `describe billing_invoice` looks like it ignored
  // the entity and jumped to `transactions`.
  const bound = resourceDef?.boundFilters;
  if (bound?.type !== undefined) {
    process.stdout.write(
      `  ${c.dim(`${resource} is ${def.name} filtered to type ${bound.type}; every field below applies.`)}\n`
    );
  }
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
  if (presetNames.length > 0) {
    process.stdout.write(`  ${c.bold('presets')}  ${c.dim(presetNames.join(', '))}\n\n`);
  }

  // Filter syntax reference. Without it the only way to learn the operator
  // vocabulary is to guess and read the 400 that comes back.
  process.stdout.write(`  ${c.bold('filter operators')}\n`);
  process.stdout.write(`    ${c.dim('native      ')} ${vocab.native.join(' ')}\n`);
  process.stdout.write(`    ${c.dim('translated  ')} ${vocab.translated['value-position'].join(' ')}\n`);
  process.stdout.write(`    ${c.dim('            ')} ${vocab.translated['key-position'].slice(0, 7).join(' ')}\n`);
  process.stdout.write(`    ${c.dim('            ')} ${vocab.translated['key-position'].slice(7).join(' ')}\n`);
  process.stdout.write(`    ${c.dim('composite   ')} ${vocab.translated.composite.join(' ')}  ${c.dim('· field: [a,b] means IN')}\n`);
  for (const note of vocab.notes) {
    process.stdout.write(`    ${c.dim('· ' + note)}\n`);
  }
  process.stdout.write('\n');
}
