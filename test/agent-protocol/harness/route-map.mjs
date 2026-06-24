/**
 * Route → operationId resolution (spec §8.2/§8.3).
 *
 * The policy proxy and trace recorder both need to turn a raw HTTP request (method +
 * path) back into a ZeyOS operationId so policy is expressed in the same vocabulary as
 * scenarios (`createMessage`, `listTransactions`). The mapping is derived from the
 * authoritative generated operations table, not guessed from the noun — so `/dunning`
 * GET-by-id resolves to `getDunningNotice`, exactly as the client surface exposes it.
 *
 * Request URLs look like `/{instance}/api/v1/<resource>[/{ID}]` (or `/oauth2/v1/...`); we
 * strip the instance and the `api|oauth2` + version prefix, normalize id segments to a
 * `{ID}` token, and look up `${METHOD} ${template}` in the table.
 */

import { SERVICES } from '../../../src/generated/operations.js';

let ROUTE_MAP = null;

function buildRouteMap() {
  const map = new Map();
  for (const service of Object.values(SERVICES)) {
    for (const op of service.operations || []) {
      const template = normalizeTemplate(op.path);
      map.set(`${op.method.toUpperCase()} ${template}`, op.operationId);
    }
  }
  return map;
}

/** Replace any `{param}` placeholder with the canonical `{ID}` token. */
function normalizeTemplate(p) {
  return String(p).replace(/\{[^}]+\}/g, '{ID}');
}

/**
 * Reduce a concrete request path to a route template + the trailing id (if any).
 * Strips a leading `/<instance>` and the `/(api|oauth2)/v<n>` prefix, then turns the
 * final numeric/opaque id segment into `{ID}`.
 */
export function normalizeRequestPath(rawPath, { instance } = {}) {
  let p = String(rawPath || '').split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  let segments = p.split('/').filter(Boolean);

  if (instance && segments[0] === instance) segments = segments.slice(1);
  // strip service + version: api/v1 or oauth2/v1
  if (segments[0] === 'api' || segments[0] === 'oauth2') {
    segments = segments.slice(1);
    if (/^v\d+$/.test(segments[0])) segments = segments.slice(1);
  }
  if (segments.length === 0) return { template: '/', id: null, resource: null };

  // A trailing id segment (numeric, or anything after a known resource noun)
  let id = null;
  const last = segments[segments.length - 1];
  let templateSegs = [...segments];
  if (segments.length >= 2 && /^[0-9]+$/.test(last)) {
    id = decodeURIComponent(last);
    templateSegs = segments.slice(0, -1).concat('{ID}');
  }
  const resource = templateSegs[0] || null;
  return { template: `/${templateSegs.join('/')}`, id, resource };
}

/**
 * Resolve an incoming request to `{ operationId, resource, id, verb }`.
 * `operationId` is null when no exact route matches (the caller decides how strict to be).
 */
export function operationIdForRequest(method, rawPath, { instance } = {}) {
  if (!ROUTE_MAP) ROUTE_MAP = buildRouteMap();
  const { template, id, resource } = normalizeRequestPath(rawPath, { instance });
  const key = `${String(method).toUpperCase()} ${template}`;
  const operationId = ROUTE_MAP.get(key) || null;
  return { operationId, resource, id, verb: verbOf(operationId, method, id) };
}

function verbOf(operationId, method, id) {
  if (operationId) {
    const m = operationId.match(/^(list|get|create|update|delete|exists)/);
    if (m) return m[1];
  }
  // fall back to HTTP method (ZeyOS: POST=list/query, PUT=create, PATCH=update, …)
  switch (String(method).toUpperCase()) {
    case 'GET': return 'get';
    case 'HEAD': return 'exists';
    case 'POST': return 'list';
    case 'PUT': return 'create';
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'other';
  }
}

/** Verbs that read rather than mutate. */
export const READ_VERBS = new Set(['list', 'get', 'exists']);
export const WRITE_VERBS = new Set(['create', 'update', 'delete']);

/** All known operationIds (for static validation of scenario seed/cleanup ops). */
export function knownOperationIds() {
  const set = new Set();
  for (const service of Object.values(SERVICES)) {
    for (const op of service.operations || []) set.add(op.operationId);
  }
  return set;
}

let OP_INDEX = null;
function opIndex() {
  if (OP_INDEX) return OP_INDEX;
  OP_INDEX = { byId: new Map(), byResourceVerb: new Map() };
  for (const service of Object.values(SERVICES)) {
    for (const op of service.operations || []) {
      const resource = normalizeRequestPath(op.path).resource;
      OP_INDEX.byId.set(op.operationId, { ...op, resource });
      const verb = (op.operationId.match(/^(list|get|create|update|delete|exists)/) || [])[1];
      if (verb && resource) OP_INDEX.byResourceVerb.set(`${resource}:${verb}`, op.operationId);
    }
  }
  return OP_INDEX;
}

/** The dbref/url resource segment an operationId acts on (e.g. createActionStep → actionsteps). */
export function resourceForOperationId(operationId) {
  return opIndex().byId.get(operationId)?.resource || null;
}

/** The delete operationId for a resource, or null (e.g. tickets → deleteTicket). */
export function deleteOpForResource(resource) {
  return opIndex().byResourceVerb.get(`${resource}:delete`) || null;
}

/** The list operationId for a resource, or null (e.g. dunning → listDunningNotices). */
export function listOpForResource(resource) {
  return opIndex().byResourceVerb.get(`${resource}:list`) || null;
}
