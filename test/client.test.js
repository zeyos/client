import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createZeyosClient, MemoryTokenStore } from '../src/index.js';
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

  const callback = client.oauth2.parseAuthorizationCallback('https://example.com/callback?code=abc123&state=state-123');
  assert.equal(callback.code, 'abc123');
  assert.equal(callback.state, 'state-123');
  assert.equal(callback.isError, false);
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
