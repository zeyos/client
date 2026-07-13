#!/usr/bin/env node

import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { callMcpTool, listMcpTools } from '../lib/mcp-tools.mjs';
import { resolveResource } from '../lib/resources.mjs';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;
const FALLBACK_PROTOCOL_VERSION = '2025-03-26';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([FALLBACK_PROTOCOL_VERSION]);
const allowWrites = process.env.ZEYOS_MCP_ALLOW_WRITES === '1';

const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });

input.on('line', (line) => {
  if (!line.trim()) return;
  void processLine(line);
});

input.on('close', () => {
  process.exitCode = 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    input.close();
    process.stdin.pause();
    process.exitCode = 0;
  });
}

async function processLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    writeError(null, -32700, 'Parse error');
    return;
  }

  if (!isRequestObject(message)) {
    writeError(message && typeof message === 'object' && 'id' in message ? message.id : null, -32600, 'Invalid Request');
    return;
  }

  const notification = !Object.prototype.hasOwnProperty.call(message, 'id');
  if (notification) {
    if (message.method === 'notifications/initialized') return;
    return;
  }

  try {
    const result = await dispatch(message.method, message.params);
    writeMessage({ jsonrpc: '2.0', id: message.id, result });
  } catch (err) {
    writeError(message.id, Number.isInteger(err?.code) ? err.code : -32603, err?.message || 'Internal error');
  }
}

async function dispatch(method, params) {
  if (method === 'initialize') {
    const requested = params?.protocolVersion;
    return {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : FALLBACK_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'zeyos-mcp', version: VERSION }
    };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: listMcpTools({ allowWrites }) };
  if (method === 'tools/call') {
    if (!isPlainObject(params) || typeof params.name !== 'string') {
      throw rpcError(-32602, 'Invalid params: tools/call requires a tool name.');
    }
    const definition = listMcpTools({ allowWrites }).find((tool) => tool.name === params.name);
    if (!definition) throw rpcError(-32602, `Invalid params: unknown tool "${params.name}".`);
    const args = params.arguments ?? {};
    const validationError = validateArguments(definition.inputSchema, args);
    if (validationError) throw rpcError(-32602, `Invalid params: ${validationError}`);
    return callMcpTool(params.name, args, { allowWrites });
  }
  throw rpcError(-32601, `Method not found: ${method}`);
}

function validateArguments(schema, value, path = 'arguments') {
  if (!isPlainObject(value)) return `${path} must be an object.`;
  for (const required of schema.required || []) {
    if (!Object.prototype.hasOwnProperty.call(value, required)) return `${path}.${required} is required.`;
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) return `${path}.${key} is not allowed.`;
    }
  }
  for (const [key, child] of Object.entries(value)) {
    const property = schema.properties?.[key];
    if (!property) continue;
    const error = validateValue(property, child, `${path}.${key}`);
    if (error) return error;
  }
  return null;
}

function validateValue(schema, value, path) {
  if (schema.oneOf) {
    return schema.oneOf.some((choice) => validateValue(choice, value, path) == null)
      ? null
      : `${path} does not match an allowed type.`;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return `${path} must be a string.`;
    if (schema.minLength != null && value.length < schema.minLength) return `${path} must not be empty.`;
    if (schema.enum && !schema.enum.includes(value) && !resolveResourceAlias(path, value)) return `${path} must be a known resource.`;
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value)) return `${path} must be an integer.`;
    if (schema.minimum != null && value < schema.minimum) return `${path} must be at least ${schema.minimum}.`;
    if (schema.maximum != null && value > schema.maximum) return `${path} must be at most ${schema.maximum}.`;
  } else if (schema.type === 'object') {
    if (!isPlainObject(value)) return `${path} must be an object.`;
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return `${path} must be an array.`;
    if (schema.minItems != null && value.length < schema.minItems) return `${path} must not be empty.`;
    for (let index = 0; index < value.length; index += 1) {
      const error = validateValue(schema.items, value[index], `${path}[${index}]`);
      if (error) return error;
    }
  }
  return null;
}

// Resource schemas advertise canonical names, while runtime resolution remains
// compatible with the CLI's documented singular/plural aliases.
function resolveResourceAlias(path, value) {
  return path.endsWith('.resource') && typeof value === 'string' && Boolean(resolveResource(value));
}

function isRequestObject(value) {
  return isPlainObject(value) && value.jsonrpc === '2.0' && typeof value.method === 'string';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
