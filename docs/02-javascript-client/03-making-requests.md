---
sidebar_label: Making Requests
---

# Making API Requests

The ZeyOS client generates methods for every REST operation defined in the ZeyOS OpenAPI specification. These methods provide a clean, high-level interface for all CRUD operations, filtering, sorting, and pagination.

## Generated Methods

All standard API operations are available as `client.api.<operationId>(input, options?)`. The `operationId` corresponds directly to the operation name in the ZeyOS OpenAPI specification.

```js
// Examples of generated methods
client.api.listTickets(...)
client.api.getTicket(...)
client.api.createTicket(...)
client.api.updateTicket(...)
client.api.deleteTicket(...)
client.api.listAccounts(...)
client.api.createTask(...)
```

Each method accepts an `input` object where you can mix path parameters, query parameters, and request body fields in a single flat object. The client automatically routes each property to the correct location based on the operation's parameter definitions.

## CRUD Operations

### List Records

Retrieve collections of records with optional filters, sorting, and pagination:

```js
const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority', 'duedate'],
  filters: { status: 1, visibility: 0 },
  sort: ['-lastmodified'],
  limit: 50,
});
```

### Get a Single Record

Fetch a specific record by ID. Additional flags control which related data is included:

```js
const ticket = await client.api.getTicket({
  ID: 42,
  extdata: 1,
  tags: 1,
});
```

### Create a Record

Create a new record by passing the required fields. For operations **without** path parameters (like create), you can pass all fields as a flat object:

```js
const newTicket = await client.api.createTicket({
  name: 'Fix login bug',
  status: 0,
  priority: 3,
  description: 'Users cannot log in with SSO',
  visibility: 0,
});
```

:::caution Required fields the spec does not declare
Some columns are `NOT NULL` with no database default, so a create that omits them fails server-side with an opaque HTTP 500 — even though the OpenAPI spec marks nothing as required. Most notably, **creating an `account` requires a `currency`** (e.g. `"EUR"`). `client.schema.validate('createAccount', …)` now flags this before you send it.

```js
await client.api.createAccount({ lastname: 'Acme Corp', type: 1, currency: 'EUR' });
```
:::

### Update a Record

Update an existing record with a PATCH request. Pass the `ID` and changed fields in one object:

```js
await client.api.updateTicket({
  ID: 42,
  status: 4,
  priority: 4,
});
```

:::tip Explicit body is also supported
Use `body` or `data` when you want to separate URL parameters from payload fields manually:

```js
await client.api.updateTicket({ ID: 42, body: { status: 4, priority: 4 } });
```
:::

The PATCH response body contains the full updated record. Use it to confirm the server applied your changes:

```js
const updated = await client.api.updateTicket({
  ID: 42,
  status: 4,
});
console.log(updated.status); // 4 -- confirmed by the server
```

### Delete a Record

Delete a record by ID:

```js
await client.api.deleteTicket({ ID: 42 });
```

### Check Existence

Use a HEAD request to check whether a record exists without downloading the full response body:

```js
const exists = await client.api.existsTicket({ ID: 42 });
// Returns true if the record exists (2xx/3xx), throws ZeyosApiError on 404
```

## Field Selection

Control which fields are returned in list responses. This reduces payload size and improves performance.

### Array Form

Pass an array of field names to return only those fields:

```js
const result = await client.api.listAccounts({
  fields: ['ID', 'lastname', 'contact.city'],
  filters: { visibility: 0 },
});
```

### Object Form (with Aliases)

Pass an object to rename fields in the response. Keys become the output names, values are the source field paths:

```js
const result = await client.api.listAccounts({
  fields: {
    'Id': 'ID',
    'Name': 'lastname',
    'City': 'contact.city',
    'Agent': 'assigneduser.name',
  },
  filters: { visibility: 0 },
});
```

:::note
Dot-notation field paths (e.g. `contact.city`, `assigneduser.name`) allow you to select fields from related or nested objects.
:::

## Filtering

ZeyOS provides two filter parameters. Use `filters` (plural) for the broadest compatibility -- it works with both scalar fields and GIN-indexed foreign key fields:

```js
// Standard filtering -- works for all field types
const active = await client.api.listTickets({
  filters: { status: 4, visibility: 0 },
});

// Filter by foreign key field (e.g. project, account)
const projectTickets = await client.api.listTickets({
  filters: { visibility: 0, project: projectId },
});
```

### `filter` vs `filters`

| Parameter | Supports | Notes |
|-----------|----------|-------|
| `filter` | Scalar fields (status, visibility, priority) | Defined in the OpenAPI spec. May not work for all FK fields. |
| `filters` | All field types including GIN-indexed foreign keys (project, account, ticket) | Recommended for general use -- handles both scalar and FK fields. |

:::tip
When in doubt, use `filters` (plural). Using `filter` (singular) with a foreign-key field like `project` silently returns unfiltered results rather than throwing an error, which makes problems hard to spot.
:::

### Full-Text Search

Use the `query` parameter to search across a resource's indexed text fields:

```js
const results = await client.api.listAccounts({
  fields: ['ID', 'lastname', 'contact.email'],
  filters: { visibility: 0 },
  query: 'acme',
  limit: 20,
});
```

## Distinct Results

Pass `distinct: true` to deduplicate result rows. This is useful when using dot-notation joins that may produce multiple rows per record:

```js
const result = await client.api.listAccounts({
  distinct: true,
  fields: ['ID', 'lastname', 'contact.country'],
  filters: { visibility: 0 },
});
```

## Sorting

Pass an array of field names prefixed with `+` (ascending) or `-` (descending):

```js
// Sort by last modified, newest first
const tickets = await client.api.listTickets({
  sort: ['-lastmodified'],
});

// Multi-field sort: priority descending, then name ascending
const tickets = await client.api.listTickets({
  sort: ['-priority', '+name'],
});
```

## Pagination

Use `limit` and `offset` to page through large result sets:

```js
// Get total count first
const countResult = await client.api.listTickets({
  count: true,
  filters: { status: 1, visibility: 0 },
});
// countResult contains the total number of matching records

// Fetch the first page
const page1 = await client.api.listTickets({
  limit: 50,
  offset: 0,
  filters: { status: 1, visibility: 0 },
});

// Fetch the second page
const page2 = await client.api.listTickets({
  limit: 50,
  offset: 50,
  filters: { status: 1, visibility: 0 },
});
```

:::tip
Use `count: true` to get the total number of matching records without fetching the full dataset. This is useful for building pagination controls.
:::

### Auto-pagination

To iterate an entire result set without managing `offset` yourself, use `client.paginate(operationId, input, opts)` — an async iterator that pages until a short/empty page (or `opts.max`) is reached. It removes the off-by-one and "I only got the first 1000 / 50 rows" mistakes the list caps otherwise invite.

```js
// Stream every matching ticket, one page at a time
for await (const ticket of client.paginate('listTickets', { filters: { visibility: 0 } }, { pageSize: 1000 })) {
  process(ticket);
}

// Eagerly collect up to a cap
const recent = await client.collect(
  'listTickets',
  { filters: { visibility: 0 }, sort: ['-lastmodified'] },
  { pageSize: 500, max: 2000 }
);
```

`opts`: `pageSize` (default 1000, clamped to the server max of 10000), `max` (stop after N records), and `requestOptions` (forwarded to each underlying call, e.g. `{ signal, timeoutMs }`). `collect` is the eager array form of `paginate`.

## Normalising List Responses

List endpoints are not uniform across the full surface area. Depending on the endpoint and response mode, you may see:

- a plain array
- an object wrapper with `data`
- count metadata alongside the payload when `count: true` is used

The normalization helpers are useful when you want call sites to share one response-shape contract:

```js
import { normalizeCountResult, normalizeListResult } from '@zeyos/client';

// Without count -- result is a plain array
const raw = await client.api.listTickets({ filters: { visibility: 0 } });
const { data } = normalizeListResult(raw);
// data is always an array

// With count metadata -- result may include both data and count
const raw2 = await client.api.listTickets({ filters: { visibility: 0 }, count: true });
const { data: tickets, count } = normalizeListResult(raw2);
// tickets: array, count: number

// Count-only request -- result may be a number or an object with count metadata
const countOnly = await client.api.listTickets({ filters: { visibility: 0 }, count: true });
const total = normalizeCountResult(countOnly);
```

## Extended Data

Many ZeyOS entities support **extended data** (extdata) -- custom fields defined through the platform's extensibility features. By default, extended data fields are not included in API responses. To include them, pass `extdata: 1` as a parameter.

### Including Extended Data in List Requests

For list operations, `extdata` is sent as a body parameter:

```js
const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority', 'duedate'],
  filters: { status: 1, visibility: 0 },
  sort: ['-lastmodified'],
  limit: 50,
  extdata: 1,
});
```

### Including Extended Data in GET Requests

For single-record GET operations, `extdata` is sent as a query parameter:

```js
const ticket = await client.api.getTicket({
  ID: 42,
  extdata: 1,
  tags: 1,
});
```

### Selecting Specific Extended Data Fields

You can reference individual extended data fields using dot notation in the `fields` parameter. Use the `extdata.fieldname` syntax to select only the custom fields you need:

```js
const tickets = await client.api.listTickets({
  fields: {
    'Id': 'ID',
    'Name': 'name',
    'Region': 'extdata.region',
    'CustomerType': 'extdata.customer_type',
  },
  filters: { status: 1, visibility: 0 },
  limit: 50,
});
```

:::note
When you select specific `extdata.*` fields via the `fields` parameter, you do not need to pass `extdata: 1` separately -- the selected fields will be included automatically.
:::

## Expanding JSON and Binary Columns

The `expand` parameter is used to inline the contents of **JSON columns** or **binary/file columns** that are normally returned as references or omitted for performance reasons. This applies to structured data columns such as `binfile` on messages, `items` on transactions, or `data` on objects.

```js
// Expand the binary file content of a message
const message = await client.api.getMessage({
  ID: 123,
  expand: ['binfile'],
});

// Expand the items array on a transaction
const transaction = await client.api.getTransaction({
  ID: 456,
  expand: ['items'],
});
```

:::caution
Do not confuse `expand` with `extdata`. The `expand` parameter is strictly for JSON and binary columns -- it does not apply to extended data fields. To include extended data, use `extdata: 1` instead.
:::

## Schema Introspection and Validation

The `client.schema` surface lets you (or an AI agent) discover the data model and validate inputs **without any network call** -- it is built from the generated schema. This is the fastest way to learn fields, types, foreign keys, and enum values before issuing a request.

```js
client.schema.resources();                 // all resource names
client.schema.describe('tickets');          // { name, type, fields: { status: { type, enum }, account: { fk }, … } }
client.schema.fields('accounts');           // ['ID', 'lastname', 'firstname', 'type', …]
client.schema.operations('tickets');        // ['listTickets', 'getTicket', 'createTicket', …]
client.schema.resourceForOperation('listDunningNotices'); // 'dunning'
client.schema.suggestOperation('listDunning');            // 'listDunningNotices'
```

### Validating a Call

`client.schema.validate(operationId, input)` returns structured, self-correcting hints. It never throws and is lenient about dot-notation joins (`contact.city`) and extended fields (`extdata.*`):

```js
const result = client.schema.validate('createAccount', { name: 'Acme' });
// {
//   valid: false,
//   errors: [{ field: 'name', message: 'Unknown field "name". Did you mean "lastname"?', suggestion: 'lastname' }]
// }
```

It flags unknown fields (with a suggestion), `filter` used where `filters` is preferred, invalid enum values (listing the valid set), and missing required create fields. The ZeyOS spec carries no required-field metadata, so a curated supplement covers known NOT-NULL-without-default columns — notably `accounts` require `currency`:

```js
client.schema.validate('createAccount', { lastname: 'Acme' });
// { valid: false, errors: [{ field: 'currency', message: 'Missing required field "currency" for accounts …', suggestion: 'currency' }] }
```

### Pre-flight Validation

Set `validate: true` on the client to validate every request before it is sent and throw a `ZeyosValidationError` (rather than letting the server reject it):

```js
import { ZeyosValidationError } from '@zeyos/client';

const client = createZeyosClient({ platform: 'live', instance: 'demo', validate: true });

try {
  await client.api.createAccount({ name: 'Acme' });   // wrong field
} catch (err) {
  if (err instanceof ZeyosValidationError) {
    console.log(err.operationId);   // 'createAccount'
    console.log(err.errors);        // structured hints (see above)
  }
}
```

Validation is **off by default** so that custom and extended fields are never blocked; enable it in agent or development workflows where fast, descriptive feedback is more valuable.

## Retries and Rate Limiting

The client automatically retries transient failures. By default it retries `429 Too Many Requests` and `503 Service Unavailable` up to twice, using exponential backoff with jitter and honoring a `Retry-After` header when present. Retries are abort-aware (an `AbortSignal` cancels pending waits).

```js
// Customize the policy
const client = createZeyosClient({
  platform: 'live',
  instance: 'demo',
  retry: {
    maxRetries: 3,
    retryOn: [429, 503],     // statuses to retry
    baseDelayMs: 300,        // backoff base
    maxDelayMs: 10000        // cap per wait
  }
});

// Disable retries entirely
const noRetry = createZeyosClient({ platform: 'live', instance: 'demo', retry: false });
```

:::note
Only `429`/`503` are retried by default -- statuses that clearly mean "try again later". `5xx` codes such as `500`/`502` are **not** retried automatically, to avoid re-applying a non-idempotent write that may have partially succeeded. Add them to `retryOn` only for read-heavy workloads.
:::

### Request timeout

A request with no built-in deadline can hang indefinitely if the connection stalls (e.g. an instance restarting). Set `timeoutMs` to bound each attempt; it composes with any `AbortSignal` you pass. The timeout applies **per attempt**, so a retry gets a fresh deadline.

```js
// Per request
await client.api.listTickets({ filters: { visibility: 0 } }, { timeoutMs: 8000 });

// Or a client-wide default
const client = createZeyosClient({ platform: 'live', instance: 'demo', timeoutMs: 8000 });
```

A timeout rejects with an `Error` whose `isTimeout === true` (and `code === 'ETIMEDOUT'`). A timeout is distinct from a caller abort: aborting your own `AbortSignal` always propagates immediately and is never retried.

### Network-error retries

Network-level failures (a dropped connection, DNS blip, or a timeout) are retried for **read** operations only — `GET`/`HEAD` plus side-effect-free `list`/`count`/`search` queries — using the same retry budget and backoff. Writes (`create`/`update`/`delete`) are **never** auto-retried on a network error, so a dropped connection can't cause a duplicate mutation. Override per request or per client with `retryOnNetworkError: true | false`.

```js
await client.api.listTickets({ filters: {} }, { retryOnNetworkError: true });  // force (already on for reads)
await client.api.createTicket({ name: 'x' }, { retryOnNetworkError: true });   // opt a write in, at your own risk
```

## Error Handling

All API errors are thrown as `ZeyosApiError` instances. This class extends `Error` and includes structured information about the failed request. When the server returns an error body with a message, a short snippet of it is folded into `err.message` (e.g. `api.listTickets failed with HTTP 400: unknown filter field: bogus`), so the thrown error says *why*, not just the status code. The full body is always on `err.body`.

```js
import { ZeyosApiError } from '@zeyos/client';

try {
  await client.api.getTicket({ ID: 999 });
} catch (err) {
  if (err instanceof ZeyosApiError) {
    console.log(err.status);       // 404
    console.log(err.statusText);   // 'Not Found'
    console.log(err.operationId);  // 'getTicket'
    console.log(err.service);      // 'api'
    console.log(err.method);       // 'GET'
    console.log(err.url);          // Full request URL
    console.log(err.body);         // Error response body (parsed JSON or text)
  }
}
```

The `ZeyosApiError` properties:

`JsonValue` means a parsed JSON scalar, array, or plain JSON object. Non-JSON error responses are returned as strings.

| Property | Type | Description |
|----------|------|-------------|
| `status` | `number` | HTTP status code (e.g. `404`, `401`, `500`) |
| `statusText` | `string` | HTTP status text (e.g. `'Not Found'`) |
| `operationId` | `string` | The operation that failed (e.g. `'getTicket'`) |
| `service` | `string` | The service key (e.g. `'api'`, `'oauth2'`) |
| `method` | `string` | HTTP method used (e.g. `'GET'`, `'POST'`) |
| `url` | `string` | The full request URL |
| `body` | `JsonValue` | The parsed JSON response body, plain-text error body, or `null` |
| `headers` | `Record<string,string>` | Response headers as a plain object |

### Unknown Operations

Calling an operation that does not exist rejects with a `ZeyosApiError` that suggests the closest match, instead of an opaque `is not a function` error -- useful when an operationId differs from the underlying table name:

```js
await client.api.listDunning({});
// ZeyosApiError: Unknown operation 'api.listDunning'. Did you mean 'listDunningNotices'?
```

### Validation Errors

When the client is created with `validate: true`, malformed requests reject with a `ZeyosValidationError` **before** any network call (see [Schema Introspection and Validation](#schema-introspection-and-validation)). It carries `operationId` and a structured `errors` array.

## Low-Level Requests

For endpoints not covered by the generated methods, or when you need full control over the request, use `client.request()`.

### By Operation ID

Reference a known operation by its service and operation ID:

```js
const result = await client.request({
  service: 'api',
  operationId: 'listTickets',
  body: { filters: { status: 1, visibility: 0 }, limit: 10 },
});
```

### By Path and Method

Specify the HTTP method and path directly for custom or undocumented endpoints:

```js
const result = await client.request({
  service: 'api',
  method: 'POST',
  path: '/tickets/',
  body: { filters: { status: 1, visibility: 0 } },
});
```

### Raw Responses

Pass `raw: true` to receive the full response envelope instead of just the parsed body:

```js
const response = await client.request({
  service: 'api',
  operationId: 'listTickets',
  body: { limit: 10 },
  raw: true,
});

console.log(response.status);     // 200
console.log(response.headers);    // Response headers
console.log(response.data);       // Parsed body
```

## Request Options

All generated methods and `client.request()` accept an optional second argument with request-level options:

| Option | Type | Description |
|--------|------|-------------|
| `signal` | `AbortSignal` | An `AbortController` signal to cancel the request |
| `timeoutMs` | `number` | Abort this attempt after N ms (composes with `signal`); also settable client-wide as `timeoutMs` |
| `retryOnNetworkError` | `boolean` | Force/disable retrying network errors & timeouts for this call (default: on for reads, off for writes) |
| `raw` | `boolean` | Return the full response envelope instead of just the data |
| `auth` | `string \| { mode?: string, accessToken?: string, access_token?: string, refreshToken?: string, refresh_token?: string, clientId?: string, client_id?: string, clientSecret?: string, client_secret?: string }` | Override the authentication mode or credentials for this request |
| `baseUrl` | `string` | Override the base URL for this request |
| `bodyType` | `'json' \| 'form'` | Force a body encoding |

Example with an abort controller:

```js
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

const tickets = await client.api.listTickets(
  { limit: 100 },
  { signal: controller.signal }
);
```

:::tip Persisting refreshed tokens
When using token mode with `autoRefresh` in a trusted environment, tokens are updated in the token store automatically. If you use a `MemoryTokenStore`, those refreshed tokens will be lost on page reload. Use the `syncTokens` pattern to persist them:

```js
async function syncTokens() {
  const tokenSet = await client.auth.getTokenSet();
  if (tokenSet?.accessToken) {
    localStorage.setItem('zeyos_tokens', JSON.stringify(tokenSet));
  }
}

// Call after important API operations
const tickets = await client.api.listTickets({ limit: 50 });
await syncTokens();
```
:::
