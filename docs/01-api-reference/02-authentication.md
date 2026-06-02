---
sidebar_label: Authentication
---

# Authentication

The ZeyOS API supports multiple authentication methods to accommodate different use cases -- from server-side integrations to browser-based applications. This guide covers OAuth2 token-based authentication, session cookie authentication, and the helpers provided by the `@zeyos/client` library.

## Authentication Overview

ZeyOS exposes an OAuth2-compatible authorization server at:

```
https://cloud.zeyos.com/{INSTANCE}/oauth2/v1/
```

This endpoint supports the standard OAuth 2.0 Authorization Code flow, token refresh, token revocation, and token introspection. For browser applications where the user is already logged into ZeyOS, session cookie authentication is also available.

## OAuth 2.0 Authorization Code Flow

The Authorization Code flow is the recommended approach for server-side applications and other trusted integrations that need to act on behalf of a user.

### Step 1: Build the Authorization URL

Redirect the user to the ZeyOS authorization endpoint to request access. The JavaScript example below assumes a trusted environment that can safely hold OAuth client credentials:

```js
import { createZeyosClient } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo',
  auth: {
    oauth: {
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    },
  },
});

const authUrl = client.oauth2.buildAuthorizationUrl({
  redirectUri: 'https://yourapp.example.com/callback',
  state: 'random-csrf-token',
});

// Redirect the user to authUrl
```

The authorization URL follows this format:

```
https://cloud.zeyos.com/{INSTANCE}/oauth2/v1/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.example.com/callback
  &response_type=code
  &state=random-csrf-token
```

### Step 2: User Authorizes

The user logs in (if not already authenticated) and approves access to your application. ZeyOS redirects the user back to your `redirect_uri` with an authorization code:

```
https://yourapp.example.com/callback?code=AUTHORIZATION_CODE&state=random-csrf-token
```

### Step 3: Exchange the Code for Tokens

Exchange the authorization code for an access token and refresh token:

**Using the JavaScript client:**

```js
const callback = client.oauth2.parseAuthorizationCallback(callbackUrl);

if (callback.isError) {
  console.error('Authorization failed:', callback.errorDescription);
} else {
  const tokenSet = await client.oauth2.exchangeAuthorizationCode({
    code: callback.code,
    redirectUri: 'https://yourapp.example.com/callback',
  });

  console.log('Access token:', tokenSet.accessToken);
  console.log('Refresh token:', tokenSet.refreshToken);
}
```

**Using curl:**

```bash
curl -X POST "https://cloud.zeyos.com/demo/oauth2/v1/token" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=https://yourapp.example.com/callback"
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g..."
}
```

### Step 4: Use the Bearer Token

Include the access token in the `Authorization` header for all API requests:

```bash
curl -X POST "https://cloud.zeyos.com/demo/api/v1/tickets" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

With the JavaScript client, tokens are managed automatically once stored:

```js
const tickets = await client.api.listTickets({ limit: 10 });
```

## Token Refresh

Access tokens expire after a limited time (indicated by `expires_in` in the token response). Use the refresh token to obtain a new access token without requiring user interaction.

**Using the JavaScript client:**

```js
const newTokenSet = await client.oauth2.refreshToken();
```

:::tip
When you configure `autoRefresh: true` in the client's OAuth settings, expired access tokens are refreshed automatically before each request. This requires `clientId` and `clientSecret`, so treat it as a trusted-environment pattern.
:::

**Using curl:**

```bash
curl -X POST "https://cloud.zeyos.com/demo/oauth2/v1/token" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=dGhpcyBpcyBhIHJlZnJlc2g..."
```

## Token Revocation

Revoke a token when the user logs out or your application no longer needs access:

**Using the JavaScript client:**

```js
await client.oauth2.revokeToken({
  token: tokenSet.accessToken,
});
```

**Using curl:**

```bash
curl -X POST "https://cloud.zeyos.com/demo/oauth2/v1/revoke" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=eyJhbGciOiJSUzI1NiIs..."
```

## Session Authentication

For browser-based applications where the user is already logged into ZeyOS, session cookie authentication provides a seamless experience without requiring a separate OAuth flow.

### How It Works

When a user is logged into ZeyOS in their browser, ZeyOS sets a session cookie (`ZEYOSID`). By including `credentials: 'include'` in fetch requests, the browser automatically sends this cookie, authenticating the request.

### Client Configuration

```js
const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo',
  auth: {
    mode: 'session',
    session: {
      enabled: true,
      credentials: 'include',
    },
  },
});
```

### Checking Session Status

You can verify whether the user has an active session by calling the `userinfo` endpoint:

```js
const endpoint = 'https://cloud.zeyos.com/demo/oauth2/v1/userinfo';
const response = await fetch(endpoint, {
  method: 'GET',
  credentials: 'include',
  headers: { 'Accept': 'application/json' },
});

if (response.ok) {
  const userInfo = await response.json();
  console.log('Logged in as:', userInfo.sub);
}
```

:::info
Session authentication only works in browser environments where the user is on the same domain (or an allowed origin) as the ZeyOS instance. It will not work in Node.js or server-side contexts.
:::

:::warning
Do not embed `clientSecret` in shipped browser-only code. For browser apps, prefer session-cookie authentication or perform the OAuth code exchange and refresh on a backend that stores the client credentials safely.
:::

## Security Schemes

The ZeyOS API supports three authentication schemes. Each API operation declares which schemes it accepts:

| Scheme | Type | Transport | Use Case |
|--------|------|-----------|----------|
| **Bearer** (OAuth2) | Token | `Authorization: Bearer {token}` | Server-side apps, SPAs, CLI tools |
| **Session** (Cookie) | Cookie | `Cookie: ZEYOSID={session_id}` | Browser apps where user is logged into ZeyOS |
| **Basic** (Client Credentials) | Header | `Authorization: Basic {base64}` | OAuth2 token endpoint requests |

Most API resource operations accept both **Bearer** and **Session** authentication. The OAuth2 token endpoints (`/token`, `/revoke`, `/introspect`) use **Basic** authentication with your client credentials.

The `@zeyos/client` library handles scheme selection automatically based on your configuration:

- `mode: 'auto'` (default) -- Tries bearer first if tokens are available, falls back to session.
- `mode: 'oauth'` -- Uses bearer tokens exclusively.
- `mode: 'session'` -- Uses session cookies exclusively.
- `mode: 'none'` -- No authentication (for public endpoints).

:::warning
Never expose your `client_secret` in client-side JavaScript. For browser-based SPAs, use the session authentication mode or implement a server-side proxy for the token exchange. Keep OAuth client credentials on your backend server where they cannot be inspected by end users.
:::

## Token Management

The client library provides built-in token storage and management:

```js
// Read the current token set
const tokenSet = await client.auth.getTokenSet();

// Manually set tokens (e.g., after loading from a database)
await client.auth.setTokenSet({
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});

// Clear all stored tokens (logout)
await client.auth.clearTokenSet();
```

For custom persistence (e.g., storing tokens in a database or encrypted file), implement the `TokenStore` interface:

```js
const customStore = {
  async get() {
    // Return the stored token set or null
    return loadFromDatabase();
  },
  async set(tokenSet) {
    // Persist the token set (or null to clear)
    await saveToDatabase(tokenSet);
  },
};

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo',
  auth: {
    oauth: {
      tokenStore: customStore,
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
      autoRefresh: true,
    },
  },
});
```
