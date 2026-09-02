---
sidebar_position: 1
sidebar_label: Application Developers
---

# Application Developers

This path is for developers building external applications that use ZeyOS as the central source of business data and business logic.

For v1, the scope is explicitly **external integrations**:

- browser UIs
- server-side services
- automation backends
- connected internal tools

These docs do **not** cover authoring native ZeyOS platform artifacts.

## Choose Your Starting Point

| Goal | Start here | Why |
|------|------------|-----|
| Decide between browser, token, and server architectures | [Integration Architecture](./01-integration-architecture.md) | Compares auth and deployment models before you write code |
| Build a browser UI or internal tool | [Browser UI Playbook](./02-build-your-own-zeyos-frontend.md) | Covers session mode, controlled browser token mode, list queries, CRUD, and UI-safe patterns |
| Build a backend, worker, or scheduled integration | [Server-Side Integrations](./03-server-side-integrations.md) | Covers token storage, refresh, low-level requests, and sync jobs |
| Reuse working implementation patterns | [Sample Applications](../04-sample-apps/01-kanban.md) | Shows reusable frontend patterns without framework lock-in |
| Need the full generated surface | [JavaScript Client](../02-javascript-client/01-getting-started.md) | Full API coverage and low-level request escape hatch |

## Recommended Defaults

- Prefer `@zeyos/client` for JavaScript applications.
- Use `filters` in client code unless you have a reason to stay with raw API `filter`.
- Use `visibility: 0` on resources that **have** the column — `accounts`, `contacts`, `tickets`, `tasks`, `projects`, `items`, `documents`, `notes`, `opportunities`, `appointments`, `campaigns`, `mailinglists`, `storages` — unless you want archived (`1`) or deleted (`2`) records. **Most other resources have no `visibility` column** — `transactions` (and every billing/procurement entity), `payments`, `messages`, `actionsteps`, `addresses`, `users`, `prices`, `dunning` — and filtering on it there returns an opaque HTTP 400. Check with `zeyos describe <entity>` when unsure.
- Use explicit `body` objects for update operations that also include path parameters such as `ID`.
- Treat `extdata` and `expand` as separate concepts:
  - `extdata` exposes custom fields
  - `expand` inlines JSON or binary columns

## Next Steps

- Read [Integration Architecture](./01-integration-architecture.md)
- Pick either the [Browser UI Playbook](./02-build-your-own-zeyos-frontend.md) or [Server-Side Integrations](./03-server-side-integrations.md)
- Use the [API Reference](../01-api-reference/01-data-retrieval.md) and [JavaScript Client docs](../02-javascript-client/03-making-requests.md) as the detailed reference layers
