/**
 * Independent, model-agnostic verification for the agent test protocol.
 *
 * The harness — never the agent under test — runs everything in this file
 * against the live instance via @zeyos/client. That decoupling is what makes the
 * flake-vs-defect classification trustworthy: the ground truth does not depend on
 * the model that produced the answer.
 */

import { readFile, writeFile } from 'node:fs/promises';
import {
  createZeyosClient,
  normalizeListResult,
  normalizeTokenSet,
  tokenResponseToTokenSet
} from '../../../src/index.js';

// ── Token / client ────────────────────────────────────────────────────────────

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** True when the access token is missing or expires within 60s. */
function tokenIsStale(token) {
  if (!token?.accessToken) return true;
  if (typeof token.expiresAt !== 'number') return false; // unknown expiry: assume usable
  return token.expiresAt - 60 <= nowSeconds();
}

/**
 * Ensure a usable access token. Resolution order when the stored token is stale:
 *   1. refresh grant      (stored refreshToken + clientId/clientSecret)
 *   2. password grant      (live.username + live.password + clientId/clientSecret)
 *   3. stored access token (best effort)
 * The refreshed/obtained token is persisted back to config.test.json for reuse.
 */
export async function ensureFreshToken(liveCfg, { configPath } = {}) {
  const stored = normalizeTokenSet(liveCfg.token) || {};
  if (!tokenIsStale(stored)) return stored;

  const haveClient = liveCfg.clientId && liveCfg.clientSecret;

  // 1) refresh grant
  if (stored.refreshToken && haveClient) {
    try {
      const refreshed = await refreshViaGrant(liveCfg, stored.refreshToken);
      return persistToken(configPath, refreshed);
    } catch (err) {
      // A stale/invalid refresh token must not block a password login.
      if (!(liveCfg.username && liveCfg.password)) throw err;
    }
  }

  // 2) password grant (Resource Owner Password Credentials)
  if (liveCfg.username && liveCfg.password && haveClient) {
    const obtained = await passwordLogin(liveCfg);
    return persistToken(configPath, obtained);
  }

  // 3) best effort: a still-present (if expired) access token
  if (stored.accessToken) return stored;

  throw new Error(
    'No usable access token. Supply live.username + live.password (with clientId + clientSecret) for a ' +
      'password-grant login, or a refreshable token. See test/agent-protocol/PROTOCOL.md §4.'
  );
}

/** Refresh-token grant via the client helper. */
async function refreshViaGrant(liveCfg, refreshToken) {
  const client = createZeyosClient({
    platform: { origin: liveCfg.origin || originFromUrl(liveCfg.url), instance: liveCfg.instance },
    auth: { mode: 'oauth', oauth: { clientId: liveCfg.clientId, clientSecret: liveCfg.clientSecret } }
  });
  const refreshed = await client.oauth2.refreshToken({
    refreshToken,
    clientId: liveCfg.clientId,
    clientSecret: liveCfg.clientSecret
  });
  return normalizeTokenSet(refreshed) || refreshed;
}

/**
 * OAuth2 Resource Owner Password Credentials grant. Posts username/password +
 * Basic client auth to the token endpoint and normalizes the response. Headless —
 * no browser. Supports an optional one-time `live.otp` for 2FA.
 */
export async function passwordLogin(liveCfg) {
  const baseUrl = (liveCfg.url || `${liveCfg.origin}/${liveCfg.instance}`).replace(/\/+$/, '');
  const tokenUrl = `${baseUrl}/oauth2/v1/token`;
  const basic = Buffer.from(`${liveCfg.clientId}:${liveCfg.clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'password',
    username: liveCfg.username,
    password: liveCfg.password
  });
  if (liveCfg.otp) body.set('otp', String(liveCfg.otp));

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Password login failed (${res.status} ${res.statusText}) at ${tokenUrl}: ${detail.slice(0, 300)}`);
  }

  const tokenSet = tokenResponseToTokenSet(await res.json());
  if (!tokenSet?.accessToken) throw new Error('Password login succeeded but the response contained no access_token.');
  return tokenSet;
}

/** Persist a normalized token set back into config.test.json (best effort). */
async function persistToken(configPath, normalized) {
  if (configPath) {
    try {
      const raw = JSON.parse(await readFile(configPath, 'utf8'));
      raw.live = { ...raw.live, token: {
        accessToken: normalized.accessToken ?? null,
        refreshToken: normalized.refreshToken ?? null,
        expiresAt: normalized.expiresAt ?? null,
        obtainedAt: normalized.obtainedAt ?? null
      } };
      await writeFile(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    } catch {
      /* non-fatal: token still returned in-memory */
    }
  }
  return normalized;
}

function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Build the verification client bound to the live instance + access token. */
export function buildVerifyClient(liveCfg, token) {
  const platform = liveCfg.url
    ? liveCfg.url
    : { origin: liveCfg.origin, instance: liveCfg.instance };
  return createZeyosClient({
    platform,
    auth: {
      mode: 'oauth',
      oauth: { token: { accessToken: token.accessToken }, autoRefresh: false }
    }
  });
}

// ── Result parsing ──────────────────────────────────────────────────────────

/** Extract the value from the last `RESULT:` line emitted by the agent. */
export function parseResultLine(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  let raw = null;
  for (const line of lines) {
    const m = line.match(/^\s*RESULT:\s*(.*)$/);
    if (m) raw = m[1].trim();
  }
  return raw; // null when the agent never produced a RESULT line
}

/** Coerce a RESULT payload into a JS value (JSON object/array/number, else string). */
function coerceResult(raw) {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }
  return trimmed;
}

// ── Token / path substitution ─────────────────────────────────────────────────

/** Substitute {runId} / {recordPrefix} into a string. */
export function subst(value, ctx) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('{runId}', String(ctx.runId))
    .replaceAll('{recordPrefix}', String(ctx.recordPrefix));
}

/** Deep-resolve $RESULT / $RESULT.field / {runId}/{recordPrefix} tokens in params. */
function resolveParams(params, ctx) {
  const result = coerceResult(ctx.result);
  const resolve = (v) => {
    if (typeof v === 'string') {
      if (v === '$RESULT') return result;
      if (v.startsWith('$RESULT.')) {
        const key = v.slice('$RESULT.'.length);
        return result && typeof result === 'object' ? result[key] : undefined;
      }
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

/** Resolve an `idFrom` spec ($RESULT or $RESULT.field) to a scalar id. */
function resolveId(idFrom, ctx) {
  const result = coerceResult(ctx.result);
  if (idFrom === '$RESULT') {
    if (result && typeof result === 'object') return result.ID ?? result.id ?? null;
    return result;
  }
  if (typeof idFrom === 'string' && idFrom.startsWith('$RESULT.')) {
    const key = idFrom.slice('$RESULT.'.length);
    return result && typeof result === 'object' ? result[key] ?? null : null;
  }
  return null;
}

// ── Comparison helpers ────────────────────────────────────────────────────────

function looseEq(a, b) {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

function matchesPredicate(record, pred) {
  const v = record?.[pred.field];
  if ('equals' in pred) return looseEq(v, pred.equals);
  if ('in' in pred) return pred.in.some((x) => looseEq(v, x));
  if ('notIn' in pred) return !pred.notIn.some((x) => looseEq(v, x));
  if ('gte' in pred) return Number(v) >= Number(pred.gte);
  if ('lte' in pred) return Number(v) <= Number(pred.lte);
  return false;
}

async function listAll(client, op, params) {
  if (typeof client.api[op] !== 'function') {
    throw new Error(`Unknown list operation api.${op}`);
  }
  const raw = await client.api[op](params);
  return normalizeListResult(raw).data;
}

// ── Public evaluation API ──────────────────────────────────────────────────────

/**
 * Score one scenario's `expect` block against the agent's RESULT.
 * Returns { pass: boolean|null, manual?, expected?, actual?, detail }.
 * `pass: null` means "needs human/judge review" (manual scenarios w/o judge).
 */
export async function evaluateExpect(expect, ctx) {
  switch (expect.kind) {
    case 'verifyRecord':
      return evalVerifyRecord(expect, ctx);
    case 'computeCount':
      return evalComputeCount(expect, ctx);
    case 'computeMembership':
      return evalComputeMembership(expect, ctx);
    case 'expectText':
      return evalExpectText(expect, ctx);
    case 'manual':
      return { pass: null, manual: true, rubric: expect.rubric, detail: 'manual review required' };
    default:
      return { pass: false, detail: `unknown expect.kind "${expect.kind}"` };
  }
}

async function evalVerifyRecord(expect, ctx) {
  const id = resolveId(expect.idFrom, ctx);
  if (id == null || id === '' || Number.isNaN(id)) {
    return { pass: false, detail: `could not resolve id from ${expect.idFrom} (RESULT=${JSON.stringify(ctx.result)})` };
  }
  let record;
  try {
    record = await ctx.client.api[expect.op]({ ID: id });
  } catch (err) {
    return { pass: false, detail: `${expect.op}(${id}) failed: ${err.message || err}` };
  }
  const failures = [];
  for (const a of expect.assert || []) {
    const actual = record?.[a.path];
    if (a.exists === true) {
      if (actual == null) failures.push(`${a.path} missing`);
      continue;
    }
    if ('equals' in a) {
      const want = subst(a.equals, ctx);
      if (!looseEq(actual, want)) failures.push(`${a.path}=${JSON.stringify(actual)} ≠ ${JSON.stringify(want)}`);
    }
    if ('oneOf' in a && !a.oneOf.some((x) => looseEq(actual, x))) {
      failures.push(`${a.path}=${JSON.stringify(actual)} not in ${JSON.stringify(a.oneOf)}`);
    }
  }
  return {
    pass: failures.length === 0,
    detail: failures.length ? failures.join('; ') : `record ${id} matched all assertions`,
    actual: record
  };
}

async function evalComputeCount(expect, ctx) {
  const params = ensureFields({ ...expect.params }, expect.predicates);
  let data;
  try {
    data = await listAll(ctx.client, expect.op, params);
  } catch (err) {
    return { pass: false, detail: `compute ${expect.op} failed: ${err.message || err}` };
  }
  const count = data.filter((r) => (expect.predicates || []).every((p) => matchesPredicate(r, p))).length;
  const agent = Number(coerceResult(ctx.result));
  const pass = Number.isFinite(agent) && agent === count;
  return {
    pass,
    expected: count,
    actual: Number.isFinite(agent) ? agent : ctx.result,
    detail: pass ? `count matched (${count})` : `agent said ${JSON.stringify(ctx.result)}, ground truth = ${count}`
  };
}

async function evalComputeMembership(expect, ctx) {
  const params = resolveParams(expect.listParams, ctx);
  const idVal = resolveId(expect.idFrom, ctx);
  if (idVal == null) {
    return { pass: false, detail: `could not resolve ${expect.idFrom} (RESULT=${JSON.stringify(ctx.result)})` };
  }
  let data;
  try {
    data = await listAll(ctx.client, expect.listOp, params);
  } catch (err) {
    return { pass: false, detail: `membership ${expect.listOp} failed: ${err.message || err}` };
  }
  const field = expect.idField || 'ID';
  const present = data.some((r) => looseEq(r?.[field], idVal));
  const want = expect.expectPresent !== false;
  return {
    pass: present === want,
    expected: `${field}=${idVal} ${want ? 'present' : 'absent'}`,
    actual: `${present ? 'present' : 'absent'} (${data.length} rows)`,
    detail: present === want ? 'membership matched' : 'membership mismatch'
  };
}

function evalExpectText(expect, ctx) {
  const text = String(ctx.result ?? ctx.rawStdout ?? '').toLowerCase();
  const hit = (expect.anyOf || []).find((s) => text.includes(String(s).toLowerCase()));
  return {
    pass: Boolean(hit),
    detail: hit ? `matched "${hit}"` : `none of [${(expect.anyOf || []).join(', ')}] found`
  };
}

/** Ensure predicate fields are selected so list rows actually contain them. */
function ensureFields(params, predicates) {
  if (!predicates || predicates.length === 0) return params;
  if (params.fields) return params;
  const fields = new Set(['ID']);
  for (const p of predicates) fields.add(p.field);
  return { ...params, fields: [...fields] };
}

// ── Cleanup & orphan sweep ──────────────────────────────────────────────────────

/** Best-effort delete of records this scenario created. Never throws. */
export async function runCleanup(cleanup, ctx) {
  const out = [];
  for (const step of cleanup || []) {
    const id = resolveId(step.idFrom, ctx);
    if (id == null) {
      out.push({ op: step.op, skipped: 'no id' });
      continue;
    }
    try {
      await ctx.client.api[step.op]({ ID: id });
      out.push({ op: step.op, id, deleted: true });
    } catch (err) {
      out.push({ op: step.op, id, error: err.message || String(err) });
    }
  }
  return out;
}

/**
 * Delete leftover AGENTTEST-* records from prior crashed runs.
 * Sweeps tickets (name) and accounts (lastname). Read-only when dryRun=true.
 */
export async function orphanSweep(client, recordPrefix, { dryRun = false } = {}) {
  const needle = `${recordPrefix}-`;
  const targets = [
    { listOp: 'listTickets', deleteOp: 'deleteTicket', field: 'name' },
    { listOp: 'listAccounts', deleteOp: 'deleteAccount', field: 'lastname' }
  ];
  const report = [];
  for (const t of targets) {
    let data = [];
    try {
      data = await listAll(client, t.listOp, { filters: { visibility: 0 }, fields: ['ID', t.field], limit: 10000 });
    } catch (err) {
      report.push({ resource: t.listOp, error: err.message || String(err) });
      continue;
    }
    const orphans = data.filter((r) => typeof r?.[t.field] === 'string' && r[t.field].startsWith(needle));
    for (const o of orphans) {
      if (dryRun) {
        report.push({ resource: t.listOp, id: o.ID, name: o[t.field], wouldDelete: true });
        continue;
      }
      try {
        await client.api[t.deleteOp]({ ID: o.ID });
        report.push({ resource: t.listOp, id: o.ID, name: o[t.field], deleted: true });
      } catch (err) {
        report.push({ resource: t.listOp, id: o.ID, error: err.message || String(err) });
      }
    }
  }
  return report;
}

export { coerceResult };
