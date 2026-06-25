/**
 * Scenario-specific policy proxy (spec §8.2).
 *
 * The model-driven subprocess should never hold the real upstream bearer token. Instead
 * the harness starts this localhost reverse-proxy on an ephemeral port and hands the agent
 * (a) the proxy base URL via ZEYOS_BASE_URL and (b) a run-local *opaque* token via
 * ZEYOS_TOKEN. The proxy keeps the real token privately and, per request:
 *
 *   1. authenticates the opaque token (reject anything else);
 *   2. maps method+path → operationId (route-map);
 *   3. enforces read/write/ownership/confirmation/outbound policy (policy.mjs);
 *   4. on a denied request, returns 403 and records the attempt — it never reaches upstream;
 *   5. on an allowed request, swaps in the real bearer token, forwards to the real origin,
 *      registers any agent-created record in the ownership manifest, and records a redacted
 *      trace event.
 *
 * A policy denial is a *test observation*, not infrastructure failure. The proxy fails
 * closed: an unmapped or unauthenticated request is rejected rather than forwarded.
 */

import { createServer } from 'node:http';

import { operationIdForRequest } from './route-map.mjs';
import { decide } from './policy.mjs';
import { redactEvent, redactText } from './trace.mjs';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function safeJson(buf) {
  if (!buf || buf.length === 0) return undefined;
  try { return JSON.parse(buf.toString('utf8')); } catch { return undefined; }
}

/**
 * Start the proxy.
 * @param {{ realBaseUrl:string, realToken:string, instance:string, opaqueToken?:string,
 *           manifest:object, secrets?:string[], getEffects:()=>object }} cfg
 */
export async function startPolicyProxy(cfg) {
  const realOrigin = new URL(cfg.realBaseUrl).origin;
  const opaqueToken = cfg.opaqueToken || `proxy-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const events = [];
  let turnId = null;

  const server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      respond(res, 502, { error: 'proxy_error', detail: String(err.message || err) });
    });
  });

  async function handle(req, res) {
    const started = Date.now();

    // OAuth token endpoint: never forward upstream. Return the opaque token so the agent's
    // client/CLI "refreshes" to it (and never obtains the real upstream bearer). The CLI
    // sends Basic client auth here — not the opaque Bearer — so this must run BEFORE the
    // opaque-token check, otherwise its built-in auto-refresh 401s and every call fails.
    const pathOnly = String(req.url).split('?')[0];
    if (/\/oauth2\/v\d+\/token\/?$/.test(pathOnly)) {
      await readBody(req); // drain the grant body; we don't forward it
      record({ req, operationId: 'oauth2.token', verb: 'other', resource: 'oauth2', policy: 'allowed', status: 200, started, reason: 'synthetic token (opaque; not forwarded)' });
      return respond(res, 200, { token_type: 'Bearer', access_token: opaqueToken, refresh_token: opaqueToken, expires_in: 3600, scope: '' });
    }

    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${opaqueToken}`) {
      // The real token never reaches the agent; an unrecognized token cannot proxy.
      record({ req, operationId: null, verb: 'other', resource: null, policy: 'denied', status: 401, started, reason: 'bad opaque token' });
      return respond(res, 401, { error: 'unauthorized', detail: 'invalid run-local token' });
    }

    const bodyBuf = await readBody(req);
    const body = safeJson(bodyBuf);
    const { operationId, resource, id, verb } = operationIdForRequest(req.method, req.url, { instance: cfg.instance });

    const effects = cfg.getEffects ? cfg.getEffects() : {};
    const verdict = decide(
      { operationId, verb, resource, id, method: req.method, body },
      { ...effects, ownedKeys: cfg.manifest?.ownedKeys?.() || new Set() }
    );

    if (!verdict.allow) {
      record({ req, operationId, verb, resource, id, body, policy: 'blocked', status: 403, started, reason: verdict.reason });
      return respond(res, 403, { error: 'policy_blocked', operationId, reason: verdict.reason });
    }

    // Forward upstream with the real token.
    const target = `${realOrigin}${req.url}`;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'authorization') headers[k] = v;
    }
    headers['authorization'] = `Bearer ${cfg.realToken()}`;

    let upstream;
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf
      });
    } catch (err) {
      record({ req, operationId, verb, resource, id, body, policy: 'allowed', status: 0, started, reason: `upstream error: ${err.message}` });
      return respond(res, 502, { error: 'upstream_unreachable', detail: String(err.message || err) });
    }

    const respBuf = Buffer.from(await upstream.arrayBuffer());
    // Register agent-created records so cleanup and ownership stay correct.
    if (verb === 'create' && upstream.ok) {
      const created = safeJson(respBuf);
      const newId = created?.ID ?? created?.id;
      if (newId != null) cfg.manifest?.register?.({ operationId, resource, id: newId, source: 'agent' });
    }

    record({ req, operationId, verb, resource, id, body, policy: 'allowed', status: upstream.status, started });

    const outHeaders = {};
    upstream.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders[k] = v; });
    res.writeHead(upstream.status, outHeaders);
    res.end(respBuf);
  }

  function record({ req, operationId, verb, resource, id, body, policy, status, started, reason }) {
    const event = redactEvent({
      time: new Date().toISOString(),
      turnId,
      source: 'http',
      verb,
      resource,
      operationId,
      request: {
        method: req.method,
        path: String(req.url).split('?')[0],
        bodyShape: body && typeof body === 'object' ? Object.keys(body) : [],
        body: body && typeof body === 'object' ? body : undefined,
        id
      },
      policy,
      status,
      durationMs: Date.now() - started,
      reason: reason ? redactText(reason, cfg.secrets || []) : undefined
    }, cfg.secrets || []);
    events.push(event);
  }

  function respond(res, code, obj) {
    const buf = Buffer.from(JSON.stringify(obj));
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': buf.length });
    res.end(buf);
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    port,
    opaqueToken,
    events,
    /** Agent ZEYOS_BASE_URL: proxy origin + instance, so the client builds the same paths. */
    agentBaseUrl: `${url}/${cfg.instance}`,
    setTurn(id) { turnId = id; },
    eventsForTurn(id) { return events.filter((e) => e.turnId === id); },
    close() {
      // Force keep-alive sockets shut so close() actually resolves (Node fetch pools
      // connections, and a lingering socket would otherwise hang server.close()).
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    }
  };
}
