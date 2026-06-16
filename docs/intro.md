---
sidebar_position: 1
sidebar_label: Introduction
slug: /
---

# ZeyOS for Agents and Applications

ZeyOS is a business platform that unifies CRM, project management, ticketing, invoicing, and related operational data behind a single API surface. For external integrations, you should think of ZeyOS as the central provider for business data and business logic that feeds coding agents, connected applications, internal tools, and automation services.

These docs are organized around two entry paths:

- **[Coding Agents](./04-agent-workflows/00-coding-agents.md)** for CLI-first automation and operational tooling
- **[Application Developers](./05-tutorials/00-application-developers.md)** for browser UIs, server-side integrations, and connected apps

:::info Scope
This documentation set currently focuses on **external integrations**. It covers the CLI, the JavaScript client, raw REST/OpenAPI usage, and reusable sample application patterns. It does not document authoring native ZeyOS platform artifacts.
:::

## How Are You Integrating?

| Interface | Best for | Start here |
|-----------|----------|------------|
| **CLI** (`zeyos`) | Coding agents, shell automation, operational CRUD on curated resources | [Coding Agents](./04-agent-workflows/00-coding-agents.md) |
| **JavaScript Client** (`@zeyos/client`) | Browser apps, Node services, scheduled jobs, full generated API coverage | [Application Developers](./05-tutorials/00-application-developers.md) |
| **REST/OpenAPI** | Non-JavaScript runtimes, SDK generation, custom HTTP clients | [API Reference](./01-api-reference/03-resources.md) |

### Coverage Boundary

- The **CLI** is the default interface for coding agents, but it intentionally exposes a curated registry of common resources. Use `zeyos resources` to see the supported set.
- The **JavaScript client** covers the broader generated API surface and is the recommended escalation path when the CLI registry is not enough.
- The **raw API reference** remains the lowest-level source of truth for endpoints, query language, and schema details.

## API Base URL

Every ZeyOS instance exposes its REST API at a predictable base URL:

```
https://cloud.zeyos.com/{INSTANCE}/api/v1/
```

Replace `{INSTANCE}` with your ZeyOS instance identifier (e.g. `demo`, `acme-corp`).

## Authentication

All API requests require authentication. ZeyOS supports two authentication methods:

- **OAuth 2.0 Bearer Tokens** -- The recommended approach for server-side integrations, scheduled jobs, CLI tools, and browser apps that receive tokens from a trusted flow. Obtain tokens through the ZeyOS OAuth2 endpoint at `https://cloud.zeyos.com/{INSTANCE}/oauth2/v1/`.
- **Session Cookies** -- For browser-based applications where the user is already logged into ZeyOS. The browser sends the `ZEYOSID` session cookie automatically.

Include a bearer token in the `Authorization` header for all API requests:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

See the [Authentication](./01-api-reference/02-authentication.md) guide for full details on the OAuth 2.0 Authorization Code flow, token refresh, token revocation, and session-based authentication.

## Return Values and Error Handling

The ZeyOS REST API returns JSON data along with an HTTP status code indicating the outcome of a request.

- **HTTP 200** or **201** indicates a successful response. The result is a **JSON object**.
- **HTTP 400** or greater indicates an error. The response is a **text message** describing the problem.

We recommend treating any HTTP status code greater than or equal to 400 as an error.

## HTTP Methods

The API uses the following HTTP methods, which differ from typical REST conventions in some cases:

| Operation | HTTP Method | Description |
|-----------|-------------|-------------|
| **List** | `POST` | Retrieve a filtered list of records (query parameters are sent in the request body) |
| **Get** | `GET` | Retrieve a single record by ID |
| **Create** | `PUT` | Create a new record |
| **Update** | `PATCH` | Partially update an existing record |
| **Delete** | `DELETE` | Delete a record by ID |
| **Exists** | `HEAD` | Check if a record exists (returns no body) |

:::info
**List** operations use `POST` rather than `GET` because the query language (filters, field selection, sorting) can produce payloads that exceed URL length limits. Sending the query in the request body ensures complex queries work reliably.
:::

## Integration Conventions

Across the CLI, JavaScript client, and sample applications, the same operational rules apply:

- Prefer `filters` in JavaScript client code for compatibility across scalar and foreign-key fields.
- Include `visibility: 0` unless you intentionally want archived or deleted records.
- For updates, pass changed fields alongside the `ID` directly (`{ ID, status }`) or wrap them in an explicit `body` object (`{ ID, body: { status } }`) — both work; the explicit `body` is only needed to disambiguate a payload field that collides with a reserved control key.
- Treat `extdata` and `expand` as separate features:
  - `extdata` includes custom fields
  - `expand` inlines JSON or binary columns
- Treat count-enabled list responses defensively. Different endpoints or client layers may return either a count wrapper or a list wrapper with count metadata.

## Data Retrieval

The API provides a flexible query language for retrieving data from any resource endpoint. List requests accept a JSON body with the following capabilities:

- **Field selection** -- Request only the columns you need, including fields from related records via dot notation (e.g. `contact.city`, `assigneduser.name`).
- **Filters** -- Restrict results using equality checks, comparison operators (`<`, `>`, `IN`, etc.), string matching (`~`, `~~`, etc.), and composite logic (`AND`, `OR`, `NOT`).
- **Full-text search** -- Search across a resource's indexed text fields with the `query` parameter.
- **Sorting** -- Order results by one or more fields, ascending (`+`) or descending (`-`).
- **Pagination** -- Control result size with `limit` and `offset`. Use `count: true` to retrieve the total number of matching records.
- **Extended data** -- Include custom/extended data fields by passing `extdata: 1` as a request parameter.
- **Expand** -- Use the `expand` parameter to include JSON or binary column data that is omitted from list responses by default (e.g. `binfile` on messages, `items` on transactions).

See the [Data Retrieval](./01-api-reference/01-data-retrieval.md) guide for the complete query language reference with examples.

## Developer Tools

This project includes tools to help you work with the ZeyOS REST API:

| Tool | Description | Docs |
|------|-------------|------|
| **JavaScript Client** (`@zeyos/client`) | A dependency-light, auto-generated client library with generated methods for every API operation, OAuth 2.0 helpers, and automatic token refresh. Works in browsers and Node.js 18+. | [Getting Started](./02-javascript-client/01-getting-started.md) |
| **CLI** | A command-line interface for scripting and automation against your ZeyOS instance. Supports filtering, sorting, pagination, and multiple output formats. | [Getting Started](./03-cli/01-getting-started.md) |
| **Agent Workflows** | CLI-first guidance for coding agents, JSON-first recipes, and escalation rules when the CLI registry is not enough. | [Coding Agents](./04-agent-workflows/00-coding-agents.md) |
| **Application Developers** | Architecture, browser UI patterns, and server-side integration guidance for connected applications. | [Application Developers](./05-tutorials/00-application-developers.md) |
| **Practical Guide** | A field-tested collection of implementation patterns, gotchas, and best practices learned from building real applications against the ZeyOS API. | [Practical Guide](./02-javascript-client/04-practical-guide.md) |
| **Schema Reference** | Field names, types, enum values, and GIN-indexed fields for the 20 most commonly used ZeyOS resources. | [Schema Reference](./01-api-reference/04-schema.md) |

## Sample Applications

Three ready-to-run sample applications demonstrate different integration patterns:

| Sample | What it demonstrates | Docs |
|--------|---------------------|------|
| **Kanban Board** | Drag-and-drop ticket management, optimistic UI updates, status changes via PATCH, task tables, project/account filtering | [Kanban](./04-sample-apps/01-kanban.md) |
| **CRM Account List** | Dot-notation joins, field aliasing, full-text search, sortable columns, pagination, modal editing | [CRM](./04-sample-apps/02-crm.md) |
| **Dashboard** | KPI cards with `count: true`, parallel API queries, status distribution charts, overdue calculations, read-only patterns | [Dashboard](./04-sample-apps/03-dashboard.md) |

## Prerequisites

- **A ZeyOS instance** -- You need access to a ZeyOS cloud instance. Your instance URL follows the pattern `https://cloud.zeyos.com/{INSTANCE}/`.
- **Node.js 18+** -- Required for the JavaScript client.
- **Node.js 18.3+** -- Required for the CLI package.

## Quick Example

List the 10 most recently modified open tickets using `curl`:

```bash
curl -X POST "https://cloud.zeyos.com/demo/api/v1/tickets" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": ["ID", "name", "status", "priority", "duedate"],
    "filter": {"visibility": 0},
    "sort": ["-lastmodified"],
    "limit": 10
  }'
```

The same request using the JavaScript client:

```js
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';

const client = createZeyosClient({
  platform: 'https://cloud.zeyos.com/demo/',
  auth: {
    mode: 'oauth',
    oauth: {
      tokenStore: new MemoryTokenStore({
        accessToken: 'YOUR_ACCESS_TOKEN',
      }),
    },
  },
});

const tickets = await client.api.listTickets({
  fields: ['ID', 'name', 'status', 'priority', 'duedate'],
  filters: { visibility: 0 },
  sort: ['-lastmodified'],
  limit: 10,
});

console.log(tickets);
```

For long-lived OAuth sessions in trusted code, add `clientId`, `clientSecret`, and a refresh-capable token store. For browser-only apps, prefer session mode or a backend token broker instead of shipping client credentials.

:::tip
You can also use **session authentication** when running inside a browser where the user is already logged into ZeyOS. Set `auth.mode` to `'session'` and the client will use browser cookies automatically. See the [Authentication](./01-api-reference/02-authentication.md) guide for details.
:::

## Next Steps

- **[Coding Agents](./04-agent-workflows/00-coding-agents.md)** -- CLI-first workflows, JSON output patterns, and escalation guidance
- **[Application Developers](./05-tutorials/00-application-developers.md)** -- browser and server-side integration paths
- **[Getting Started](./02-javascript-client/01-getting-started.md)** -- Install the JavaScript client and make your first API call
- **[Making Requests](./02-javascript-client/03-making-requests.md)** -- CRUD operations, filtering, sorting, pagination, and error handling
- **[Practical Guide](./02-javascript-client/04-practical-guide.md)** -- Patterns and gotchas from real-world implementations
- **[Schema Reference](./01-api-reference/04-schema.md)** -- Field definitions and enum values for all major resources
- **[Browser UI Playbook](./05-tutorials/02-build-your-own-zeyos-frontend.md)** -- Step-by-step browser integration guide
