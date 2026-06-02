---
sidebar_label: Practical Guide
---

# Practical Implementation Guide

This guide documents patterns and gotchas discovered while building a real application on top of the ZeyOS JavaScript client. It supplements the reference documentation with things that only become apparent once you start making actual API calls.

## HTTP Method Conventions

ZeyOS uses an unconventional but consistent REST convention that often surprises developers:

| Operation | HTTP Method | Notes |
|-----------|-------------|-------|
| List records | **POST** | Query params (filters, sort, fields) go in the request body |
| Get a record | **GET** | |
| Create a record | **PUT** | Not POST — ZeyOS uses PUT for creation |
| Update a record | **PATCH** | Partial updates; only send fields you want to change |
| Delete a record | **DELETE** | |
| Check existence | **HEAD** | Returns `true` (no body) on success |

The most important one to internalise: **list operations are POST requests**. This makes sense once you consider that complex queries with nested filters would quickly exceed URL length limits as query strings.

## Passing the Request Body for Update Operations

When calling an operation that has **both a path parameter and a request body** (i.e. PATCH and some PUTs), you must pass the body fields using the explicit `body` key — **not** spread flat alongside the ID:

```js
// ✗ WRONG — the client sees 'ID' in the input, determines no body inference
//   is needed, and sends an empty request body. No fields are updated.
await client.api.updateTicket({ ID: 42, status: 4, priority: 2 });

// ✓ CORRECT — 'ID' is routed to the URL path; 'body' becomes the request body
await client.api.updateTicket({ ID: 42, body: { status: 4, priority: 2 } });
```

The same rule applies to all PATCH operations:

```js
await client.api.updateTask({ ID: taskId, body: { name: 'New name', duedate: ts } });
await client.api.updateAccount({ ID: accountId, body: { lastname: 'Smith' } });
```

**Why this happens:** The client uses an inference algorithm to decide whether the flat input object should be treated as the request body. When the input contains a field that matches a path parameter name (like `ID`), the algorithm conservatively assumes the caller has already separated path params from body params — and skips body inference. Using an explicit `body` key bypasses this and sends exactly what you intend.

Operations without path parameters (like `createTicket`, `listTickets`) are not affected and work fine with flat inputs.

## `filter` vs `filters`

The ZeyOS API exposes two distinct filtering parameters, and the one you need depends on the field type:

| Parameter | Use for | Example |
|-----------|---------|---------|
| `filter` | Simple scalar fields (integers, strings, enums) | `filter: { visibility: 0, status: 1 }` |
| `filters` | GIN-indexed fields — foreign key references and array-type columns | `filters: { ticket: ticketId, project: projectId }` |

In practice this means:

```js
// Listing tickets — status and visibility are scalar fields → use 'filter'
const tickets = await client.api.listTickets({
  filters: { visibility: 0, project: projectId },
  sort: ['-lastmodified'],
  limit: 500,
});

// Listing tasks for a ticket — 'ticket' is a GIN-indexed FK → use 'filters'
const tasks = await client.api.listTasks({
  fields: ['ID', 'tasknum', 'name', 'duedate', 'assigneduser'],
  filters: { ticket: ticketId, visibility: 0 },
  sort: ['+name'],
  limit: 200,
});
```

:::tip
When in doubt, use `filters`. It appears to handle both scalar and FK fields correctly. Using `filter` for a FK field silently returns unfiltered results rather than throwing an error, which makes this particularly easy to miss.
:::

## Always Include `visibility: 0`

ZeyOS records have a `visibility` field that controls soft-deletion and archiving. Records with `visibility > 0` are typically hidden from normal views. Always include `visibility: 0` in your filters unless you intentionally want to retrieve archived or deleted records:

```js
const filter = { visibility: 0 };
// Add resource-specific filters after
if (projectId) filter.project = projectId;
```

## Normalising List Responses

List operations are not perfectly uniform across the whole surface area. Always normalise defensively:

```js
const result = await client.api.listTickets({ filters: { visibility: 0 } });
const tickets = Array.isArray(result) ? result : (result?.data ?? []);
```

If you request count metadata, inspect that shape separately instead of assuming the same wrapper on every endpoint.

## Date and Timestamp Handling

ZeyOS stores all dates as **Unix timestamps in seconds** (not milliseconds). When reading:

```js
// Convert to a JavaScript Date
const date = new Date(ticket.duedate * 1000);

// Format for display
const label = new Date(ticket.duedate * 1000).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric',
});

// Check if overdue
const isOverdue = ticket.duedate * 1000 < Date.now();
```

When writing (e.g. from an HTML `<input type="date">`):

```js
const dueDateVal = form.querySelector('#due-date').value; // '2026-03-15'
const duedate = dueDateVal
  ? Math.floor(new Date(dueDateVal).getTime() / 1000)
  : null;

await client.api.updateTicket({ ID: id, body: { duedate } });
```

## Selecting Fields for Performance

Always pass a `fields` array in list requests. Without it, every field on every record is returned, which can significantly increase payload size and response time:

```js
// ✗ Returns all fields for every ticket
const tickets = await client.api.listTickets({ limit: 500 });

// ✓ Returns only what you need
const tickets = await client.api.listTickets({
  fields: ['ID', 'ticketnum', 'name', 'status', 'priority', 'duedate'],
  filters: { visibility: 0 },
  limit: 500,
});
```

For single-record GET operations, field selection is not available — all standard fields are returned. Use query flags like `extdata: 1` and `tags: 1` to opt into additional data:

```js
const ticket = await client.api.getTicket({ ID: id, extdata: 1, tags: 1 });
```

## Optimistic UI Updates with Server Verification

For immediate feedback on user actions (like drag-and-drop), apply the change to local state first, then confirm with the server and revert if it fails. Use the response body to confirm the actual resulting value:

```js
const fromStatus = ticket.status;

// 1. Optimistic update — instant visual feedback
ticket.status = toStatus;
updateColumn(fromStatus);
updateColumn(toStatus);

try {
  // 2. Send PATCH — response body contains the updated record
  const updated = await client.api.updateTicket({
    ID: ticket.ID,
    body: { status: toStatus },
  });

  // 3. Confirm — use the server's value in case it was clamped or rejected
  const confirmedStatus = updated?.status ?? toStatus;
  if (confirmedStatus !== toStatus) {
    ticket.status = confirmedStatus;
    updateColumn(toStatus);
    updateColumn(confirmedStatus);
  }
} catch (err) {
  // 4. Revert on failure
  ticket.status = fromStatus;
  updateColumn(fromStatus);
  updateColumn(toStatus);
  showError(`Move failed: ${err.message}`);
}
```

## Persisting Refreshed Tokens

When using token mode with `autoRefresh: true` in a trusted environment, the client silently refreshes expired access tokens. The refreshed tokens are stored in the `MemoryTokenStore` but lost on page reload unless you persist them explicitly. Call a sync function after important API operations:

```js
async function syncTokens() {
  try {
    const ts = await client.auth.getTokenSet();
    if (ts?.accessToken) {
      localStorage.setItem('zeyos_tokens', JSON.stringify({
        accessToken:           ts.accessToken,
        refreshToken:          ts.refreshToken,
        expiresAt:             ts.expiresAt,
        refreshTokenExpiresAt: ts.refreshTokenExpiresAt,
      }));
    }
  } catch {
    // Non-critical — silently ignore
  }
}

// Usage
const tickets = await client.api.listTickets({ filters: { visibility: 0 } });
await syncTokens(); // Persist any refreshed tokens
```

## Session Detection Without Tokens

If you don't have an OAuth token but the user is already logged into ZeyOS in the same browser, you can detect their session via the userinfo endpoint:

```js
async function trySessionAuth(instanceUrl) {
  try {
    const res = await fetch(`${instanceUrl}oauth2/v1/userinfo`, {
      credentials: 'include',
    });
    if (res.ok) return await res.json();
  } catch {
    // No session
  }
  return null;
}

const userInfo = await trySessionAuth('https://cloud.zeyos.com/demo/');
if (userInfo) {
  // Session is active — initialize in session mode
  const client = createZeyosClient({
    platform: instanceUrl,
    auth: { mode: 'session', session: { enabled: true, credentials: 'include' } },
  });
}
```

:::note
Session mode requires that your app is served from the same origin as ZeyOS, or that the ZeyOS instance is configured to allow cross-origin requests with credentials. If you are on a different domain, token mode is more reliable.
:::

## Navigating to ZeyOS Views

To link users directly to a record inside the ZeyOS web interface, construct a URL in this format:

```
<INSTANCE_URL>?umi=<MODULE>&page=<PAGE>&id=<RECORD_ID>&tab=<TAB>
```

Common examples:

```js
const baseUrl = 'https://cloud.zeyos.com/demo/';

// Link to a ticket
`${baseUrl}?umi=tickets&page=details_ticket&id=${ticketId}&tab=0`

// Link to a task (within the tickets module)
`${baseUrl}?umi=tickets&page=details_ticket&id=${taskId}&tab=0`

// Link to an account
`${baseUrl}?umi=accounts&page=details_account&id=${accountId}&tab=0`
```

## Extended Data (extdata)

Many ZeyOS entities support custom fields via `extdata`. These are returned as a nested object:

```js
// Request extended data in a list
const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'extdata.region', 'extdata.customer_type'],
  filters: { visibility: 0 },
});

// Or include all extdata for single-record fetches
const ticket = await client.api.getTicket({ ID: id, extdata: 1 });
console.log(ticket.extdata); // { region: 'EMEA', customer_type: 'Enterprise', ... }
```

When saving extended data back, pass it as a plain object:

```js
await client.api.updateTicket({
  ID: id,
  body: {
    extdata: { region: 'APAC', customer_type: 'SMB' },
  },
});
```

## Common Status and Priority Values

Ticket and task status and priority values are plain integers. The canonical values observed in the ZeyOS API:

### Ticket Status

| Value | Label |
|-------|-------|
| `0` | Not Started |
| `1` | Awaiting Acceptance |
| `2` | Accepted |
| `3` | Rejected |
| `4` | Active |
| `5` | Inactive |
| `6` | Feedback Required |
| `7` | Testing |
| `8` | Cancelled |
| `9` | Completed |
| `10` | Failed |
| `11` | Booked |

### Ticket Priority

| Value | Label |
|-------|-------|
| `0` | Lowest |
| `1` | Low |
| `2` | Medium |
| `3` | High |
| `4` | Highest |

## Error Handling Checklist

`ZeyosApiError` is thrown for all non-2xx responses. Key properties to check:

```js
import { ZeyosApiError } from '@zeyos/client';

try {
  await client.api.updateTicket({ ID: id, body: data });
} catch (err) {
  if (!(err instanceof ZeyosApiError)) throw err; // Re-throw unexpected errors

  if (err.status === 401) {
    // Session expired or token invalid — redirect to login
  } else if (err.status === 403) {
    // Insufficient permissions
  } else if (err.status === 404) {
    // Record does not exist
  } else if (err.status === 409) {
    // Conflict — record was modified since last read (check If-Match header usage)
  } else {
    // Generic error — err.body often contains a human-readable message
    console.error(err.body?.message ?? err.message);
  }
}
```

:::tip
On 401, the client automatically retries with a refreshed token if `autoRefresh: true` is set, a refresh token is available, and OAuth client credentials are configured. You will only see a 401 error if the refresh also fails — typically meaning the user's session has fully expired.
:::
