/**
 * zeyos sum <resource> <field>
 *
 * Page through records and sum one numeric field client-side.
 */

import { normalizeListResult } from '@zeyos/client';
import {
  buildCliClient,
  callApi,
  fail,
  maybeDryRun,
  normalizeFilterOperators,
  parseJsonOptionOrFile,
  requireResource
} from '../lib/command.mjs';
import { outputMode, printJson, printYaml } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos sum <resource> <field> [options]

Sum a numeric field across all records matching an optional filter.
The CLI pages internally so agents do not need to list rows and write ad hoc scripts.

Arguments:
  resource            Resource name (e.g. actionsteps, transactions, payments)
  field               Numeric field to sum (e.g. effort, amount, netamount)

Options:
  --filter <json>     JSON filter object  e.g. '{"status":[1,3]}'
                      Arrays normalize to IN; $lt/$lte/$gt/$gte/$ne/$in/$nin and suffix
                      keys like field__startswith/field__gt normalize to native operators
  --filter-file <path>
                      Read JSON filter object from a file
  --page-size <n>     Records per API page (default: 50)
  --limit <n>         Maximum records to inspect
  --offset <n>        Initial offset (default: 0)
  --json              Output as JSON ({ "sum": N, "count": N })
  --yaml              Output as YAML
  --query             Print the first page request without sending it
  -h, --help          Show this help

Examples:
  zeyos sum actionsteps effort --filter '{"status":[1,3]}'
  zeyos sum transactions netamount --filter '{"type":3}' --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const field = positional[1];
  const res = requireResource(resourceName, 'zeyos sum <resource> <field>');
  if (!field) fail('Missing field name.  Usage: zeyos sum <resource> <field>');

  const pageSize = parsePositiveInt(values['page-size'] ?? '50', '--page-size');
  const maxRows = values.limit == null ? Infinity : parsePositiveInt(values.limit, '--limit');
  let offset = values.offset == null ? 0 : parseNonNegativeInt(values.offset, '--offset');

  const body = { fields: [field], limit: Math.min(pageSize, maxRows), offset };
  const filters = parseJsonOptionOrFile(values, 'filter', 'filter-file');
  if (filters !== undefined) body.filters = normalizeFilterOperators(filters, { fieldAliases: res.filterAliases });

  const clientState = buildCliClient(values);
  if (await maybeDryRun(clientState, res.list, body, values)) return;

  let sum = 0;
  let count = 0;

  while (count < maxRows) {
    const remaining = maxRows - count;
    const limit = Math.min(pageSize, remaining);
    const pageBody = { ...body, limit, offset };
    const result = await callApi(clientState, res.list, pageBody);
    const rows = normalizeListResult(result).data;

    for (const row of rows) {
      sum += numericValue(row[field], field);
      count += 1;
      if (count >= maxRows) break;
    }

    if (rows.length < limit || rows.length === 0) break;
    offset += rows.length;
  }

  const mode = outputMode(values);
  if (mode === 'json') {
    printJson({ sum, count, field });
  } else if (mode === 'yaml') {
    printYaml({ sum, count, field });
  } else {
    process.stdout.write(`${sum}\n`);
  }
}

function numericValue(value, field) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`Field "${field}" contains a non-numeric value: ${JSON.stringify(value)}`);
  return n;
}

function parsePositiveInt(value, flag) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n <= 0) fail(`${flag} must be a positive integer.`);
  return n;
}

function parseNonNegativeInt(value, flag) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 0) fail(`${flag} must be a non-negative integer.`);
  return n;
}
