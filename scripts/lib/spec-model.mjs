// Shared OpenAPI / dbref parsing primitives.
//
// Extracted verbatim from scripts/generate-client.mjs so both the client codegen
// and the OKF producer (scripts/generate-okf.mjs) read the specs the same way.
// generate-client.mjs imports these unchanged; generate-okf.mjs additionally uses
// buildEntityModel() for the richer per-entity detail OKF docs need.

import { readFile } from 'node:fs/promises';

export const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

export function unescapePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function pointerGet(doc, ref) {
  if (!ref.startsWith('#/')) {
    throw new Error(`External $ref is not supported: ${ref}`);
  }

  const parts = ref.slice(2).split('/').map(unescapePointerToken);
  let current = doc;
  for (const part of parts) {
    if (current == null || !Object.prototype.hasOwnProperty.call(current, part)) {
      throw new Error(`Unresolvable $ref: ${ref}`);
    }
    current = current[part];
  }
  return current;
}

export function resolveRef(doc, value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (typeof value.$ref === 'string') {
    return pointerGet(doc, value.$ref);
  }
  return value;
}

export function normalizeServer(server) {
  const urlTemplate = server?.url || '';
  const defaultVariables = {};

  if (server?.variables && typeof server.variables === 'object') {
    for (const [name, variable] of Object.entries(server.variables)) {
      if (variable && typeof variable.default === 'string') {
        defaultVariables[name] = variable.default;
      }
    }
  }

  const basePathTemplate = (() => {
    const match = urlTemplate.match(/^https?:\/\/[^/]+(\/.*)$/i);
    return match ? match[1] : '';
  })();

  return {
    urlTemplate,
    basePathTemplate,
    defaultVariables
  };
}

export function normalizeParameters(doc, pathItem, operation) {
  const combined = [
    ...(Array.isArray(pathItem?.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation?.parameters) ? operation.parameters : [])
  ];

  const indexed = new Map();
  for (const rawParameter of combined) {
    const parameter = resolveRef(doc, rawParameter);
    if (!parameter || typeof parameter !== 'object') {
      continue;
    }

    const key = `${parameter.in || 'unknown'}:${parameter.name || 'unknown'}`;
    indexed.set(key, {
      name: parameter.name,
      in: parameter.in,
      required: Boolean(parameter.required)
    });
  }

  const normalized = Array.from(indexed.values()).filter((parameter) => parameter.name && parameter.in);

  return {
    all: normalized,
    path: normalized.filter((parameter) => parameter.in === 'path').map((parameter) => parameter.name),
    query: normalized.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name),
    header: normalized.filter((parameter) => parameter.in === 'header').map((parameter) => parameter.name)
  };
}

export function normalizeRequestBody(doc, operation) {
  const requestBody = resolveRef(doc, operation?.requestBody);
  if (!requestBody || typeof requestBody !== 'object') {
    return {
      required: false,
      contentTypes: []
    };
  }

  const content = requestBody.content && typeof requestBody.content === 'object' ? requestBody.content : {};
  const contentTypes = Object.keys(content);

  return {
    required: Boolean(requestBody.required),
    contentTypes
  };
}

export function normalizeOperationSecurity(doc, operation) {
  if (Array.isArray(operation?.security)) {
    return operation.security;
  }
  if (Array.isArray(doc.security)) {
    return doc.security;
  }
  return [];
}

export function buildOperationId({ operationId, method, route, existingIds }) {
  if (operationId && !existingIds.has(operationId)) {
    return operationId;
  }

  const routeToken = route
    .replace(/[^a-zA-Z0-9{}]/g, '_')
    .replace(/[{}]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  let candidate = operationId || `${method.toLowerCase()}_${routeToken || 'operation'}`;
  let suffix = 1;

  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${operationId || `${method.toLowerCase()}_${routeToken || 'operation'}`}_${suffix}`;
  }

  return candidate;
}

export function collectOperations(doc) {
  const operations = [];
  const existingIds = new Set();

  for (const [route, pathItem] of Object.entries(doc.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const normalizedMethod = method.toUpperCase();
      const parameters = normalizeParameters(doc, pathItem, operation);
      const requestBody = normalizeRequestBody(doc, operation);
      const security = normalizeOperationSecurity(doc, operation);
      const finalOperationId = buildOperationId({
        operationId: operation.operationId,
        method: normalizedMethod,
        route,
        existingIds
      });

      existingIds.add(finalOperationId);

      operations.push({
        operationId: finalOperationId,
        summary: operation.summary || '',
        deprecated: Boolean(operation.deprecated),
        method: normalizedMethod,
        path: route,
        security,
        requestBodyRequired: requestBody.required,
        requestContentTypes: requestBody.contentTypes,
        parameterNames: {
          path: parameters.path,
          query: parameters.query,
          header: parameters.header
        }
      });
    }
  }

  operations.sort((a, b) => {
    if (a.path !== b.path) {
      return a.path.localeCompare(b.path);
    }
    return a.method.localeCompare(b.method);
  });

  return operations;
}

export function buildServices(specEntries) {
  const services = {};

  for (const specEntry of specEntries) {
    const { service, file, doc } = specEntry;
    const firstServer = Array.isArray(doc.servers) ? doc.servers[0] : undefined;

    services[service] = {
      key: service,
      source: file,
      title: doc.info?.title || '',
      version: doc.info?.version || '',
      server: normalizeServer(firstServer),
      globalSecurity: Array.isArray(doc.security) ? doc.security : [],
      operations: collectOperations(doc)
    };
  }

  return services;
}

// Enum values are documented inline in dbref descriptions as `N`=LABEL pairs,
// e.g. "Status (`0`=NOTSTARTED, `1`=AWAITINGACCEPTANCE, ...)". Extract them so
// the client can validate enum inputs and suggest valid values.
export function parseEnum(description) {
  if (typeof description !== 'string') return null;
  const out = {};
  let count = 0;
  const re = /`(-?\d+)`\s*=\s*([A-Za-z0-9_]+)/g;
  let match;
  while ((match = re.exec(description)) !== null) {
    out[match[1]] = match[2];
    count += 1;
  }
  return count >= 2 ? out : null;
}

// Compact field/enum/foreign-key map derived from openapi/dbref.json. Much
// smaller than the raw dbref (drops storage, collation, constraints, triggers,
// stats, etc.) so it ships cheaply and powers runtime introspection.
export function buildSchema(dbref) {
  const schema = {};
  if (!Array.isArray(dbref)) return schema;

  for (const entity of dbref) {
    if (!entity || typeof entity !== 'object' || !entity.name || !Array.isArray(entity.fields)) {
      continue;
    }

    const fields = {};
    for (const field of entity.fields) {
      if (!field || typeof field !== 'object' || !field.name) continue;
      const def = { type: field.type || 'unknown' };
      if (field.indexed) def.indexed = true;
      if (Array.isArray(field.fkeys) && field.fkeys.length > 0 && field.fkeys[0].table) {
        def.fk = field.fkeys[0].table;
      }
      const enumValues = parseEnum(field.description);
      if (enumValues) def.enum = enumValues;
      fields[field.name] = def;
    }

    schema[entity.name] = { type: entity.type || 'table', fields };
  }

  return schema;
}

// Richer per-entity model for OKF docs. Unlike buildSchema (compact, for the
// shipped client), this preserves nullability, defaults, FK target field, the
// raw field description, and the entity's indexes — including the GIN/partial
// definitions behind the `filters`-vs-`filter` foreign-key footgun.
export function buildEntityModel(dbref) {
  const model = {};
  if (!Array.isArray(dbref)) return model;

  for (const entity of dbref) {
    if (!entity || typeof entity !== 'object' || !entity.name || !Array.isArray(entity.fields)) {
      continue;
    }

    const fields = entity.fields
      .filter((field) => field && typeof field === 'object' && field.name)
      .map((field) => {
        const fk = Array.isArray(field.fkeys) && field.fkeys.length > 0 && field.fkeys[0].table
          ? { table: field.fkeys[0].table, field: field.fkeys[0].field || 'ID' }
          : null;
        return {
          name: field.name,
          type: field.type || 'unknown',
          notnull: Boolean(field.notnull),
          default: field.default ?? null,
          indexed: Boolean(field.indexed),
          fk,
          enum: parseEnum(field.description),
          description: typeof field.description === 'string' ? field.description : ''
        };
      });

    const indexes = (Array.isArray(entity.indexes) ? entity.indexes : []).map((index) => ({
      name: index.name,
      method: index.method || 'btree',
      unique: Boolean(index.unique),
      primary: Boolean(index.primary),
      partial: Boolean(index.partial),
      keys: Array.isArray(index.keys) ? index.keys : [],
      def: typeof index.def === 'string' ? index.def : ''
    }));

    model[entity.name] = { name: entity.name, type: entity.type || 'table', fields, indexes };
  }

  return model;
}

export async function loadSpec(absolutePath) {
  const raw = await readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

export async function loadOptionalSpec(absolutePath) {
  try {
    return await loadSpec(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
