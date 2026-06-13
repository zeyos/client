---
sidebar_label: Authentication
---

# Authentication

The ZeyOS client supports multiple authentication strategies that can be selected via the `auth.mode` configuration option. The client determines how to authenticate each request based on the chosen mode and the security requirements of the target API operation.

## Auth Modes

| Mode | Behavior |
|------|----------|
| `auto` (default) | Tries bearer token first, attempts token refresh on 401, then falls back to session cookies |
| `oauth` | Bearer token only; uses access tokens from the configured token store |
| `session` | Session cookies only; relies on browser session or an explicit cookie value |
| `none` | No authentication; requests are sent without any credentials |

## Session Mode

Session mode is the simplest option when the user is already logged into ZeyOS in the same browser. The client sends requests with `credentials: 'include'`, allowing the browser to attach the existing session cookie automatically.

```js
import { createZeyosClient } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'session',
    session: { enabled: true, credentials: 'include' },
  },
});

// Requests use the browser's session cookie
const tickets = await client.api.listTickets({ limit: 10 });
```

:::tip When to use session mode
Session mode is ideal for apps embedded inside the ZeyOS platform, browser extensions, or any scenario where the user has already authenticated with ZeyOS in the same browser. No tokens need to be stored or managed -- the browser handles everything.
:::

## Token Mode

For standalone applications, server-side scripts, or situations where you have pre-obtained tokens, use OAuth mode with a token store.

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const tokenStore = new MemoryTokenStore({
  accessToken: 'your-access-token',
  refreshToken: 'your-refresh-token',
});

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: { tokenStore },
  },
});

// Requests use the bearer token from the store
const accounts = await client.api.listAccounts({ limit: 25 });
```

This is the safest default when you already have a valid access token. When `autoRefresh` is enabled and the token has expired or a bearer request receives a 401 response, the client uses the refresh token to obtain a new access token. This requires `clientId` and `clientSecret` to be configured:

```js
const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore,
      autoRefresh: true,
      clientId: 'your-client-id',
      clientSecret: 'your-client-secret',
    },
  },
});
```

## Token Store

The built-in `MemoryTokenStore` keeps tokens in memory. Tokens are lost when the process exits or the page is refreshed.

For persistent storage, implement a custom token store with `get()` and `set()` methods:

```js
class LocalStorageTokenStore {
  async get() {
    const raw = localStorage.getItem('zeyos_tokens');
    return raw ? JSON.parse(raw) : null;
  }

  async set(tokenSet) {
    if (tokenSet) {
      localStorage.setItem('zeyos_tokens', JSON.stringify(tokenSet));
    } else {
      localStorage.removeItem('zeyos_tokens');
    }
  }
}

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore: new LocalStorageTokenStore(),
    },
  },
});
```

If you want `autoRefresh: true`, add `clientId` and `clientSecret` in a trusted environment. For browser-only apps, prefer session mode or a backend-assisted token flow rather than embedding a client secret in shipped code.

A token set object contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | `string` | The OAuth 2.0 access token |
| `refreshToken` | `string \| null` | The refresh token (if issued) |
| `tokenType` | `string` | Token type, typically `'Bearer'` |
| `expiresIn` | `number \| null` | Token lifetime in seconds from issuance |
| `expiresAt` | `number \| null` | Absolute expiry as a Unix timestamp (seconds) |
| `obtainedAt` | `number` | Unix timestamp when the token was obtained |
| `refreshTokenExpiresIn` | `number \| null` | Refresh token lifetime in seconds |
| `refreshTokenExpiresAt` | `number \| null` | Refresh token absolute expiry (Unix timestamp) |

## OAuth 2.0 Flow

For server-side or other trusted applications that can safely hold OAuth client credentials, use the standard OAuth 2.0 authorization code flow:

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const tokenStore = new MemoryTokenStore();

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore,
      clientId: 'your-client-id',
      clientSecret: 'your-client-secret',
    },
  },
});

// 1. Build the authorization URL and redirect the user
const url = client.oauth2.buildAuthorizationUrl({
  redirectUri: 'https://myapp.com/callback',
  state: crypto.randomUUID(),
});

// 2. After the user authorizes, exchange the code for tokens
const tokenSet = await client.oauth2.exchangeAuthorizationCode({
  code: 'authorization-code-from-callback',
  redirectUri: 'https://myapp.com/callback',
});

// 3. Tokens are automatically stored in the tokenStore
// All subsequent API calls use the new tokens
const user = await client.api.listAccounts({ limit: 1 });
```

You can also parse the callback URL to extract the authorization code and detect errors:

```js
const callback = client.oauth2.parseAuthorizationCallback(
  'https://myapp.com/callback?code=abc123&state=xyz'
);

if (callback.isError) {
  console.error(callback.error, callback.errorDescription);
} else {
  const tokenSet = await client.oauth2.exchangeAuthorizationCode({
    code: callback.code,
  });
}
```

:::warning
The current OAuth helper expects `clientSecret` for authorization-code exchange and token refresh. Do not run that flow directly in shipped browser-only code. Use session mode in the browser or move the code exchange and refresh logic to a backend.
:::

## Token Operations

The `client.oauth2` namespace provides methods for managing tokens throughout their lifecycle:

```js
// Refresh the current access token
const newTokenSet = await client.oauth2.refreshToken();

// Revoke a token (access or refresh)
await client.oauth2.revokeToken({ token: 'token-to-revoke' });

// Introspect a token to check its validity and metadata
const info = await client.oauth2.introspectToken({ token: 'token-to-check' });
```

You can also manage the token set directly through the `client.auth` interface:

```js
// Read the current token set
const tokenSet = await client.auth.getTokenSet();

// Replace the stored token set
await client.auth.setTokenSet({
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
});

// Clear all stored tokens
await client.auth.clearTokenSet();
```

## Auto Mode

The default `auto` mode implements an intelligent fallback chain:

1. **Bearer token** -- if the token store contains an access token, use it
2. **Token refresh** -- if the stored token is expired or the bearer request returns 401 and a refresh token is available (with `clientId`/`clientSecret`), refresh the access token
3. **Session fallback** -- if bearer authentication is unavailable or fails, fall back to session cookies (when `session.enabled` is `true`)

This makes `auto` mode the most flexible option. It works seamlessly when tokens are available and gracefully degrades to session authentication when they are not.

```js
const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'auto', // this is the default
    oauth: {
      tokenStore,
      clientId: 'your-client-id',
      clientSecret: 'your-client-secret',
      autoRefresh: true,
    },
    session: { enabled: true, credentials: 'include' },
  },
});
```

:::warning
Never embed `clientSecret` in browser-facing JavaScript for production applications. Client secrets should only be used in server-side code or trusted environments. For browser-only apps, use session mode or a backend proxy that handles token exchange.
:::

## Legacy Authentication (`client.legacyAuth`)

The `client.legacyAuth` namespace exposes the ZeyOS legacy session authentication API. These operations target a separate endpoint (`/{INSTANCE}/auth/v1/`) and are primarily used by ZeyOS platform apps that manage session lifecycle directly rather than through OAuth 2.0.

| Method | Description |
|--------|-------------|
| `client.legacyAuth.login(input)` | Start a session using username and password credentials |
| `client.legacyAuth.logout()` | Terminate the current session |
| `client.legacyAuth.verify()` | Check whether the current session is still valid (HEAD request) |
| `client.legacyAuth.getUserInfo()` | Retrieve information about the currently authenticated user |

```js
// Verify current session validity
await client.legacyAuth.verify();

// Get info about the logged-in user
const userInfo = await client.legacyAuth.getUserInfo();

// Log out
await client.legacyAuth.logout();
```

:::info
For most integrations, prefer OAuth 2.0 (via `client.oauth2`) or session cookie mode (via `auth.mode: 'session'`). The `legacyAuth` API is primarily intended for internal ZeyOS platform use and scripts that run within an already-authenticated ZeyOS session.
:::
