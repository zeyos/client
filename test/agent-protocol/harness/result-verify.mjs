/**
 * Structured-result verification (spec §8.5) — `verifyResult` and `verifyFile`.
 *
 * When a scenario declares an output contract (JSON object, ordered array, CSV/NDJSON
 * file), correctness is more than "the number matches": keys, ordering, uniqueness, sort
 * order, currency/date canonicalization and JSON-Schema validity all matter, and an
 * "OUTPUT_CONTRACT_FAILURE" (right-looking prose, invalid structured output) is a distinct
 * failure class. These verifiers run against the *parsed* agent result (ctx.resultValue),
 * which the runner produces from the declared result mode/format via result.mjs.
 */

import { validateSchema } from './jsonschema.mjs';
import { jsonPath } from './jsonpath.mjs';
import { compareValues } from './projection.mjs';
import { looseEq } from './query-util.mjs';

function resultValue(ctx) {
  if (ctx.resultValue !== undefined) return ctx.resultValue;
  if (typeof ctx.result === 'string') {
    const t = ctx.result.trim();
    if (/^[[{]/.test(t)) { try { return JSON.parse(t); } catch { /* keep string */ } }
    if (/^[-+]?\d+(\.\d+)?$/.test(t)) return Number(t);
  }
  return ctx.result;
}

function isSorted(arr, dir = 'asc') {
  for (let i = 1; i < arr.length; i += 1) {
    const a = arr[i - 1]; const b = arr[i];
    const an = Number(a); const bn = Number(b);
    const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a).localeCompare(String(b));
    if (dir === 'desc' ? cmp < 0 : cmp > 0) return false;
  }
  return true;
}

function allUnique(arr) {
  const seen = new Set();
  for (const x of arr) {
    const k = typeof x === 'object' ? JSON.stringify(x) : String(x);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/** Run one path assertion against the parsed result. Returns null on pass, else a message. */
function runAssertion(value, a) {
  const path = a.path || '$';
  const { values, found } = jsonPath(value, path);

  if (a.absent === true) return found ? `${path} expected absent` : null;
  if (a.present === true) return found ? null : `${path} expected present`;
  if (!found) return `${path} not found`;

  const first = values.length === 1 ? values[0] : values;

  if ('equals' in a) {
    const ok = values.some((v) => compareValues(a.equals, v, { tolerance: a.tolerance, comparator: a.comparator, unordered: a.unordered }));
    return ok ? null : `${path}=${JSON.stringify(first)} != ${JSON.stringify(a.equals)}`;
  }
  if ('oneOf' in a) return values.some((v) => a.oneOf.some((o) => looseEq(o, v))) ? null : `${path}=${JSON.stringify(first)} not in ${JSON.stringify(a.oneOf)}`;
  if ('gte' in a) return Number(first) >= Number(a.gte) ? null : `${path}=${first} < ${a.gte}`;
  if ('lte' in a) return Number(first) <= Number(a.lte) ? null : `${path}=${first} > ${a.lte}`;
  if ('gt' in a) return Number(first) > Number(a.gt) ? null : `${path}=${first} <= ${a.gt}`;
  if ('lt' in a) return Number(first) < Number(a.lt) ? null : `${path}=${first} >= ${a.lt}`;
  if ('count' in a) return values.length === a.count ? null : `${path} count ${values.length} != ${a.count}`;
  if ('minCount' in a) return values.length >= a.minCount ? null : `${path} count ${values.length} < ${a.minCount}`;
  if ('matches' in a) { try { return new RegExp(a.matches).test(String(first)) ? null : `${path} !~ ${a.matches}`; } catch { return `bad regex ${a.matches}`; } }
  if ('sorted' in a) return Array.isArray(first) && isSorted(first, a.sorted === 'desc' ? 'desc' : 'asc') ? null : `${path} not sorted ${a.sorted}`;
  if (a.unique === true) return Array.isArray(first) && allUnique(first) ? null : `${path} has duplicates`;
  if ('set' in a) return compareValues(a.set, first, { comparator: 'set' }) ? null : `${path} set != ${JSON.stringify(a.set)}`;
  if ('keys' in a) {
    const keys = first && typeof first === 'object' ? Object.keys(first) : [];
    const missing = a.keys.filter((k) => !keys.includes(k));
    return missing.length ? `${path} missing keys ${missing.join(', ')}` : null;
  }
  if ('forbiddenKeys' in a) {
    const keys = first && typeof first === 'object' ? Object.keys(first) : [];
    const present = a.forbiddenKeys.filter((k) => keys.includes(k));
    return present.length ? `${path} has forbidden keys ${present.join(', ')}` : null;
  }
  return null;
}

/** `verifyResult` — JSON-Schema validity + path assertions + whole-value equality. */
export function verifyResult(expect, ctx) {
  const value = resultValue(ctx);
  const failures = [];

  if (value == null && (expect.schema || expect.assertions || 'equals' in expect)) {
    return { pass: false, detail: `OUTPUT_CONTRACT_FAILURE: no parseable structured result (raw=${JSON.stringify(ctx.result)})` };
  }

  if (expect.schema) {
    const res = validateSchema(value, expect.schema, { strictFormat: expect.strictFormat });
    for (const e of res.errors) failures.push(`schema: ${e}`);
  }

  if ('equals' in expect) {
    if (!compareValues(expect.equals, value, { tolerance: expect.tolerance, comparator: expect.comparator, unordered: expect.unordered })) {
      failures.push(`value ${JSON.stringify(value)} != ${JSON.stringify(expect.equals)}`);
    }
  }

  for (const a of expect.assertions || []) {
    const msg = runAssertion(value, a);
    if (msg) failures.push(msg);
  }

  return {
    pass: failures.length === 0,
    expected: expect.equals !== undefined ? expect.equals : (expect.schema ? '(schema)' : undefined),
    actual: value,
    detail: failures.length === 0 ? 'result satisfied the output contract' : `OUTPUT_CONTRACT_FAILURE: ${failures.join('; ')}`
  };
}

/**
 * `verifyFile` — assert structure of a parsed result file (CSV/NDJSON rows).
 * ctx.resultValue is the parsed array of row objects (produced by result.mjs).
 * Checks: headers (exact column set), rowSchema (per-row JSON Schema), rowCount/min/max,
 * sortBy, uniqueBy, and an exact `rows` set (unordered by default).
 */
export function verifyFile(expect, ctx) {
  const rows = resultValue(ctx);
  const failures = [];
  if (!Array.isArray(rows)) {
    return { pass: false, detail: `OUTPUT_CONTRACT_FAILURE: result file did not parse to rows (${ctx.resultError || typeof rows})` };
  }

  if (expect.headers) {
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const exact = expect.headersExact !== false;
    const missing = expect.headers.filter((h) => !cols.includes(h));
    const extra = exact ? cols.filter((c) => !expect.headers.includes(c)) : [];
    if (missing.length || extra.length) failures.push(`headers mismatch (missing: ${missing.join(',') || '∅'}; extra: ${extra.join(',') || '∅'})`);
  }
  if (typeof expect.rowCount === 'number' && rows.length !== expect.rowCount) failures.push(`rowCount ${rows.length} != ${expect.rowCount}`);
  if (typeof expect.minRows === 'number' && rows.length < expect.minRows) failures.push(`rows ${rows.length} < minRows ${expect.minRows}`);
  if (typeof expect.maxRows === 'number' && rows.length > expect.maxRows) failures.push(`rows ${rows.length} > maxRows ${expect.maxRows}`);

  if (expect.rowSchema) {
    rows.forEach((r, i) => {
      const res = validateSchema(r, expect.rowSchema, { strictFormat: expect.strictFormat });
      for (const e of res.errors) failures.push(`row[${i}] ${e}`);
    });
  }
  if (expect.sortBy) {
    const field = typeof expect.sortBy === 'string' ? expect.sortBy : expect.sortBy.field;
    const dir = expect.sortBy.dir || 'asc';
    if (!isSorted(rows.map((r) => r[field]), dir)) failures.push(`rows not sorted by ${field} ${dir}`);
  }
  if (expect.uniqueBy) {
    const keys = rows.map((r) => String(r[expect.uniqueBy]));
    if (new Set(keys).size !== keys.length) failures.push(`duplicate ${expect.uniqueBy}`);
  }
  if (expect.rows) {
    const project = (r) => {
      const keys = expect.compareKeys || Object.keys(expect.rows[0] || r);
      const o = {};
      for (const k of keys) o[k] = String(r[k]);
      return o;
    };
    const want = expect.rows.map(project);
    const got = rows.map(project);
    if (!compareValues(want, got, { comparator: expect.unordered === false ? 'orderedArray' : 'set' })) {
      failures.push(`row set mismatch: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
  }

  return {
    pass: failures.length === 0,
    actual: { rows: rows.length },
    detail: failures.length === 0 ? `result file ok (${rows.length} rows)` : `OUTPUT_CONTRACT_FAILURE: ${failures.join('; ')}`
  };
}
