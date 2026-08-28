/**
 * zeyos find <resource> <text>
 *
 * Resolve human-readable text to records using the API's full-text query.
 */

import { normalizeListResult } from '@zeyos/client';
import { canonicalName } from '../lib/resources.mjs';
import { getListFields } from '../lib/resource-config.mjs';
import {
  buildCliClient,
  callApi,
  fail,
  maybeDryRun,
  parseIntegerOption,
  requireNoExtraPositionals,
  requireResource
} from '../lib/command.mjs';
import { info, outputMode, printJson, printTable, printYaml } from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos find <resource> <text> [options]

Resolve human-readable text to records using full-text search.

Arguments:
  resource            Resource name (e.g. accounts, projects, tickets)
  text                Text to find

Options:
  --limit <n>         Maximum matches (default: 10)
  --fields <list>     Field selection
  --json              Output raw rows as JSON
  --yaml              Output raw rows as YAML
  --dry-run           Print the request route + JSON body without sending it
  --no-validate       Skip schema validation
  -h, --help          Show this help

Examples:
  zeyos find accounts "Zfx Lyon"
  zeyos find projects "Website" --json
`;

export async function run(values, positional) {
  const resourceName = positional[0];
  const text = positional[1];
  const res = requireResource(resourceName, 'zeyos find <resource> <text>');
  if (text == null || text === '') fail('Missing search text.  Usage: zeyos find <resource> <text>');
  requireNoExtraPositionals(positional, 2, 'zeyos find <resource> "<text>"');

  const limit = values.limit == null ? 10 : parseIntegerOption(values.limit, '--limit', { min: 1 });

  const selection = getListFields(res, canonicalName(resourceName), values.fields);
  const displayColumns = selection.displayColumns.includes('ID')
    ? selection.displayColumns
    : ['ID', ...selection.displayColumns];
  const fields = selection.apiFields
    ? { ID: 'ID', ...selection.apiFields }
    : displayColumns;
  const body = { query: text, limit, fields };
  // Keep a pseudo-entity's type binding in force, so `find billing_invoices`
  // searches invoices rather than every transaction.
  if (res.boundFilters) body.filters = { ...res.boundFilters };
  const clientState = buildCliClient(values);
  if (await maybeDryRun(clientState, res.list, body, values)) return;

  const rows = normalizeListResult(await callApi(clientState, res.list, body)).data;
  const mode = outputMode(values);
  if (mode === 'json') printJson(rows);
  else if (mode === 'yaml') printYaml(rows);
  else if (rows.length > 0) printTable(rows, displayColumns);

  if (rows.length === 0) {
    info(`No matches for "${text}" in ${resourceName}.`);
    return;
  }
  info(`Use the ID in follow-up filters, e.g. zeyos list <resource> --filter '{"<fk-field>":<ID>}'`);
}
