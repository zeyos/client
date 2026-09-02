import {
  createZeyosClient,
  normalizeCountResult,
  normalizeListResult,
  ZeyosApiError
} from '@zeyos/client';
import { buildClient, syncTokens } from './client.mjs';
import { assertNoBoundConflict, FILTER_VOCABULARY, prepareResourceFilters, validateInput } from './command.mjs';
import { getListFields } from './resource-config.mjs';
import { canonicalName, listResources, resolveResource, resourceDescription } from './resources.mjs';

const RESOURCE_NAMES = listResources();

/** Bounds for sum_records paging: default budget, hard cap, and rows per request. */
const DEFAULT_SUM_ROWS = 5000;
const MAX_SUM_ROWS = 50000;
const SUM_PAGE_SIZE = 500;
const EMPTY_RESULT_HINT = 'Hint: 0 results. If a filter field or value might be wrong, check \'zeyos describe <resource>\' or resolve records with \'zeyos find <resource> "<text>"\'.';

const RESOURCE_DESCRIPTIONS = {
  account: 'Customer, supplier, and organization accounts.',
  actionstep: 'Worklog and action-step records, including booked effort.',
  address: 'Postal and business addresses linked to accounts or contacts.',
  appointment: 'Calendar appointments and scheduled events.',
  campaign: 'Marketing campaign records.',
  contact: 'People and contact details linked to accounts.',
  customfield: 'Custom-field definitions and metadata.',
  document: 'Business documents such as invoices and document records.',
  dunning: 'Dunning notices for overdue receivables.',
  dunningtransaction: 'Links between dunning notices and transactions.',
  event: 'General ZeyOS event records.',
  file: 'Uploaded file metadata.',
  group: 'User and permission groups.',
  groupuser: 'Membership links between groups and users.',
  invitation: 'User invitation records.',
  item: 'Products, services, and catalog items.',
  mailinglist: 'Marketing mailing lists.',
  mailingrecipient: 'Recipients linked to mailings and campaigns.',
  message: 'Email and communication messages.',
  note: 'Free-form notes attached to business records.',
  opportunity: 'Sales opportunities and pipeline records.',
  payment: 'Payments linked to business transactions.',
  price: 'Item prices assigned through price lists.',
  pricelist: 'Price-list definitions.',
  pricelistaccount: 'Links between price lists and accounts.',
  project: 'Customer and internal projects.',
  storage: 'Storage location records.',
  task: 'Project and ticket tasks.',
  ticket: 'Support, service, and work-request tickets.',
  transaction: 'Quotes, orders, invoices, credits, and related transactions.',
  user: 'ZeyOS user accounts.'
};

let offlineSchema;
function schema() {
  if (!offlineSchema) offlineSchema = createZeyosClient({ auth: { mode: 'none' } }).schema;
  return offlineSchema;
}

const resourceProperty = {
  type: 'string',
  enum: RESOURCE_NAMES,
  description: 'Canonical ZeyOS resource name. Use list_resource_types to discover available values.'
};
const filterProperty = {
  type: 'object',
  description: 'Field filters. Arrays mean IN; common $ operators and field__suffix forms are normalized.',
  additionalProperties: true
};
const presetProperty = {
  type: 'string',
  description: 'Business-vocabulary preset such as open-invoices; caller filters override preset values.'
};

const READ_TOOLS = [
  tool('list_resource_types',
    'Lists the canonical ZeyOS resource names, short descriptions, and available business presets. Use it when you need to discover which data type to query before choosing another tool.',
    objectSchema()),
  tool('describe_resource',
    'Describes a resource’s fields, types, enum values, aliases, presets, and operations using the local schema. Use it before filtering, sorting, summing, or writing whenever field names or enum codes are uncertain.',
    objectSchema({ resource: resourceProperty }, ['resource'])),
  tool('find_records',
    'Finds records by full-text search and returns IDs with useful display fields. Use this FIRST to resolve a human name like a customer or project to its numeric ID before filtering other resources by that ID.',
    objectSchema({
      resource: resourceProperty,
      text: { type: 'string', minLength: 1, description: 'Human-readable text to resolve.' },
      limit: { type: 'integer', minimum: 1, maximum: 1000, default: 10 }
    }, ['resource', 'text'])),
  tool('list_records',
    'Lists matching records with optional filters, preset, fields, sorting, pagination, and full-text search; company names live in accounts.lastname, business terms can use presets such as open-invoices, and dates are Unix seconds. Use it after resolving human names to IDs when you need record details or a paginated result set. Set extdata for custom fields, or expand for JSON/binary columns such as transaction line items.',
    objectSchema({
      resource: resourceProperty,
      filter: filterProperty,
      preset: presetProperty,
      fields: { type: 'array', items: { type: 'string' }, minItems: 1 },
      sort: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' }, minItems: 1 }
        ]
      },
      limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
      offset: { type: 'integer', minimum: 0, default: 0 },
      search: { type: 'string' },
      extdata: { type: 'boolean', description: 'Include extended/custom field values.' },
      expand: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description: 'Expand JSON/binary columns, e.g. ["items"] for transaction line items.'
      }
    }, ['resource'])),
  tool('count_records',
    'Counts records matching an optional filter, preset, or full-text search without fetching every row. Use it for “how many” questions instead of counting a limited list response.',
    objectSchema({
      resource: resourceProperty,
      filter: filterProperty,
      preset: presetProperty,
      search: { type: 'string' }
    }, ['resource'])),
  tool('sum_records',
    'Sums one numeric field across every record matching an optional filter or preset and reports the inspected row count. Use it for simple ungrouped totals after describe_resource confirms the numeric field and currency basis. Narrow with a filter or preset first: max_rows caps how many records are inspected, and the result reports whether the cap truncated the sum.',
    objectSchema({
      resource: resourceProperty,
      field: { type: 'string', minLength: 1 },
      filter: filterProperty,
      preset: presetProperty,
      max_rows: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_SUM_ROWS,
        default: DEFAULT_SUM_ROWS,
        description: `Maximum records to inspect (default ${DEFAULT_SUM_ROWS}, hard cap ${MAX_SUM_ROWS}).`
      }
    }, ['resource', 'field'])),
  tool('get_record',
    'Fetches one record by its stable ID and can return only selected fields. Use it to inspect or verify an exact record after its ID has been resolved. Set extdata for custom fields, tags for tags, or expand (e.g. ["items"]) for line items and other JSON/binary columns.',
    objectSchema({
      resource: resourceProperty,
      id: { oneOf: [{ type: 'integer' }, { type: 'string', minLength: 1 }] },
      fields: { type: 'array', items: { type: 'string' }, minItems: 1 },
      extdata: { type: 'boolean', description: 'Include extended/custom field values.' },
      tags: { type: 'boolean', description: 'Include tags.' },
      expand: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description: 'Expand JSON/binary columns, e.g. ["items"] for transaction line items.'
      }
    }, ['resource', 'id']))
];

const WRITE_TOOLS = [
  tool('create_record',
    'Creates one record after applying field aliases and local schema validation. Use it only when the user has explicitly authorized creation and the exact payload is known.',
    objectSchema({
      resource: resourceProperty,
      data: { type: 'object', additionalProperties: true }
    }, ['resource', 'data'])),
  tool('update_record',
    'Updates selected fields on one record after applying field aliases and local schema validation. Use it only after reading the exact target and obtaining authorization for the specific ID and changes.',
    objectSchema({
      resource: resourceProperty,
      id: { oneOf: [{ type: 'integer' }, { type: 'string', minLength: 1 }] },
      data: { type: 'object', additionalProperties: true }
    }, ['resource', 'id', 'data']))
];

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function objectSchema(properties = {}, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

export function listMcpTools({ allowWrites = process.env.ZEYOS_MCP_ALLOW_WRITES === '1' } = {}) {
  return allowWrites ? [...READ_TOOLS, ...WRITE_TOOLS] : [...READ_TOOLS];
}

export async function callMcpTool(name, args = {}, options = {}) {
  const allowWrites = options.allowWrites ?? process.env.ZEYOS_MCP_ALLOW_WRITES === '1';
  if (!READ_TOOLS.some((entry) => entry.name === name) && !WRITE_TOOLS.some((entry) => entry.name === name)) {
    const error = new Error(`Unknown tool "${name}".`);
    error.code = -32602;
    throw error;
  }
  if (WRITE_TOOLS.some((entry) => entry.name === name) && !allowWrites) {
    return errorResult('Writes are disabled. Set ZEYOS_MCP_ALLOW_WRITES=1 when starting the server to expose write tools.',
      { code: 'writes_disabled', actions: ['Restart the server with ZEYOS_MCP_ALLOW_WRITES=1 if the user authorized writes.'] });
  }

  try {
    const payload = await executeTool(name, args);
    return textResult(payload);
  } catch (err) {
    const status = err?.status;
    return errorResult(formatToolError(err, args), {
      code: status ? `api_${status}` : (err?.name === 'ZeyosApiError' ? 'api_error' : 'invalid_request'),
      ...(status === 401 || status === 403 ? { actions: ['Re-authenticate with `zeyos login`.'] } : {})
    });
  }
}

async function executeTool(name, args) {
  if (name === 'list_resource_types') return listResourceTypes();
  if (name === 'describe_resource') return describeResource(args.resource);

  const resource = requireResource(args.resource);
  const resourceName = canonicalName(args.resource);

  if (name === 'find_records') {
    const selection = getListFields(resource, resourceName);
    const displayFields = withId(selection.displayColumns);
    const fields = selection.apiFields
      ? { ID: 'ID', ...selection.apiFields }
      : displayFields;
    const body = { query: args.text, limit: args.limit ?? 10, fields };
    // Keep a pseudo-entity's type binding in force, matching `zeyos find`.
    if (resource.boundFilters) body.filters = { ...resource.boundFilters };
    validateInput(schema(), resource.list, body);
    const state = buildClient({ validate: true });
    const rows = normalizeListResult(await invoke(state, resource.list, body)).data;
    return { rows };
  }

  if (name === 'list_records') {
    const body = buildListBody(resource, resourceName, args);
    validateInput(schema(), resource.list, body);
    const state = buildClient({ validate: true });
    const normalized = normalizeListResult(await invoke(state, resource.list, body));
    const payload = { rows: normalized.data };
    let count = normalized.count;
    if (count == null && normalized.data.length >= body.limit) {
      const countBody = { count: true };
      if (body.filters) countBody.filters = body.filters;
      if (body.query != null) countBody.query = body.query;
      count = normalizeCountResult(await invoke(state, resource.list, countBody));
    }
    if (count != null) payload.count = count;
    const shownThrough = body.offset + normalized.data.length;
    if ((count != null && count > shownThrough) || (count == null && normalized.data.length >= body.limit)) {
      payload.truncated_hint = `Showing ${body.offset + 1}-${shownThrough}${count == null ? '' : ` of ${count}`}; request the next page with offset ${shownThrough}.`;
    }
    if (normalized.data.length === 0 && (body.filters || body.query != null)) payload.hint = EMPTY_RESULT_HINT;
    return payload;
  }

  if (name === 'count_records') {
    const body = { count: true };
    const filters = prepareResourceFilters(resource, resourceName, args.preset, args.filter);
    if (filters !== undefined) body.filters = filters;
    if (args.search != null) body.query = args.search;
    validateInput(schema(), resource.list, body);
    const state = buildClient({ validate: true });
    const count = normalizeCountResult(await invoke(state, resource.list, body));
    return count === 0 && (body.filters || body.query != null)
      ? { count, hint: EMPTY_RESULT_HINT }
      : { count };
  }

  if (name === 'sum_records') {
    const field = normalizeField(args.field, resource.fieldAliases);
    // Bounded by construction: an unfiltered sum over a large table would
    // otherwise page forever, and an MCP client has no way to call it off.
    const maxRows = Math.min(args.max_rows ?? DEFAULT_SUM_ROWS, MAX_SUM_ROWS);
    const body = { fields: [field], limit: Math.min(SUM_PAGE_SIZE, maxRows), offset: 0 };
    const filters = prepareResourceFilters(resource, resourceName, args.preset, args.filter);
    if (filters !== undefined) body.filters = filters;
    validateInput(schema(), resource.list, body);
    const state = buildClient({ validate: true });
    let sum = 0;
    let count = 0;
    let truncated = false;
    while (count < maxRows) {
      body.limit = Math.min(SUM_PAGE_SIZE, maxRows - count);
      const rows = normalizeListResult(await invoke(state, resource.list, body)).data;
      for (const row of rows) {
        const value = row[field];
        if (value == null || value === '') continue;
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`Field "${field}" contains a non-numeric value: ${JSON.stringify(value)}`);
        sum += number;
      }
      count += rows.length;
      // A short page means the result set is exhausted, even if we happen to be
      // exactly at the cap — reporting truncation there sends the agent chasing
      // a next page that does not exist.
      if (rows.length < body.limit) break;
      body.offset += rows.length;
      if (count >= maxRows) truncated = true;
    }
    return truncated
      ? {
          sum,
          count,
          field,
          truncated: true,
          hint: `Stopped after ${count} records (max_rows). The sum covers only those rows — narrow the filter, or raise max_rows up to ${MAX_SUM_ROWS}.`
        }
      : { sum, count, field };
  }

  if (name === 'get_record') {
    const fields = args.fields?.map((field) => normalizeField(field, resource.fieldAliases));
    if (fields && resource.list) validateInput(schema(), resource.list, { fields });
    const input = { ID: args.id };
    if (args.extdata) input.extdata = 1;
    if (args.tags) input.tags = 1;
    if (args.expand) input.expand = args.expand;
    validateInput(schema(), resource.get, input);
    const state = buildClient({ validate: true });
    const record = await invoke(state, resource.get, input);
    // Expanded/extended columns are the reason the caller asked; a field
    // projection must not drop them.
    return fields && !args.extdata && !args.expand && !args.tags
      ? pickFields(record, fields)
      : record;
  }

  const data = normalizeData(args.data, resource.fieldAliases);
  // The CLI rejects an empty payload; MCP must too, or an update with no fields
  // becomes a silent no-op the caller reads as success.
  if (Object.keys(data).length === 0) {
    throw new Error('No fields provided: "data" must contain at least one field to write.');
  }
  const operationId = name === 'create_record' ? resource.create : resource.update;
  // Creating through a pseudo-entity fixes its transactions.type. A conflicting
  // explicit value would file the record under the wrong document type.
  if (name === 'create_record' && resource.boundFields) {
    assertNoBoundConflict(resource.boundFields, data, args.resource, 'data');
    Object.assign(data, resource.boundFields);
  }
  if (!operationId) throw new Error(`Resource "${args.resource}" does not support ${name === 'create_record' ? 'creation' : 'updates'}.`);
  const input = name === 'create_record' ? data : { ID: args.id, body: data };
  validateInput(schema(), operationId, input);
  const state = buildClient({ validate: true });
  return invoke(state, operationId, input);
}

function listResourceTypes() {
  return RESOURCE_NAMES.map((name) => {
    const resource = resolveResource(name);
    return {
      name,
      description: RESOURCE_DESCRIPTIONS[name] || resourceDescription(name) || `ZeyOS ${name} records.`,
      presets: Object.keys(resource.presets || {}),
      // Pseudo-entities are transactions with `type` bound; surfacing the code
      // lets a caller reason about the underlying table when it needs to.
      ...(resource.boundFilters?.type === undefined ? {} : { transaction_type: resource.boundFilters.type })
    };
  });
}

function describeResource(input) {
  const resource = requireResource(input);
  const canonical = canonicalName(input);
  const key = schemaKeyFor(resource);
  const definition = schema().describe(key);
  return {
    ...definition,
    canonical_resource: canonical,
    aliases: {
      fields: resource.fieldAliases || {},
      filters: resource.filterAliases || {}
    },
    presets: Object.keys(resource.presets || {}),
    // Same vocabulary `zeyos describe --json` publishes, so an MCP-only agent
    // does not have to discover the filter syntax by trial and error.
    filter_operators: FILTER_VOCABULARY,
    ...(resource.boundFilters?.type === undefined
      ? {}
      : { transaction_type: resource.boundFilters.type }),
    operations: schema().operations(key),
    cli_operations: ['list', 'get', 'create', 'update', 'delete'].filter((operation) => resource[operation])
  };
}

function buildListBody(resource, resourceName, args) {
  const body = { limit: args.limit ?? 50, offset: args.offset ?? 0 };
  const filters = prepareResourceFilters(resource, resourceName, args.preset, args.filter);
  if (filters !== undefined) body.filters = filters;
  if (args.fields) {
    body.fields = Object.fromEntries(args.fields.map((field) => [field, normalizeField(field, resource.fieldAliases)]));
  } else {
    const defaults = getListFields(resource, resourceName);
    if (defaults.apiFields) body.fields = defaults.apiFields;
  }
  if (args.sort) body.sort = Array.isArray(args.sort) ? args.sort : args.sort.split(',').map((part) => part.trim()).filter(Boolean);
  if (args.search != null) body.query = args.search;
  if (args.extdata) body.extdata = 1;
  if (args.expand) body.expand = args.expand;
  return body;
}

function requireResource(name) {
  const resource = typeof name === 'string' ? resolveResource(name) : undefined;
  if (!resource) throw new Error(`Unknown resource "${name}". Use list_resource_types to see available resources.`);
  return resource;
}

function schemaKeyFor(resource) {
  const operationId = resource.list || resource.get || resource.create || resource.update;
  return schema().resourceForOperation(operationId);
}

function normalizeField(field, aliases = {}) {
  return aliases?.[field] || field;
}

function normalizeData(data, aliases = {}) {
  return Object.fromEntries(Object.entries(data).map(([field, value]) => [normalizeField(field, aliases), value]));
}

function withId(fields) {
  return fields.includes('ID') ? [...fields] : ['ID', ...fields];
}

function pickFields(record, fields) {
  if (!record || typeof record !== 'object') return record;
  return Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(record, field)).map((field) => [field, record[field]]));
}

async function invoke(state, operationId, input) {
  const fn = state.client.api[operationId];
  if (typeof fn !== 'function') throw new Error(`Operation "${operationId}" is not available on this client.`);
  const result = await fn(input);
  await syncTokens(state.tokenStore, state.configSource);
  return result;
}

function formatToolError(err, args) {
  if (err instanceof ZeyosApiError || err?.name === 'ZeyosApiError') {
    const status = err.status || 0;
    const hint = status === 400 && (args?.filter || args?.preset)
      ? ' Hint: run describe_resource for this resource and check the filter fields and enum values.'
      : '';
    return `ZeyOS API error (HTTP ${status}): ${err.message}.${hint}`;
  }
  return err?.message || String(err);
}

function textResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Structured tool failure.
 *
 * Mirrors the CLI's `--json` error envelope so an agent gets the same shape on
 * both transports: a bare prose string leaves it nothing to branch on.
 */
function errorResult(message, details = {}) {
  const envelope = {
    ok: false,
    error: { code: details.code ?? 'error', message, ...(details.actions ? { actions: details.actions } : {}) }
  };
  return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }], isError: true };
}

export { EMPTY_RESULT_HINT };
