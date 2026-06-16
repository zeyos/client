---
sidebar_position: 2
sidebar_label: Integration Architecture
---

# Integration Architecture

Choose the integration model before you choose the framework. In ZeyOS projects, the main design decision is usually where authentication happens and where long-lived business operations run.

## Comparison

| Model | Where code runs | Auth model | Best for | Main constraint |
|-------|-----------------|------------|----------|-----------------|
| Browser session mode | Browser | Existing `ZEYOSID` session cookie | Internal tools on the same origin, embedded UIs, operator-facing apps | Requires browser session access and compatible credentialed requests |
| Browser token mode | Browser | Pre-obtained OAuth tokens | Development, controlled demos, pre-provisioned browser apps | Do not embed a client secret in production browser code |
| Server token mode | Server, worker, cron, API backend | OAuth tokens stored server-side | Integrations, sync jobs, scheduled tasks, multi-step business logic | Requires token persistence and refresh handling |

## Recommended Choices

### Use browser session mode when:

- the user is already logged into ZeyOS
- the UI runs on the same origin or an allowed credentialed origin
- you want the simplest browser auth flow with no token storage in the page

### Use browser token mode when:

- you already have tokens from a trusted flow
- you are building a local demo or internal prototype
- you can avoid embedding client secrets in shipped browser code

### Use server token mode when:

- the application runs without a live browser session
- you need retries, scheduling, background work, or webhook handling
- you want one place to centralize token refresh and request logging

Browser token mode is intentionally limited. Use it for pre-obtained access tokens and controlled demos. If you need authorization-code exchange or automatic refresh, move that responsibility to server token mode because the current client helpers require `clientId` and `clientSecret`.

## Interface Selection

| Need | Interface |
|------|-----------|
| JavaScript application code with full API coverage | `@zeyos/client` |
| Shell-driven operational workflows | `zeyos` CLI |
| Another language or custom SDK | REST/OpenAPI |

## Cross-Cutting Rules

- List operations are `POST` requests in ZeyOS, even though they behave like queries.
- Prefer `filters` in client code for consistent handling of scalar and foreign-key fields.
- Include `visibility: 0` in normal list queries.
- Use `body: { ... }` for updates that also pass `ID`.
- Treat count-enabled responses defensively. Different endpoints or client layers may return either a count wrapper or a list wrapper with count metadata.

## Recommended Reading Order

1. [Browser UI Playbook](./02-build-your-own-zeyos-frontend.md) for user-facing frontends
2. [Server-Side Integrations](./03-server-side-integrations.md) for services, workers, and scheduled jobs
3. [Making Requests](../02-javascript-client/03-making-requests.md) for the full request model
