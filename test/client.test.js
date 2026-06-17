import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createZeyosClient,
  MemoryTokenStore,
  ZeyosApiError,
  ZeyosValidationError,
  normalizeCountResult,
  normalizeListResult
} from '../src/index.js';
import { SERVICES } from '../src/generated/operations.js';

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });
}

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers
  });
}

function createFetchSequence(steps) {
  let index = 0;

  const fetch = async (url, init = {}) => {
    if (index >= steps.length) {
      throw new Error(`Unexpected fetch call #${index + 1}: ${url}`);
    }

    const step = steps[index];
    index += 1;
    return step({
      url: String(url),
      init,
      index
    });
  };

  fetch.calls = () => index;
  return fetch;
}

test('binds all generated operations', async () => {
  const fetch = async () => jsonResponse({});
  const client = createZeyosClient({ fetch });

  assert.equal(Object.keys(client.api).length, SERVICES.api.operations.length);
  assert.equal(Object.keys(client.oauth2).filter((key) => typeof client.oauth2[key] === 'function').length >= SERVICES.oauth2.operations.length, true);
  assert.equal(Object.keys(client.legacyAuth).length, SERVICES.legacyAuth.operations.length);

  assert.equal(typeof client.api.listAccounts, 'function');
  assert.equal(typeof client.oauth2.getToken, 'function');
  assert.equal(typeof client.legacyAuth.login, 'function');
});

test('dryRun resolves the route + payload without sending a request', async () => {
  const fetch = async () => { throw new Error('fetch must not be called for a dry run'); };
  const client = createZeyosClient({ instance: 'demo', fetch, auth: { mode: 'session' } });

  const listReq = await client.api.listTickets(
    { fields: ['ID', 'name'], filters: { status: 1 }, limit: 5 },
    { dryRun: true }
  );
  assert.equal(listReq.dryRun, true);
  assert.equal(listReq.method, 'POST');
  assert.match(listReq.url, /\/demo\/api\/v1\/tickets$/);
  assert.deepEqual(listReq.body, { fields: ['ID', 'name'], filters: { status: 1 }, limit: 5 });
  assert.equal(listReq.bodyType, 'json');

  // Path params are routed into the URL, not the body.
  const getReq = await client.api.getTicket({ ID: 42, query: { extdata: 1 } }, { dryRun: true });
  assert.equal(getReq.method, 'GET');
  assert.match(getReq.url, /\/demo\/api\/v1\/tickets\/42\?extdata=1$/);
  assert.equal(getReq.body, undefined);
});

test('builds API URL with path and query parameters', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/demo/api/v1/accounts/42');
      assert.equal(parsed.searchParams.getAll('expand').join(','), 'name,email');
      assert.equal(parsed.searchParams.get('extdata'), '1');
      assert.equal(init.method, 'GET');
      return jsonResponse({ ID: 42, name: 'Test' });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const result = await client.api.getAccount({
    ID: 42,
    query: {
      expand: ['name', 'email'],
      extdata: 1
    }
  });

  assert.equal(result.ID, 42);
  assert.equal(fetch.calls(), 1);
});

test('supports live platform preset URL resolution', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://cloud.zeyos.com');
      assert.equal(parsed.pathname, '/acme/api/v1/accounts/9');
      assert.equal(init.method, 'GET');
      return jsonResponse({ ID: 9 });
    }
  ]);

  const client = createZeyosClient({
    instance: 'acme',
    platform: 'live',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const result = await client.api.getAccount({ ID: 9 });
  assert.equal(result.ID, 9);
});

test('infers update request bodies from non-parameter input fields', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/demo/api/v1/accounts/42');
      assert.equal(init.method, 'PATCH');

      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, {
        lastname: 'Updated',
        type: 1
      });

      return jsonResponse({ ID: 42, lastname: 'Updated', type: 1 });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const result = await client.api.updateAccount({
    ID: 42,
    lastname: 'Updated',
    type: 1
  });

  assert.equal(result.ID, 42);
  assert.equal(fetch.calls(), 1);
});

test('passes non-plain raw request bodies through without structured cloning', async () => {
  const params = new URLSearchParams({ a: '1', b: '2' });

  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/demo/api/v1/custom-endpoint');
      assert.equal(init.method, 'POST');
      assert.equal(init.body, params);
      return jsonResponse({ ok: true });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'none'
    }
  });

  const result = await client.request({
    service: 'api',
    method: 'POST',
    path: '/custom-endpoint',
    body: params,
    bodyType: 'raw'
  });

  assert.equal(result.ok, true);
  assert.equal(fetch.calls(), 1);
});

test('oauth2 helper builds and parses authorization URLs', () => {
  const client = createZeyosClient({
    instance: 'demo',
    fetch: async () => jsonResponse({}),
    auth: {
      oauth: {
        clientId: 'my-client'
      }
    }
  });

  const authorizationUrl = client.oauth2.buildAuthorizationUrl({
    redirectUri: 'https://example.com/callback',
    state: 'state-123',
    codeChallenge: 'challenge-token'
  });

  const parsed = new URL(authorizationUrl);
  assert.equal(parsed.pathname, '/demo/oauth2/v1/authorize');
  assert.equal(parsed.searchParams.get('client_id'), 'my-client');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  // scope is omitted from the URL when not supplied
  assert.equal(parsed.searchParams.has('scope'), false);

  const callback = client.oauth2.parseAuthorizationCallback('https://example.com/callback?code=abc123&state=state-123');
  assert.equal(callback.code, 'abc123');
  assert.equal(callback.state, 'state-123');
  assert.equal(callback.isError, false);
});

test('buildAuthorizationUrl includes scope when provided', () => {
  const client = createZeyosClient({
    instance: 'demo',
    fetch: async () => jsonResponse({}),
    auth: { oauth: { clientId: 'my-client' } }
  });

  const url = client.oauth2.buildAuthorizationUrl({
    redirectUri: 'https://example.com/callback',
    state: 'state-123',
    scope: 'global'
  });
  assert.equal(new URL(url).searchParams.get('scope'), 'global');

  // also accepts a nested options.scope (as some callers forward an options bag)
  const nested = client.oauth2.buildAuthorizationUrl({
    redirectUri: 'https://example.com/callback',
    options: { scope: 'local' }
  });
  assert.equal(new URL(nested).searchParams.get('scope'), 'local');
});

test('accepts redirect (303) success responses for oauth2 authorize', async () => {
  const fetch = createFetchSequence([
    ({ url }) => {
      assert.match(url, /\/demo\/oauth2\/v1\/authorize\?/);
      return new Response(null, {
        status: 303,
        headers: {
          location: 'https://cloud.zeyos.com/demo/?umi=auth&page=oauth'
        }
      });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch
  });

  const response = await client.oauth2.authorize(
    {
      client_id: 'client-id',
      redirect_uri: 'https://example.com/callback',
      response_type: 'code'
    },
    { raw: true }
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.location, 'https://cloud.zeyos.com/demo/?umi=auth&page=oauth');
});

test('accepts not-modified (304) responses as successful', async () => {
  const fetch = createFetchSequence([
    () =>
      new Response(null, {
        status: 304,
        headers: {
          etag: '\"abc\"'
        }
      })
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const response = await client.api.getAccount(
    {
      ID: 1
    },
    { raw: true }
  );

  assert.equal(response.status, 304);
  assert.equal(response.data, null);
});

test('exchangeAuthorizationCode posts form data and stores tokens', async () => {
  const tokenStore = new MemoryTokenStore();

  const fetch = createFetchSequence([
    async ({ url, init }) => {
      assert.match(url, /\/demo\/oauth2\/v1\/token$/);
      assert.equal(init.method, 'POST');

      const headers = new Headers(init.headers);
      assert.match(headers.get('authorization') || '', /^Basic\s+/);
      assert.match(headers.get('content-type') || '', /application\/x-www-form-urlencoded/);

      const body = String(init.body || '');
      const params = new URLSearchParams(body);
      assert.equal(params.get('grant_type'), 'authorization_code');
      assert.equal(params.get('code'), 'auth-code');

      return jsonResponse({
        token_type: 'Bearer',
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        refresh_token_expires_in: 8640000
      });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      oauth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tokenStore
      }
    }
  });

  const tokenSet = await client.oauth2.exchangeAuthorizationCode({
    code: 'auth-code'
  });

  assert.equal(tokenSet.accessToken, 'new-access-token');

  const stored = await tokenStore.get();
  assert.equal(stored.accessToken, 'new-access-token');
  assert.equal(stored.refreshToken, 'new-refresh-token');
});

test('auto mode proactively refreshes expired access tokens before bearer requests', async () => {
  const tokenStore = new MemoryTokenStore({
    tokenType: 'Bearer',
    accessToken: 'expired-token',
    refreshToken: 'refresh-token',
    expiresAt: Math.floor(Date.now() / 1000) - 30
  });

  const seenAuthHeaders = [];

  const fetch = createFetchSequence([
    ({ url, init }) => {
      assert.match(url, /\/demo\/oauth2\/v1\/token$/);
      const headers = new Headers(init.headers);
      assert.match(headers.get('authorization') || '', /^Basic\s+/);
      return jsonResponse({
        token_type: 'Bearer',
        access_token: 'fresh-token',
        expires_in: 3600,
        refresh_token: 'fresh-refresh-token',
        refresh_token_expires_in: 8640000
      });
    },
    ({ init }) => {
      const headers = new Headers(init.headers);
      seenAuthHeaders.push(headers.get('authorization'));
      return jsonResponse({ ID: 1, name: 'Recovered' });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'auto',
      oauth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tokenStore
      }
    }
  });

  const account = await client.api.getAccount({ ID: 1 });

  assert.equal(account.ID, 1);
  assert.deepEqual(seenAuthHeaders, ['Bearer fresh-token']);
  assert.equal(fetch.calls(), 2);
});

test('auto mode refreshes token on 401 and retries bearer request', async () => {
  const tokenStore = new MemoryTokenStore({
    tokenType: 'Bearer',
    accessToken: 'expired-token',
    refreshToken: 'refresh-token'
  });

  const seenAuthHeaders = [];

  const fetch = createFetchSequence([
    ({ init }) => {
      const headers = new Headers(init.headers);
      seenAuthHeaders.push(headers.get('authorization'));
      return textResponse('Unauthorized', 401, { 'content-type': 'text/plain' });
    },
    ({ url, init }) => {
      assert.match(url, /\/demo\/oauth2\/v1\/token$/);
      const headers = new Headers(init.headers);
      assert.match(headers.get('authorization') || '', /^Basic\s+/);
      return jsonResponse({
        token_type: 'Bearer',
        access_token: 'fresh-token',
        expires_in: 3600,
        refresh_token: 'fresh-refresh-token',
        refresh_token_expires_in: 8640000
      });
    },
    ({ init }) => {
      const headers = new Headers(init.headers);
      seenAuthHeaders.push(headers.get('authorization'));
      return jsonResponse({ ID: 1, name: 'Recovered' });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'auto',
      oauth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        tokenStore
      }
    }
  });

  const account = await client.api.getAccount({ ID: 1 });

  assert.equal(account.ID, 1);
  assert.deepEqual(seenAuthHeaders, ['Bearer expired-token', 'Bearer fresh-token']);

  const updated = await tokenStore.get();
  assert.equal(updated.accessToken, 'fresh-token');
  assert.equal(updated.refreshToken, 'fresh-refresh-token');
});

test('auto mode falls back to session after bearer 401', async () => {
  const tokenStore = new MemoryTokenStore({
    tokenType: 'Bearer',
    accessToken: 'bad-token'
  });

  const seen = [];

  const fetch = createFetchSequence([
    ({ init }) => {
      const headers = new Headers(init.headers);
      seen.push({
        authorization: headers.get('authorization'),
        cookie: headers.get('cookie')
      });
      return textResponse('Unauthorized', 401, { 'content-type': 'text/plain' });
    },
    ({ init }) => {
      const headers = new Headers(init.headers);
      seen.push({
        authorization: headers.get('authorization'),
        cookie: headers.get('cookie')
      });
      return jsonResponse({ ID: 77 });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'auto',
      oauth: {
        tokenStore
      },
      session: {
        enabled: true,
        cookie: () => 'session-cookie-id'
      }
    }
  });

  const account = await client.api.getAccount({ ID: 77 });
  assert.equal(account.ID, 77);

  assert.equal(seen[0].authorization, 'Bearer bad-token');
  assert.equal(seen[1].authorization, null);
  assert.equal(seen[1].cookie, 'ZEYOSID=session-cookie-id');
});

test('legacy login uses /auth/v1 and form encoding', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      assert.match(url, /\/demo\/auth\/v1\/login$/);
      assert.equal(init.method, 'POST');

      const headers = new Headers(init.headers);
      assert.match(headers.get('content-type') || '', /application\/x-www-form-urlencoded/);

      const params = new URLSearchParams(String(init.body || ''));
      assert.equal(params.get('name'), 'john.doe');
      assert.equal(params.get('identifier'), 'device-1');

      return jsonResponse({
        user: 1,
        application: null,
        token: 'legacy-token',
        identifier: 'device-1',
        expdate: 2000000000
      });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'none'
    }
  });

  const result = await client.legacyAuth.login({
    name: 'john.doe',
    password: 'secret',
    identifier: 'device-1'
  });

  assert.equal(result.user, 1);
  assert.equal(result.token, 'legacy-token');
});

test('infers list request body from filters/limit/count fields', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/demo/api/v1/accounts');
      assert.equal(init.method, 'POST');

      const headers = new Headers(init.headers);
      assert.match(headers.get('content-type') || '', /application\/json/);

      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, {
        filters: { visibility: 0, type: 1 },
        limit: 50,
        count: true
      });

      return jsonResponse([{ ID: 1 }, { ID: 2 }]);
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const result = await client.api.listAccounts({
    filters: { visibility: 0, type: 1 },
    limit: 50,
    count: true
  });

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 2);
  assert.equal(fetch.calls(), 1);
});

test('throws when a reserved key drops orphaned payload fields', async () => {
  const fetch = createFetchSequence([]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  await assert.rejects(
    () =>
      client.api.updateAccount({
        ID: 7,
        query: { term: 'acme' },
        lastname: 'Updated'
      }),
    (error) => {
      assert.ok(error instanceof ZeyosApiError);
      assert.match(error.message, /lastname/);
      assert.match(error.message, /query/);
      assert.match(error.message, /body/);
      return true;
    }
  );

  assert.equal(fetch.calls(), 0);
});

test('treats a scalar query as a full-text search payload field, not a control key', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.search, '');

      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, {
        filters: { visibility: 0 },
        query: 'acme',
        limit: 20
      });

      return jsonResponse([{ ID: 1 }]);
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const result = await client.api.listAccounts({
    filters: { visibility: 0 },
    query: 'acme',
    limit: 20
  });

  assert.equal(Array.isArray(result), true);
  assert.equal(fetch.calls(), 1);
});

test('populates ZeyosApiError shape on non-2xx responses', async () => {
  const fetch = createFetchSequence([
    () =>
      new Response(JSON.stringify({ error: 'not_found', message: 'no such account' }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' }
      })
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  await assert.rejects(
    () => client.api.getAccount({ ID: 999 }),
    (error) => {
      assert.ok(error instanceof ZeyosApiError);
      assert.equal(error.status, 404);
      assert.equal(error.statusText, 'Not Found');
      assert.equal(error.operationId, 'getAccount');
      assert.equal(error.service, 'api');
      assert.equal(error.method, 'GET');
      assert.match(error.url, /\/demo\/api\/v1\/accounts\/999$/);
      assert.deepEqual(error.body, { error: 'not_found', message: 'no such account' });
      return true;
    }
  );
});

test('normalizeListResult normalises arrays, wrappers, and invalid input', () => {
  assert.deepEqual(normalizeListResult([{ ID: 1 }, { ID: 2 }]), {
    data: [{ ID: 1 }, { ID: 2 }]
  });

  assert.deepEqual(normalizeListResult({ data: [{ ID: 3 }], count: 17 }), {
    data: [{ ID: 3 }],
    count: 17
  });

  assert.deepEqual(normalizeListResult(null), { data: [] });
  assert.deepEqual(normalizeListResult('nope'), { data: [] });
  assert.deepEqual(normalizeListResult({ data: 'not-an-array' }), { data: [] });
});

test('normalizeCountResult normalises direct counts, wrappers, and list fallbacks', () => {
  assert.equal(normalizeCountResult(17), 17);
  assert.equal(normalizeCountResult('12'), 12);
  assert.equal(normalizeCountResult({ count: '9' }), 9);
  assert.equal(normalizeCountResult([{ ID: 1 }, { ID: 2 }]), 2);
  assert.equal(normalizeCountResult({ data: [{ ID: 3 }] }), 1);
  assert.equal(normalizeCountResult({ count: 'not-a-number' }), 0);
  assert.equal(normalizeCountResult(null), 0);
});

test('form-url-encodes bodies with nested object/array/boolean values', async () => {
  const fetch = createFetchSequence([
    ({ url, init }) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/demo/api/v1/accounts');
      assert.equal(init.method, 'PUT');

      const headers = new Headers(init.headers);
      assert.match(headers.get('content-type') || '', /application\/x-www-form-urlencoded/);

      const params = new URLSearchParams(String(init.body));
      assert.equal(params.get('flag'), 'true');
      assert.equal(params.get('nested'), JSON.stringify({ a: 1, b: 'two' }));
      assert.deepEqual(params.getAll('tags'), ['x', 'y']);
      assert.equal(params.get('name'), 'Acme');

      return jsonResponse({ ID: 5 });
    }
  ]);

  const client = createZeyosClient({
    instance: 'demo',
    fetch,
    auth: {
      mode: 'session'
    }
  });

  const result = await client.api.createAccount({
    body: {
      name: 'Acme',
      flag: true,
      nested: { a: 1, b: 'two' },
      tags: ['x', 'y']
    },
    bodyType: 'form'
  });

  assert.equal(result.ID, 5);
  assert.equal(fetch.calls(), 1);
});

test('unknown api operation throws a helpful did-you-mean error', async () => {
  const client = createZeyosClient({ instance: 'demo', auth: { mode: 'none' }, fetch: async () => jsonResponse([]) });
  await assert.rejects(
    () => client.api.listDunning({}),
    (error) => {
      assert.ok(error instanceof ZeyosApiError);
      assert.match(error.message, /Unknown operation 'api\.listDunning'/);
      assert.match(error.message, /listDunningNotices/);
      return true;
    }
  );
});

test('low-level request() suggests the closest operation', async () => {
  const client = createZeyosClient({ instance: 'demo', auth: { mode: 'none' }, fetch: async () => jsonResponse([]) });
  await assert.rejects(
    () => client.request({ service: 'api', operationId: 'listActionsteps' }),
    (error) => {
      assert.ok(error instanceof ZeyosApiError);
      assert.match(error.message, /listActionSteps/);
      return true;
    }
  );
});

test('client.schema exposes resources, fields, enums and operation mapping', () => {
  const client = createZeyosClient({ instance: 'demo', auth: { mode: 'none' }, fetch: async () => jsonResponse([]) });
  const accounts = client.schema.describe('accounts');
  assert.equal(accounts.fields.type.enum['1'], 'CUSTOMER');
  assert.ok(client.schema.fields('accounts').includes('lastname'));
  assert.equal(client.schema.resourceForOperation('listDunningNotices'), 'dunning');
  assert.ok(client.schema.operationIds().includes('listTickets'));
});

test('client.schema.validate flags unknown fields, filter spelling and bad enums', () => {
  const client = createZeyosClient({ instance: 'demo', auth: { mode: 'none' }, fetch: async () => jsonResponse([]) });

  const unknownField = client.schema.validate('createAccount', { name: 'Acme' });
  assert.equal(unknownField.valid, false);
  assert.equal(unknownField.errors[0].suggestion, 'lastname');

  const filterSpelling = client.schema.validate('listTickets', { filter: { status: 1 } });
  assert.equal(filterSpelling.valid, false);
  assert.ok(filterSpelling.errors.some((entry) => entry.suggestion === 'filters'));

  const badEnum = client.schema.validate('updateTicket', { ID: 1, status: 99 });
  assert.equal(badEnum.valid, false);
  assert.match(badEnum.errors[0].message, /Valid:/);

  const good = client.schema.validate('createAccount', { lastname: 'Acme', firstname: 'Jane', currency: 'EUR' });
  assert.equal(good.valid, true);

  // currency is NOT NULL with no DB default, so a create without it is rejected by
  // the API. The spec marks nothing required, so validate() flags it from a curated
  // supplement (REQUIRED_CREATE_FIELDS) rather than from the spec.
  const missingRequired = client.schema.validate('createAccount', { lastname: 'Acme', firstname: 'Jane' });
  assert.equal(missingRequired.valid, false);
  assert.ok(missingRequired.errors.some((entry) => entry.field === 'currency'));
});

test('validate: true performs pre-flight validation and throws ZeyosValidationError', async () => {
  const fetch = createFetchSequence([]);
  const client = createZeyosClient({ instance: 'demo', auth: { mode: 'session' }, validate: true, fetch });
  await assert.rejects(
    () => client.api.createAccount({ name: 'Acme' }),
    (error) => {
      assert.ok(error instanceof ZeyosValidationError);
      assert.equal(error.operationId, 'createAccount');
      assert.ok(error.errors.length >= 1);
      return true;
    }
  );
  assert.equal(fetch.calls(), 0);
});

test('retries 429 responses honoring Retry-After then succeeds', async () => {
  const fetch = createFetchSequence([
    () => textResponse('busy', 429, { 'retry-after': '0' }),
    () => textResponse('busy', 429, { 'retry-after': '0' }),
    () => jsonResponse([{ ID: 1 }])
  ]);
  const client = createZeyosClient({
    instance: 'demo',
    auth: { mode: 'session' },
    retry: { baseDelayMs: 1 },
    fetch
  });
  const result = await client.api.listTickets({ filters: { visibility: 0 } });
  assert.equal(Array.isArray(result), true);
  assert.equal(fetch.calls(), 3);
});

test('retry: false surfaces the first 429 without retrying', async () => {
  const fetch = createFetchSequence([
    () => textResponse('busy', 429)
  ]);
  const client = createZeyosClient({ instance: 'demo', auth: { mode: 'session' }, retry: false, fetch });
  await assert.rejects(
    () => client.api.listTickets({ filters: { visibility: 0 } }),
    (error) => {
      assert.ok(error instanceof ZeyosApiError);
      assert.equal(error.status, 429);
      return true;
    }
  );
  assert.equal(fetch.calls(), 1);
});

test('an empty Retry-After header falls back to backoff and still retries', async () => {
  // An empty header must not be parsed as "0 seconds" (Number('') === 0); it should
  // fall through to the exponential backoff path so the retry still happens.
  const fetch = createFetchSequence([
    () => textResponse('busy', 503, { 'retry-after': '   ' }),
    () => jsonResponse([{ ID: 1 }])
  ]);
  const client = createZeyosClient({
    instance: 'demo',
    auth: { mode: 'session' },
    retry: { baseDelayMs: 1, maxDelayMs: 5 },
    fetch
  });
  const result = await client.api.listTickets({ filters: { visibility: 0 } });
  assert.equal(Array.isArray(result), true);
  assert.equal(fetch.calls(), 2);
});

test('aborting before a zero-delay retry stops further requests', async () => {
  const controller = new AbortController();
  const fetch = createFetchSequence([
    () => {
      // Abort while handling the first (retryable) response, before the retry fires.
      controller.abort();
      return textResponse('busy', 429, { 'retry-after': '0' });
    },
    () => jsonResponse([{ ID: 1 }])
  ]);
  const client = createZeyosClient({
    instance: 'demo',
    auth: { mode: 'session' },
    retry: { baseDelayMs: 1 },
    fetch
  });
  await assert.rejects(() =>
    client.api.listTickets({ filters: { visibility: 0 } }, { signal: controller.signal })
  );
  // Only the first request was sent; the abort prevented the zero-delay retry.
  assert.equal(fetch.calls(), 1);
});

test('normalizeListResult preserves a numeric-string count', () => {
  assert.deepEqual(normalizeListResult({ data: [{ ID: 1 }], count: '42' }), {
    data: [{ ID: 1 }],
    count: 42
  });
  // a non-numeric count string is dropped rather than coerced to NaN
  assert.deepEqual(normalizeListResult({ data: [{ ID: 1 }], count: 'lots' }), {
    data: [{ ID: 1 }]
  });
});
