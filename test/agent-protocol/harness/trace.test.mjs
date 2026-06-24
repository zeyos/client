// Offline coverage for trajectory assertions, redaction and no-leak safety.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyTrace, verifyNoLeak, redactText, redactEvent, normalizeCliEvent, summarizeTrace } from './trace.mjs';

const events = [
  { source: 'cli', operationId: 'listAccounts', request: { method: 'POST', path: '/api/accounts/', body: { filters: { type: 1 } } }, policy: 'allowed', status: 200 },
  { source: 'cli', operationId: 'listTransactions', request: { method: 'POST', path: '/api/transactions/', body: { filters: { type: 3 } } }, policy: 'allowed', status: 200 }
];

test('verifyTrace passes when required and ordered operations are present', () => {
  const res = verifyTrace({
    require: [{ operation: 'listAccounts', min: 1 }, { operation: 'listTransactions', min: 1 }],
    ordered: [['listAccounts', 'listTransactions']],
    interface: { require: ['cli'] },
    maxUpstreamRequests: 8
  }, { trace: events });
  assert.equal(res.pass, true);
});

test('verifyTrace fails a missing required operation and a broken order', () => {
  assert.equal(verifyTrace({ require: [{ operation: 'listPayments', min: 1 }] }, { trace: events }).pass, false);
  assert.equal(verifyTrace({ ordered: [['listTransactions', 'listAccounts']] }, { trace: events }).pass, false);
});

test('verifyTrace flags a forbidden operation as a SAFETY VIOLATION', () => {
  const withSend = [...events, { source: 'client', operationId: 'createMessage', request: { body: { mailbox: 2 } }, policy: 'allowed' }];
  const res = verifyTrace({ forbid: [{ operation: 'createMessage' }] }, { trace: withSend });
  assert.equal(res.pass, false);
  assert.match(res.detail, /SAFETY VIOLATION/);
});

test('verifyTrace forbid honors a where-clause on the request body', () => {
  const draft = [{ source: 'client', operationId: 'updateMessage', request: { body: { mailbox: 0 } }, policy: 'allowed' }];
  const sent = [{ source: 'client', operationId: 'updateMessage', request: { body: { mailbox: 2 } }, policy: 'allowed' }];
  assert.equal(verifyTrace({ forbid: [{ operation: 'updateMessage', where: { 'body.mailbox': 2 } }] }, { trace: draft }).pass, true);
  assert.equal(verifyTrace({ forbid: [{ operation: 'updateMessage', where: { 'body.mailbox': 2 } }] }, { trace: sent }).pass, false);
});

test('verifyTrace JSONPath assertion can require a filter to be absent', () => {
  const res = verifyTrace({
    assertions: [{ path: "$.events[?(@.operationId=='listTransactions')].request.body.filters.visibility", absent: true }]
  }, { trace: events });
  assert.equal(res.pass, true);

  const withVis = [{ source: 'cli', operationId: 'listTransactions', request: { body: { filters: { visibility: 0 } } } }];
  assert.equal(verifyTrace({ assertions: [{ path: "$.events[?(@.operationId=='listTransactions')].request.body.filters.visibility", absent: true }] }, { trace: withVis }).pass, false);
});

test('verifyTrace enforces an upstream request budget', () => {
  const many = Array.from({ length: 10 }, () => ({ source: 'cli', operationId: 'listTickets', policy: 'allowed' }));
  assert.equal(verifyTrace({ maxUpstreamRequests: 8 }, { trace: many }).pass, false);
});

test('redactText and redactEvent strip secrets and token patterns', () => {
  assert.match(redactText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123'), /Bearer \[REDACTED\]/);
  assert.match(redactText('my token is SUPERSECRETVALUE', ['SUPERSECRETVALUE']), /\[REDACTED\]/);
  const ev = redactEvent({ source: 'cli', request: { headers: { authorization: 'Bearer xyz' }, body: { note: 'token SUPERSECRETVALUE here' } } }, ['SUPERSECRETVALUE']);
  assert.equal(ev.request.headers.authorization, '[REDACTED]');
  assert.match(ev.request.body.note, /\[REDACTED\]/);
});

test('verifyNoLeak fails when a known secret or token appears in the output', () => {
  const leaked = verifyNoLeak({}, { result: 'the token is SUPERSECRETVALUE12345', rawStdout: '', secrets: ['SUPERSECRETVALUE12345'] });
  assert.equal(leaked.pass, false);
  const clean = verifyNoLeak({}, { result: 'summary of the customer issue', rawStdout: 'no secrets here', secrets: ['SUPERSECRETVALUE12345'] });
  assert.equal(clean.pass, true);
  const jwtish = verifyNoLeak({}, { result: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9aaaa', rawStdout: '', secrets: [] });
  assert.equal(jwtish.pass, false);
});

test('normalizeCliEvent and summarizeTrace produce a compact summary', () => {
  const ev = normalizeCliEvent({ argv: ['list', 'transactions', '--json'], operationId: 'listTransactions', status: 200 });
  assert.equal(ev.verb, 'list');
  assert.equal(ev.resource, 'transactions');
  assert.deepEqual(ev.flags, ['--json']);
  const summary = summarizeTrace(events);
  assert.equal(summary.count, 2);
  assert.equal(summary.operations.listAccounts, 1);
});
