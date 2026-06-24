/**
 * Minimal, zero-dependency JSONPath evaluator for harness assertions.
 *
 * Used by `verifyResult` (assert against a parsed structured answer) and `verifyTrace`
 * (assert against the normalized event log). We deliberately implement a small, well-
 * understood subset rather than a full JSONPath engine:
 *
 *   $                      root
 *   .name  /  ['name']     member access (bracket form allows dotted/odd keys)
 *   [0]                    array index (negative indexes count from the end)
 *   [*]  /  .*             wildcard over array elements or object values
 *   ..name                 recursive descent to every `name` member
 *   [?(@.a.b == 'x')]      filter: keep array elements / object values matching a predicate
 *
 * Filters support ==, !=, <, <=, >, >= against a number, single/double-quoted string,
 * true, false or null, plus a bare existence test `[?(@.a.b)]`. A query returns every
 * matching value; callers decide whether "exactly one", "present" or "absent" is required.
 */

function tokenize(path) {
  const tokens = [];
  let i = 0;
  const s = String(path);
  if (s[0] === '$') i = 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '.') {
      if (s[i + 1] === '.') {
        // recursive descent: ..name  (or ..* / ..[...])
        i += 2;
        if (s[i] === '*') { tokens.push({ t: 'descend', name: null }); i += 1; continue; }
        let name = '';
        while (i < s.length && /[A-Za-z0-9_$-]/.test(s[i])) { name += s[i]; i += 1; }
        tokens.push({ t: 'descend', name });
        continue;
      }
      i += 1;
      if (s[i] === '*') { tokens.push({ t: 'wildcard' }); i += 1; continue; }
      let name = '';
      while (i < s.length && /[A-Za-z0-9_$-]/.test(s[i])) { name += s[i]; i += 1; }
      if (name) tokens.push({ t: 'key', name });
      continue;
    }
    if (ch === '[') {
      const end = s.indexOf(']', i);
      if (end === -1) throw new Error(`JSONPath: unbalanced [ in ${path}`);
      const inner = s.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === '*') { tokens.push({ t: 'wildcard' }); continue; }
      if (inner.startsWith('?(') && inner.endsWith(')')) {
        tokens.push({ t: 'filter', expr: inner.slice(2, -1).trim() });
        continue;
      }
      const quoted = inner.match(/^['"](.*)['"]$/);
      if (quoted) { tokens.push({ t: 'key', name: quoted[1] }); continue; }
      if (/^-?\d+$/.test(inner)) { tokens.push({ t: 'index', index: Number(inner) }); continue; }
      tokens.push({ t: 'key', name: inner });
      continue;
    }
    // tolerate a leading bare key without a dot
    if (/[A-Za-z_$]/.test(ch)) {
      let name = '';
      while (i < s.length && /[A-Za-z0-9_$-]/.test(s[i])) { name += s[i]; i += 1; }
      tokens.push({ t: 'key', name });
      continue;
    }
    i += 1; // skip anything unexpected
  }
  return tokens;
}

function parseLiteral(raw) {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  const q = t.match(/^['"](.*)['"]$/);
  if (q) return q[1];
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function readAtPath(obj, dotted) {
  // dotted is like "a.b.c" relative to the current element (the @ in a filter)
  let cur = obj;
  for (const seg of dotted.split('.')) {
    if (seg === '@' || seg === '') continue;
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function evalFilter(element, expr) {
  // existence: @.a.b
  const cmp = expr.match(/^(@[^<>=!]*?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
  if (!cmp) {
    const ref = expr.startsWith('@.') ? expr.slice(2) : expr.replace(/^@/, '');
    return readAtPath(element, ref) !== undefined;
  }
  const lhsRef = cmp[1].startsWith('@.') ? cmp[1].slice(2) : cmp[1].replace(/^@/, '');
  const op = cmp[2];
  const rhs = parseLiteral(cmp[3]);
  const lhs = readAtPath(element, lhsRef);
  switch (op) {
    case '==': return looseEq(lhs, rhs);
    case '!=': return !looseEq(lhs, rhs);
    case '<': return Number(lhs) < Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    case '>': return Number(lhs) > Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
    default: return false;
  }
}

function looseEq(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const na = Number(a); const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

function collectDescend(node, name, out) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const el of node) collectDescend(el, name, out);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (name == null) out.push(v);
    else if (k === name) out.push(v);
    collectDescend(v, name, out);
  }
}

function step(values, token) {
  const next = [];
  for (const val of values) {
    switch (token.t) {
      case 'key':
        if (val != null && typeof val === 'object' && token.name in val) next.push(val[token.name]);
        break;
      case 'index':
        if (Array.isArray(val)) {
          const idx = token.index < 0 ? val.length + token.index : token.index;
          if (idx >= 0 && idx < val.length) next.push(val[idx]);
        }
        break;
      case 'wildcard':
        if (Array.isArray(val)) next.push(...val);
        else if (val != null && typeof val === 'object') next.push(...Object.values(val));
        break;
      case 'descend': {
        const out = [];
        collectDescend(val, token.name, out);
        next.push(...out);
        break;
      }
      case 'filter':
        if (Array.isArray(val)) {
          for (const el of val) if (evalFilter(el, token.expr)) next.push(el);
        } else if (val != null && typeof val === 'object') {
          for (const el of Object.values(val)) if (evalFilter(el, token.expr)) next.push(el);
          if (evalFilter(val, token.expr)) next.push(val);
        }
        break;
      default:
        break;
    }
  }
  return next;
}

/**
 * Evaluate a JSONPath against a value.
 * @returns {{ values: any[], found: boolean }}
 */
export function jsonPath(root, path) {
  let values = [root];
  for (const token of tokenize(path)) values = step(values, token);
  return { values, found: values.length > 0 };
}

/** Convenience: the first matched value, or undefined. */
export function jsonPathFirst(root, path) {
  return jsonPath(root, path).values[0];
}
