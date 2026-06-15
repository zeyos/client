import { createZeyosClient } from './runtime/client.js';
import { ZeyosApiError, ZeyosValidationError } from './runtime/error.js';
import { MemoryTokenStore, normalizeTokenSet, tokenResponseToTokenSet } from './runtime/token-store.js';

/**
 * @typedef {null|boolean|number|string|JsonValue[]|Record<string, JsonValue>} JsonValue
 * @typedef {Record<string, JsonValue>} ZeyosRecord
 * @typedef {ZeyosRecord[]|{ data?: ZeyosRecord[], count?: number }} ListResult
 * @typedef {{ data: ZeyosRecord[], count?: number }} NormalizedListResult
 * @typedef {number|string|ZeyosRecord[]|{ count?: number|string|null, data?: ZeyosRecord[] }|null|undefined} CountResult
 */

/**
 * Normalise a list API response into a consistent `{ data, count? }` shape.
 *
 * ZeyOS list endpoints are not completely uniform across the full generated
 * surface. This helper handles the common list-like cases where the response
 * is either a plain array or an object wrapper that contains `data` and
 * optional `count` metadata.
 *
 * @param {ListResult|null|undefined} result - The raw value returned by a list operation.
 * @returns {NormalizedListResult}
 *
 * @example
 *   const raw   = await client.api.listTickets({ filters: { visibility: 0 } });
 *   const { data } = normalizeListResult(raw);   // data is always an array
 *
 * @example
 *   const raw   = await client.api.listTickets({ filters: { visibility: 0 }, count: true });
 *   const { data, count } = normalizeListResult(raw);
 */
export function normalizeListResult(result) {
  if (Array.isArray(result)) {
    return { data: result };
  }
  if (result != null && typeof result === 'object') {
    const data  = Array.isArray(result.data) ? result.data : [];
    const out   = { data };
    if (typeof result.count === 'number') out.count = result.count;
    return out;
  }
  return { data: [] };
}

/**
 * Normalise a count response into a number.
 *
 * Count-capable endpoints may return `count` directly, an object with a
 * `count` property, or a list fallback. This keeps sample apps and CLI code
 * from reimplementing that shape handling at every call site.
 *
 * @param {CountResult} result - Raw value returned by a count request.
 * @returns {number}
 */
export function normalizeCountResult(result) {
  if (typeof result === 'number') {
    return Number.isFinite(result) ? result : 0;
  }
  if (typeof result === 'string' && result !== '') {
    const parsed = Number(result);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (Array.isArray(result)) {
    return result.length;
  }
  if (result != null && typeof result === 'object') {
    if (result.count != null) {
      const parsed = Number(result.count);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (Array.isArray(result.data)) {
      return result.data.length;
    }
  }
  return 0;
}

export { createZeyosClient, ZeyosApiError, ZeyosValidationError, MemoryTokenStore, normalizeTokenSet, tokenResponseToTokenSet };
