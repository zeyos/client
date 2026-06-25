// Integration coverage for the policy proxy against an in-process fake upstream.
// Proves: opaque-token auth, real-token swap, policy enforcement, trace capture,
// and agent-created-record registration — with no live ZeyOS instance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { startPolicyProxy } from './policy-proxy.mjs';
import { createOwnershipManifest } from './fixtures.mjs';

function startFakeUpstream() {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, authorization: req.headers['authorization'], body });
      if (req.method === 'PUT') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ID: 4242 })); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ ID: 1 }, { ID: 2 }]));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    resolve({ origin: `http://127.0.0.1:${port}`, seen, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
  }));
}

async function withProxy(effects, fn) {
  const upstream = await startFakeUpstream();
  const manifest = createOwnershipManifest();
  let current = effects;
  const proxy = await startPolicyProxy({
    realBaseUrl: `${upstream.origin}/demo`,
    realToken: () => 'REAL-SECRET-TOKEN',
    instance: 'demo',
    manifest,
    secrets: ['REAL-SECRET-TOKEN'],
    getEffects: () => current
  });
  try {
    return await fn({ proxy, upstream, manifest, setEffects: (e) => { current = e; } });
  } finally {
    await proxy.close();
    await upstream.close();
  }
}

test('proxy forwards an allowed read with the real token swapped in', async () => {
  await withProxy({ mode: 'read-only' }, async ({ proxy, upstream }) => {
    const res = await fetch(`${proxy.agentBaseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${proxy.opaqueToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { visibility: 0 } })
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ ID: 1 }, { ID: 2 }]);
    // upstream saw the REAL token, never the opaque one
    assert.equal(upstream.seen[0].authorization, 'Bearer REAL-SECRET-TOKEN');
    assert.equal(proxy.events[0].operationId, 'listTickets');
    assert.equal(proxy.events[0].policy, 'allowed');
  });
});

test('proxy rejects a request without the run-local opaque token', async () => {
  await withProxy({ mode: 'read-only' }, async ({ proxy, upstream }) => {
    const res = await fetch(`${proxy.agentBaseUrl}/api/v1/tickets`, {
      method: 'POST', headers: { authorization: 'Bearer GUESS' }, body: '{}'
    });
    assert.equal(res.status, 401);
    assert.equal(upstream.seen.length, 0, 'must not forward an unauthenticated request');
  });
});

test('proxy blocks a write in read-only mode and never forwards it', async () => {
  await withProxy({ mode: 'read-only', allowedOperations: [] }, async ({ proxy, upstream }) => {
    const res = await fetch(`${proxy.agentBaseUrl}/api/v1/tickets`, {
      method: 'PUT', headers: { authorization: `Bearer ${proxy.opaqueToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' })
    });
    assert.equal(res.status, 403);
    const j = await res.json();
    assert.equal(j.error, 'policy_blocked');
    assert.equal(upstream.seen.length, 0);
    assert.equal(proxy.events[0].policy, 'blocked');
  });
});

test('proxy forwards an allow-listed create and registers the new record', async () => {
  await withProxy({ mode: 'write', allowedOperations: ['createTicket'], ownedRecordsOnly: true }, async ({ proxy, upstream, manifest }) => {
    const res = await fetch(`${proxy.agentBaseUrl}/api/v1/tickets`, {
      method: 'PUT', headers: { authorization: `Bearer ${proxy.opaqueToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'AGENTTEST-run owned' })
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ID, 4242);
    assert.ok(manifest.ownedKeys().has('tickets:4242'), 'agent-created record registered for cleanup/ownership');
  });
});

test('trace events never contain the real token', async () => {
  await withProxy({ mode: 'read-only' }, async ({ proxy }) => {
    await fetch(`${proxy.agentBaseUrl}/api/v1/tickets`, {
      method: 'POST', headers: { authorization: `Bearer ${proxy.opaqueToken}` }, body: '{}'
    });
    const serialized = JSON.stringify(proxy.events);
    assert.equal(serialized.includes('REAL-SECRET-TOKEN'), false);
  });
});

test('proxy intercepts the OAuth token endpoint and returns the opaque token (no upstream)', async () => {
  // The agent CLI auto-refreshes via Basic client auth (not the opaque Bearer); the proxy
  // must answer with the opaque token so the CLI keeps working and never sees the real one.
  await withProxy({ mode: 'read-only' }, async ({ proxy, upstream }) => {
    const res = await fetch(`${proxy.agentBaseUrl}/oauth2/v1/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from('cid:sec').toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=whatever'
    });
    assert.equal(res.status, 200);
    const tok = await res.json();
    assert.equal(tok.access_token, proxy.opaqueToken);
    assert.equal(tok.token_type, 'Bearer');
    assert.equal(upstream.seen.length, 0, 'token endpoint must NOT be forwarded upstream');
  });
});
