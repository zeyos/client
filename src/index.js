import { createZeyosClient } from './runtime/client.js';
import { ZeyosApiError } from './runtime/error.js';
import { MemoryTokenStore, normalizeTokenSet, tokenResponseToTokenSet } from './runtime/token-store.js';

/**
 * Normalise a list API response into a consistent `{ data, count? }` shape.
 *
 * ZeyOS list endpoints are not completely uniform across the full generated
 * surface. This helper handles the common list-like cases where the response
 * is either a plain array or an object wrapper that contains `data` and
 * optional `count` metadata.
 *
 * @param {Array|object} result - The raw value returned by a list operation.
 * @returns {{ data: Array, count?: number }}
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

export { createZeyosClient, ZeyosApiError, MemoryTokenStore, normalizeTokenSet, tokenResponseToTokenSet };
