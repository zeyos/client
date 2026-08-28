/**
 * zeyos resources
 *
 * List all entity types known to the CLI, grouped by business area.
 */

import { printEntityList } from '../lib/entity-list.mjs';

export const USAGE = `\
Usage: zeyos resources [options]

List all entity types available for use with list/get/create/update/delete.

Transaction types (invoices, orders, deliveries…) are exposed as their own
entities — \`billing_invoices\`, \`procurement_deliveries\` and so on — each bound
to the matching \`transactions.type\`. Use \`transactions\` to query every type at once.

Options:
  --json              Output as JSON (grouped, with bound transaction types)
  --yaml              Output as YAML
  -h, --help          Show this help

Examples:
  zeyos resources
  zeyos resources --json
  zeyos list                     # same overview
  zeyos describe billing_invoice # fields, types and enum values
`;

export function run(values) {
  printEntityList(values);
}
