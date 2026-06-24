/**
 * Declarative projection engine (spec §8.6) — `computeProjection`.
 *
 * Most Layer B questions are no longer scalar counts: "customers missing a billing
 * address" (anti-join), "net revenue after credits" (signed sum), "supplier scorecard"
 * (grouped aggregates). Rather than hand-write a bespoke verifier per metric, scenarios
 * declare a small data-flow — named paginated `sources` plus a `pipeline` of relational
 * steps — and the harness computes the authoritative answer from live rows, then compares
 * it to the agent's structured RESULT.
 *
 * Pipeline steps: from, where, derive, join/leftJoin/antiJoin, group, aggregate, distinct,
 * sort, project, limit, offset. Expressions: field refs, const, negate/abs, add/sub/mul/div,
 * if (conditional), lower/upper/trim, coalesce, concat, number. Aggregates: sum, count,
 * countDistinct, min, max, avg, ratio.
 *
 * The pure pipeline (`runPipeline`) takes already-loaded source arrays so it is unit-
 * testable with no client; `computeProjection` is the client-bound wrapper used by verify.
 */

import { jsonPath } from './jsonpath.mjs';
import { deepEqual } from './jsonschema.mjs';
import { listAll, resolveParams, looseEq, matchesPredicate } from './query-util.mjs';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── Expression evaluation ──────────────────────────────────────────────────────

export function evalExpr(expr, row) {
  if (expr == null) return null;
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
  if (typeof expr === 'string') return row?.[expr]; // bare string = field reference
  if (typeof expr !== 'object') return expr;

  if ('const' in expr) return expr.const;
  if ('field' in expr) return row?.[expr.field];
  if ('negate' in expr) return -num(evalExpr(expr.negate, row));
  if ('abs' in expr) return Math.abs(num(evalExpr(expr.abs, row)));
  if ('number' in expr) return num(evalExpr(expr.number, row));
  if ('add' in expr) return expr.add.reduce((s, e) => s + num(evalExpr(e, row)), 0);
  if ('mul' in expr) return expr.mul.reduce((s, e) => s * num(evalExpr(e, row)), 1);
  if ('sub' in expr) return num(evalExpr(expr.sub[0], row)) - num(evalExpr(expr.sub[1], row));
  if ('div' in expr) { const d = num(evalExpr(expr.div[1], row)); return d === 0 ? null : num(evalExpr(expr.div[0], row)) / d; }
  if ('lower' in expr) return String(evalExpr(expr.lower, row) ?? '').toLowerCase();
  if ('upper' in expr) return String(evalExpr(expr.upper, row) ?? '').toUpperCase();
  if ('trim' in expr) return String(evalExpr(expr.trim, row) ?? '').trim();
  if ('concat' in expr) return expr.concat.map((e) => String(evalExpr(e, row) ?? '')).join('');
  if ('coalesce' in expr) {
    for (const e of expr.coalesce) { const v = evalExpr(e, row); if (v != null && v !== '') return v; }
    return null;
  }
  if ('if' in expr) {
    // ["fieldName", compareValue, thenExpr, elseExpr]
    const [fieldName, cmp, thenE, elseE] = expr.if;
    const left = typeof fieldName === 'string' ? row?.[fieldName] : evalExpr(fieldName, row);
    return looseEq(left, cmp) ? evalExpr(thenE, row) : evalExpr(elseE, row);
  }
  return null;
}

function rowMatches(row, step) {
  if (step.all) return step.all.every((p) => matchesPredicate(row, p));
  if (step.any) return step.any.some((p) => matchesPredicate(row, p));
  return matchesPredicate(row, step);
}

// ── Aggregates ──────────────────────────────────────────────────────────────

function aggregateRows(rows, specs) {
  const out = {};
  for (const [name, spec] of Object.entries(specs)) {
    out[name] = computeAggregate(rows, spec);
  }
  return out;
}

function computeAggregate(rows, spec) {
  if (spec === 'count' || spec?.count === true) return rows.length;
  if (typeof spec === 'object') {
    if ('count' in spec) return rows.filter((r) => evalExpr(spec.count, r) != null).length;
    if ('countWhere' in spec) return rows.filter((r) => rowMatches(r, spec.countWhere)).length;
    if ('countDistinct' in spec) return new Set(rows.map((r) => String(evalExpr(spec.countDistinct, r)))).size;
    if ('sum' in spec) return round(rows.reduce((s, r) => s + num(evalExpr(spec.sum, r)), 0));
    if ('min' in spec) return rows.length ? Math.min(...rows.map((r) => num(evalExpr(spec.min, r)))) : null;
    if ('max' in spec) return rows.length ? Math.max(...rows.map((r) => num(evalExpr(spec.max, r)))) : null;
    if ('avg' in spec) return rows.length ? round(rows.reduce((s, r) => s + num(evalExpr(spec.avg, r)), 0) / rows.length) : null;
    if ('ratio' in spec) {
      const numer = rows.reduce((s, r) => s + num(evalExpr(spec.ratio[0], r)), 0);
      const denom = rows.reduce((s, r) => s + num(evalExpr(spec.ratio[1], r)), 0);
      return denom === 0 ? null : round(numer / denom);
    }
  }
  return null;
}

function round(n) {
  // Tame floating-point dust (0.1 + 0.2) without imposing a business rounding policy.
  return Math.round(n * 1e6) / 1e6;
}

// ── Joins ──────────────────────────────────────────────────────────────────

function buildIndex(rows, key) {
  const idx = new Map();
  for (const r of rows) {
    const k = String(r?.[key]);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }
  return idx;
}

function applyJoin(working, sources, step, kind) {
  const right = sources[step.source] || [];
  const idx = buildIndex(right, step.on.right);
  const out = [];
  for (const row of working) {
    const matches = idx.get(String(row?.[step.on.left])) || [];
    if (kind === 'anti') {
      if (matches.length === 0) out.push(row);
    } else if (kind === 'left') {
      const m = matches[0] || null;
      out.push(mergeJoin(row, m, step.as));
    } else { // inner
      for (const m of matches) out.push(mergeJoin(row, m, step.as));
    }
  }
  return out;
}

function mergeJoin(left, right, as) {
  if (right == null) return as ? { ...left, [as]: null } : { ...left };
  if (as) return { ...left, [as]: right };
  // shallow-merge right fields without clobbering existing left keys
  const merged = { ...left };
  for (const [k, v] of Object.entries(right)) if (!(k in merged)) merged[k] = v;
  return merged;
}

// ── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Run a projection pipeline over already-loaded `sources` ({ name: rows[] }).
 * Returns the final working value: an array of rows, or a single aggregate object.
 */
export function runPipeline(sources, pipeline = [], ctx = {}) {
  let working = [];
  let collapsed = null; // set by `aggregate`

  for (const step of pipeline) {
    if (step.from) {
      working = [...(sources[step.from.source ?? step.from] || [])];
    } else if (step.where) {
      const w = step.where;
      if ((working.length === 0) && w.source && sources[w.source]) working = [...sources[w.source]];
      working = working.filter((r) => rowMatches(r, w));
    } else if (step.derive) {
      working = working.map((r) => {
        const next = { ...r };
        for (const [name, expr] of Object.entries(step.derive)) next[name] = evalExpr(expr, next);
        return next;
      });
    } else if (step.join) {
      working = applyJoin(working, sources, step.join, 'inner');
    } else if (step.leftJoin) {
      working = applyJoin(working, sources, step.leftJoin, 'left');
    } else if (step.antiJoin) {
      working = applyJoin(working, sources, step.antiJoin, 'anti');
    } else if (step.group) {
      working = groupRows(working, step.group);
    } else if (step.aggregate) {
      collapsed = aggregateRows(working, step.aggregate);
    } else if (step.distinct) {
      working = distinctRows(working, step.distinct);
    } else if (step.sort) {
      working = sortRows(working, step.sort);
    } else if (step.project) {
      working = working.map((r) => projectRow(r, step.project));
    } else if (typeof step.limit === 'number') {
      working = working.slice(0, step.limit);
    } else if (typeof step.offset === 'number') {
      working = working.slice(step.offset);
    }
  }
  return collapsed != null ? collapsed : working;
}

function groupRows(rows, spec) {
  const by = Array.isArray(spec.by) ? spec.by : [spec.by];
  const groups = new Map();
  for (const r of rows) {
    const key = by.map((b) => String(r?.[b])).join(' ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const members of groups.values()) {
    const head = members[0];
    const row = {};
    for (const b of by) row[b] = head?.[b];
    Object.assign(row, aggregateRows(members, spec.aggregate || {}));
    out.push(row);
  }
  return out;
}

function distinctRows(rows, spec) {
  const by = spec === true ? null : (Array.isArray(spec.by) ? spec.by : (spec.by ? [spec.by] : null));
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = by ? by.map((b) => String(r?.[b])).join(' ') : JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function sortRows(rows, spec) {
  const keys = Array.isArray(spec.by) ? spec.by : [typeof spec === 'string' ? spec : spec.by];
  const norm = keys.map((k) => (typeof k === 'string' ? { field: k, dir: 'asc' } : k));
  return [...rows].sort((a, b) => {
    for (const { field, dir } of norm) {
      const av = a?.[field]; const bv = b?.[field];
      let c;
      const an = Number(av); const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) c = an - bn;
      else c = String(av ?? '').localeCompare(String(bv ?? ''));
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

function projectRow(row, spec) {
  if (Array.isArray(spec)) {
    const out = {};
    for (const f of spec) out[f] = row?.[f];
    return out;
  }
  if (spec.fields) {
    const out = {};
    for (const f of spec.fields) out[f] = row?.[f];
    return out;
  }
  if (spec.map) {
    const out = {};
    for (const [to, from] of Object.entries(spec.map)) out[to] = evalExpr(from, row);
    return out;
  }
  if (spec.value) return evalExpr(spec.value, row);
  return row;
}

// ── Comparison ────────────────────────────────────────────────────────────────

export function compareValues(expected, actual, opts = {}) {
  const tol = Number(opts.tolerance ?? 0);
  const cmp = opts.comparator || 'auto';

  const bothNum = isNumeric(expected) && isNumeric(actual);
  if (cmp === 'number' || (cmp === 'auto' && bothNum)) {
    if (!isNumeric(actual)) return false;
    return Math.abs(Number(expected) - Number(actual)) <= tol;
  }
  if (cmp === 'set' || (cmp === 'auto' && Array.isArray(expected) && opts.unordered)) {
    return setEqual(expected, actual);
  }
  if (cmp === 'orderedArray' || (cmp === 'auto' && Array.isArray(expected))) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((e, i) => compareValues(e, actual[i], { ...opts, comparator: 'auto' }));
  }
  return deepEqual(expected, actual);
}

function isNumeric(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v));
  return false;
}

function setEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const remaining = [...b];
  for (const x of a) {
    const i = remaining.findIndex((y) => deepEqual(x, y));
    if (i === -1) return false;
    remaining.splice(i, 1);
  }
  return remaining.length === 0;
}

// ── Source loading + the verifier entry point ─────────────────────────────────

export async function loadSources(sourcesSpec, ctx) {
  const out = {};
  for (const [name, spec] of Object.entries(sourcesSpec || {})) {
    const params = resolveParams(spec.params || {}, ctx);
    out[name] = await listAll(ctx.client, spec.op, params);
  }
  return out;
}

/**
 * `computeProjection` verifier. Loads sources, runs the pipeline, selects the comparable
 * value, and compares to the agent's RESULT at `compareTo`.
 */
export async function computeProjection(expect, ctx) {
  let sources;
  try {
    sources = expect._sources || await loadSources(expect.sources, ctx);
  } catch (err) {
    return { pass: false, detail: `projection source load failed: ${err.message || err}` };
  }

  let computed;
  try {
    computed = runPipeline(sources, expect.pipeline, ctx);
  } catch (err) {
    return { pass: false, detail: `projection pipeline failed: ${err.message || err}` };
  }

  const expected = selectValue(computed, expect.select);
  const agentResult = ctx.resultValue !== undefined ? ctx.resultValue : ctx.result;
  const compareTo = expect.compareTo || '$RESULT';
  const actual = selectFromResult(agentResult, compareTo);

  const pass = compareValues(expected, actual, {
    tolerance: expect.tolerance,
    comparator: expect.comparator,
    unordered: expect.unordered
  });
  return {
    pass,
    expected,
    actual,
    detail: pass
      ? 'projection matched'
      : `projection mismatch: expected ${JSON.stringify(expected)}, agent ${JSON.stringify(actual)}`
  };
}

function selectValue(computed, select) {
  if (!select) return computed;
  const { values } = jsonPath(computed, select);
  return values.length === 1 ? values[0] : values;
}

function selectFromResult(result, compareTo) {
  if (!compareTo || compareTo === '$RESULT') return parseMaybe(result);
  const path = compareTo.replace(/^\$RESULT/, '$');
  const root = parseMaybe(result);
  const { values } = jsonPath(root, path);
  return values.length === 1 ? values[0] : values;
}

function parseMaybe(result) {
  if (typeof result !== 'string') return result;
  const t = result.trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^[[{]/.test(t)) { try { return JSON.parse(t); } catch { /* keep string */ } }
  return result;
}
