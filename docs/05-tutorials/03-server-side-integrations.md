---
sidebar_position: 4
sidebar_label: Server-Side Integrations
---

# Server-Side Integrations

This guide covers the recommended backend pattern for ZeyOS: keep OAuth tokens on the server, refresh them automatically, and isolate business sync logic behind small job functions.

## When to Use This Pattern

Use a server-side integration when you are building:

- scheduled sync jobs
- background workers
- webhook handlers
- internal APIs that proxy or enrich ZeyOS data
- automation services that should not depend on a live browser session

## 1. Create a Persistent Token Store

The client only requires a `get()` and `set()` pair. Back it with a database, secrets manager, or a local JSON file during development.

```js
import { readFile, writeFile } from 'node:fs/promises';

class JsonFileTokenStore {
  constructor(path) {
    this.path = path;
  }

  async get() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch {
      return null;
    }
  }

  async set(tokenSet) {
    if (!tokenSet) {
      await writeFile(this.path, 'null\n');
      return;
    }
    await writeFile(this.path, JSON.stringify(tokenSet, null, 2) + '\n');
  }
}
```

## 2. Build the Client

```js
import { createZeyosClient } from '@zeyos/client';

const tokenStore = new JsonFileTokenStore('./tokens.json');

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      clientId: process.env.ZEYOS_CLIENT_ID,
      clientSecret: process.env.ZEYOS_CLIENT_SECRET,
      tokenStore,
      autoRefresh: true,
    },
  },
});
```

With `autoRefresh: true`, the client refreshes expired access tokens before retrying a request. Your token store must persist the refreshed token set.

## 3. Write Small Sync Functions

```js
import { normalizeListResult } from '@zeyos/client';

export async function fetchActiveTickets(limit = 100) {
  const result = await client.api.listTickets({
    fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'lastmodified'],
    filters: { visibility: 0, status: 4 },
    sort: ['-lastmodified'],
    limit,
  });

  return normalizeListResult(result).data;
}
```

Keep each sync unit focused: one resource, one query shape, one return shape.

## 4. Use `client.request()` for Advanced Cases

Use the generated methods first. Drop to `client.request()` when you need a custom path or an operation outside your current helper layer.

By operation ID:

```js
const response = await client.request({
  service: 'api',
  operationId: 'listTickets',
  body: {
    filters: { visibility: 0, priority: 4 },
    limit: 25,
  },
});
```

By explicit path and method:

```js
const response = await client.request({
  service: 'api',
  method: 'POST',
  path: '/tickets/',
  body: {
    filters: { visibility: 0, status: 4 },
    limit: 25,
  },
});
```

## 5. Handle Errors Explicitly

```js
import { ZeyosApiError } from '@zeyos/client';

try {
  await client.api.updateTicket({
    ID: 42,
    body: { status: 7 },
  });
} catch (err) {
  if (err instanceof ZeyosApiError) {
    console.error(err.status, err.operationId, err.url);
    console.error(err.body);
  }
  throw err;
}
```

Use structured error handling to separate:

- authentication failures
- missing records
- validation errors
- retryable upstream failures

## 6. Schedule Background Work

A typical cron-style sync job:

```js
export async function runTicketSync() {
  const tickets = await fetchActiveTickets(250);

  for (const ticket of tickets) {
    // Map ZeyOS data into your downstream system here
    console.log(ticket.ID, ticket.name);
  }
}

await runTicketSync();
```

Recommended job design:

- use explicit field lists
- use explicit sort order
- checkpoint on `lastmodified` or another stable field
- log request failures with resource identifiers
- keep delete behavior explicit and reviewable

## 7. Know the Limits

- Prefer `filters` in client code.
- Include `visibility: 0` for normal operational queries.
- Use explicit `body` objects for update operations that pass `ID`.
- Treat count-enabled responses defensively and normalize them in one place inside your backend.

## Next Steps

- [Integration Architecture](./01-integration-architecture.md)
- [Making Requests](../02-javascript-client/03-making-requests.md)
- [Authentication](../02-javascript-client/02-authentication.md)
