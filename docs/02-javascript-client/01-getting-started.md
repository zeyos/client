---
sidebar_label: Getting Started
---

# Getting Started

The ZeyOS JavaScript client provides a generated, dependency-light interface to the ZeyOS REST API. It works in both browser environments and Node.js 18+, with built-in support for OAuth 2.0, session-based authentication, and automatic token refresh.

Use the JavaScript client when:

- the CLI resource registry is not enough
- you are building a browser UI or a server-side integration
- you need request-level control through `client.request()`
- you want access to the full generated API surface instead of the CLI's curated subset

## Installation

The client is distributed as an ES module source package. If you are working inside this repository, import it directly from the source tree:

```js
import { createZeyosClient } from './src/index.js';
```

If you are consuming it from another project, install the package and import it by name:

```bash
npm install @zeyos/client
```

```js
import { createZeyosClient } from '@zeyos/client';
```

The client has zero runtime dependencies and relies only on the standard `fetch` API available in modern browsers and Node.js 18+.

## Creating a Client

The `createZeyosClient` factory function returns a frozen client object with generated API methods, OAuth 2.0 helpers, and low-level request capabilities.

```js
import { createZeyosClient } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'session',
    session: { enabled: true, credentials: 'include' },
  },
});

const tickets = await client.api.listTickets({ limit: 10 });
```

The returned `client` object exposes:

- **`client.api`** -- Generated methods for all standard REST operations (e.g. `listTickets`, `createAccount`, `getTask`)
- **`client.oauth2`** -- OAuth 2.0 token operations and authorization URL helpers
- **`client.legacyAuth`** -- Legacy session authentication operations (`login`, `logout`, `verify`, `getUserInfo`)
- **`client.request()`** -- Low-level escape hatch for custom or advanced requests
- **`client.auth`** -- Token management (`getTokenSet`, `setTokenSet`, `clearTokenSet`)
- **`client.metadata`** -- Read-only info about the generated client (`generatedAt` timestamp, `services` array)

## Platform Configuration

The `platform` option tells the client where your ZeyOS instance lives. There are three ways to specify it:

### URL String

Pass the full URL to your ZeyOS instance. The client extracts the origin and instance name automatically.

```js
const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
});
```

### Preset

Use a named preset for the ZeyOS cloud platform, combined with an `instance` name:

```js
const client = createZeyosClient({
  platform: 'live',
  instance: 'demo',
});
```

The `live` preset resolves to `https://cloud.zeyos.com`.

### Object

For full control, pass an object with `origin` and `instance`:

```js
const client = createZeyosClient({
  platform: {
    origin: 'https://cloud.zeyos.com',
    instance: 'demo',
  },
});
```

## Features

- **Zero dependencies** -- no external packages; only the standard `fetch` API is required
- **Browser + Node.js 18+** -- works in any environment with global `fetch`
- **Auto token refresh** -- transparently refreshes expired access tokens on 401 responses
- **Generated API methods** -- the broader generated API surface is available as `client.api.<operationId>()`
- **Session + OAuth support** -- choose between cookie-based sessions, bearer tokens, or automatic fallback
- **Low-level escape hatch** -- `client.request()` for custom endpoints and advanced use cases

## Configuration Reference

| Option | Type | Description |
|--------|------|-------------|
| `platform` | `string \| object` | ZeyOS instance URL, preset name (e.g. `'live'`), or object with `origin`/`instance` (and optionally `preset` or `url`) |
| `platform.origin` | `string` | Base origin URL (e.g. `'https://cloud.zeyos.com'`) |
| `platform.instance` | `string` | Instance name (e.g. `'demo'`) |
| `platform.preset` | `string` | Named preset (e.g. `'live'`) used when `origin` is omitted |
| `platform.url` | `string` | Full instance URL as an alternative to `origin`+`instance` |
| `instance` | `string` | Top-level instance name shortcut (used with preset-style `platform`) |
| `auth.mode` | `string` | Authentication mode: `'auto'` (default), `'oauth'`, `'session'`, or `'none'` |
| `auth.oauth.clientId` | `string` | OAuth 2.0 client ID for token operations |
| `auth.oauth.clientSecret` | `string` | OAuth 2.0 client secret for token operations |
| `auth.oauth.tokenStore` | `TokenStore` | Token storage backend (must implement `get()` and `set()`) |
| `auth.oauth.autoRefresh` | `boolean` | Automatically refresh access tokens on 401 responses (default: `true`) |
| `auth.session.enabled` | `boolean` | Enable session-based authentication (default: `true`) |
| `auth.session.credentials` | `string` | Fetch credentials mode: `'include'`, `'same-origin'`, or `'omit'` |
| `auth.session.cookie` | `string \| function` | Explicit session cookie value or async function returning one (Node.js) |
| `headers` | `object` | Default headers applied to every request |
| `fetch` | `function` | Custom `fetch` implementation (defaults to `globalThis.fetch`) |

## Next Steps

- **[Application Developers](../05-tutorials/00-application-developers.md)** -- choose the browser or server-side integration path
- **[Authentication](./02-authentication.md)** -- learn about session mode, OAuth 2.0 flows, and token management
- **[Making Requests](./03-making-requests.md)** -- explore CRUD operations, filtering, sorting, pagination, and error handling
- **[Practical Guide](./04-practical-guide.md)** -- real-world patterns and gotchas discovered during implementation
- **[Sample Application](../04-sample-apps/01-kanban.md)** -- run the included Kanban board demo to see the client in action
