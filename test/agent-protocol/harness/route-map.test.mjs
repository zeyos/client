// Offline coverage for route → operationId resolution and resource helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  operationIdForRequest, normalizeRequestPath, resourceForOperationId,
  deleteOpForResource, listOpForResource, knownOperationIds
} from './route-map.mjs';

test('normalizeRequestPath strips instance + version and extracts the id', () => {
  assert.deepEqual(normalizeRequestPath('/demo/api/v1/tickets', { instance: 'demo' }), { template: '/tickets', id: null, resource: 'tickets' });
  assert.deepEqual(normalizeRequestPath('/demo/api/v1/tickets/123', { instance: 'demo' }), { template: '/tickets/{ID}', id: '123', resource: 'tickets' });
});

test('operationIdForRequest resolves CRUD verbs from method + path', () => {
  assert.equal(operationIdForRequest('POST', '/demo/api/v1/tickets', { instance: 'demo' }).operationId, 'listTickets');
  assert.equal(operationIdForRequest('PUT', '/demo/api/v1/tickets', { instance: 'demo' }).operationId, 'createTicket');
  assert.equal(operationIdForRequest('GET', '/demo/api/v1/tickets/9', { instance: 'demo' }).operationId, 'getTicket');
  assert.equal(operationIdForRequest('PATCH', '/demo/api/v1/tickets/9', { instance: 'demo' }).operationId, 'updateTicket');
  assert.equal(operationIdForRequest('DELETE', '/demo/api/v1/tickets/9', { instance: 'demo' }).operationId, 'deleteTicket');
});

test('operationIdForRequest honors the operationId vocabulary trap', () => {
  // dunning list/get diverge from the noun
  assert.equal(operationIdForRequest('POST', '/demo/api/v1/dunning', { instance: 'demo' }).operationId, 'listDunningNotices');
  assert.equal(operationIdForRequest('GET', '/demo/api/v1/dunning/3', { instance: 'demo' }).operationId, 'getDunningNotice');
});

test('verb falls back to HTTP method when no exact route matches', () => {
  const r = operationIdForRequest('DELETE', '/demo/api/v1/unknownresource/5', { instance: 'demo' });
  assert.equal(r.operationId, null);
  assert.equal(r.verb, 'delete');
  assert.equal(r.id, '5');
});

test('resource helpers map operationIds to resources and back', () => {
  assert.equal(resourceForOperationId('createActionStep'), 'actionsteps');
  assert.equal(deleteOpForResource('tickets'), 'deleteTicket');
  assert.equal(listOpForResource('dunning'), 'listDunningNotices');
  assert.ok(knownOperationIds().has('listTransactions'));
});
