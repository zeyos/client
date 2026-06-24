/**
 * Shared, client-agnostic query helpers for the verification engine.
 *
 * These were originally private to verify.mjs; they are factored out here so the newer
 * verifiers (computeProjection, verifyStateDiff, …) can reuse the exact same token
 * resolution, pagination and predicate semantics without importing verify.mjs (which
 * would be circular — verify.mjs dispatches into those modules). verify.mjs keeps its own
 * proven copies for the legacy kinds; this module is the single source of truth for the
 * new ones.
 */

import { normalizeListResult } from '../../../src/index.js';

/** Coerce a RESULT payload into a JS value (JSON object/array/number, else string). */
export function coerceResult(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^[[{]/.test(trimmed)) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  return trimmed;
}

/** Substitute {runId} / {recordPrefix} into a string. */
export function subst(value, ctx) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('{runId}', String(ctx.runId))
    .replaceAll('{recordPrefix}', String(ctx.recordPrefix));
}

function seedRef(ref, ctx) {
  const rest = ref.slice('$SEED.'.length);
  const dot = rest.indexOf('.');
  const key = dot === -1 ? rest : rest.slice(0, dot);
  const field = dot === -1 ? null : rest.slice(dot + 1);
  const rec = ctx.seed?.[key];
  if (rec == null) return undefined;
  return field ? rec?.[field] : rec;
}

/** Deep-resolve $RESULT / $RESULT.field / $SEED.key / $ME / {tokens} in params. */
export function resolveParams(params, ctx) {
  const result = coerceResult(ctx.result);
  const resolve = (v) => {
    if (typeof v === 'string') {
      if (v === '$ME') return ctx.me;
      if (v === '$MYGROUP') return ctx.myGroup;
      if (v === '$RESULT') return result;
      if (v.startsWith('$RESULT.')) {
        const key = v.slice('$RESULT.'.length);
        return result && typeof result === 'object' ? result[key] : undefined;
      }
      if (v.startsWith('$SEED.')) return seedRef(v, ctx);
      return subst(v, ctx);
    }
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, resolve(val)]));
    }
    return v;
  };
  return resolve(params);
}

/** Resolve an `idFrom` spec ($ME, $RESULT, $RESULT.field, or $SEED.key[.field]) to a scalar id. */
export function resolveId(idFrom, ctx) {
  const result = coerceResult(ctx.result);
  if (idFrom === '$ME') return ctx.me ?? null;
  if (idFrom === '$RESULT') {
    if (result && typeof result === 'object') return result.ID ?? result.id ?? null;
    return result;
  }
  if (typeof idFrom === 'string' && idFrom.startsWith('$RESULT.')) {
    const key = idFrom.slice('$RESULT.'.length);
    return result && typeof result === 'object' ? result[key] ?? null : null;
  }
  if (typeof idFrom === 'string' && idFrom.startsWith('$SEED.')) {
    const val = seedRef(idFrom, ctx);
    if (val && typeof val === 'object') return val.ID ?? val.id ?? null;
    return val ?? null;
  }
  return null;
}

export function looseEq(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

/** Evaluate a single predicate against a record (equals/in/notIn/gte/lte/gt/lt/exists/isNull/contains/regex). */
export function matchesPredicate(record, pred) {
  const v = record?.[pred.field];
  if ('equals' in pred) return looseEq(v, pred.equals);
  if ('notEquals' in pred) return !looseEq(v, pred.notEquals);
  if ('in' in pred) return pred.in.some((x) => looseEq(v, x));
  if ('notIn' in pred) return !pred.notIn.some((x) => looseEq(v, x));
  if ('gte' in pred) return Number(v) >= Number(pred.gte);
  if ('lte' in pred) return Number(v) <= Number(pred.lte);
  if ('gt' in pred) return Number(v) > Number(pred.gt);
  if ('lt' in pred) return Number(v) < Number(pred.lt);
  if ('exists' in pred) return pred.exists ? v != null : v == null;
  if ('isNull' in pred) return pred.isNull ? v == null : v != null;
  if ('contains' in pred) return v != null && String(v).toLowerCase().includes(String(pred.contains).toLowerCase());
  if ('regex' in pred) { try { return new RegExp(pred.regex).test(String(v ?? '')); } catch { return false; } }
  return false;
}

export function containsUndefined(value) {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object') return Object.values(value).some(containsUndefined);
  return false;
}

/**
 * Fetch EVERY matching row by paging on offset (the server caps a page at 10000). The
 * naive single-call form silently caps ground truth at the page size, so on a large
 * instance a compute verifier would undercount and flag a correct agent as a defect.
 */
export async function listAll(client, op, params = {}) {
  if (typeof client.api[op] !== 'function') {
    throw new Error(`Unknown list operation api.${op}`);
  }
  const requested = Number(params.limit) > 0 ? Number(params.limit) : 10000;
  const pageSize = Math.min(requested, 10000);
  let offset = Number(params.offset) > 0 ? Number(params.offset) : 0;
  const all = [];
  for (;;) {
    const raw = await client.api[op]({ ...params, limit: pageSize, offset });
    const rows = normalizeListResult(raw).data;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/** Ensure predicate fields are selected so list rows actually contain them. */
export function ensureFields(params, predicates) {
  if (!predicates || predicates.length === 0) return params;
  if (params.fields) return params;
  const fields = new Set(['ID']);
  for (const p of predicates) fields.add(p.field);
  return { ...params, fields: [...fields] };
}
