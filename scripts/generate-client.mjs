import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  { service: 'api', file: 'openapi/api.json' },
  { service: 'oauth2', file: 'openapi/oauth2.json' },
  { service: 'legacyAuth', file: 'openapi/auth.json' }
];

function unescapePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function pointerGet(doc, ref) {
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

function resolveRef(doc, value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (typeof value.$ref === 'string') {
    return pointerGet(doc, value.$ref);
  }
  return value;
}

function normalizeServer(server) {
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

function normalizeParameters(doc, pathItem, operation) {
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

function normalizeRequestBody(doc, operation) {
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

function normalizeOperationSecurity(doc, operation) {
  if (Array.isArray(operation?.security)) {
    return operation.security;
  }
  if (Array.isArray(doc.security)) {
    return doc.security;
  }
  return [];
}

function buildOperationId({ operationId, method, route, existingIds }) {
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

function collectOperations(doc) {
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

async function readSpecFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const raw = await readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

function buildServices(specEntries) {
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

function renderModule(generated) {
  const payload = JSON.stringify(generated, null, 2);

  return [
    '// This file is auto-generated by scripts/generate-client.mjs',
    '// Do not edit manually.',
    '',
    `export const GENERATED = ${payload};`,
    'export const SERVICES = GENERATED.services;',
    "export const SERVICE_KEYS = Object.freeze(Object.keys(SERVICES));",
    ''
  ].join('\n');
}

async function main() {
  const specEntries = [];

  for (const source of SOURCES) {
    const doc = await readSpecFile(source.file);
    specEntries.push({ ...source, doc });
  }

  const generated = {
    generatedAt: new Date().toISOString(),
    services: buildServices(specEntries)
  };

  const outputFile = path.join(ROOT, 'src/generated/operations.js');
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, renderModule(generated), 'utf8');

  const operationCount = Object.values(generated.services)
    .map((service) => service.operations.length)
    .reduce((sum, value) => sum + value, 0);

  process.stdout.write(`Generated operations for ${Object.keys(generated.services).length} services (${operationCount} operations).\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
