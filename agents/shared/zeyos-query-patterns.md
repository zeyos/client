# ZeyOS Query Patterns

Use this file as the default operating playbook before answering any business question against ZeyOS.

> **Operate, don't plan.** You have a shell tool and the `zeyos` CLI is already
> authenticated against the configured instance. Answer business questions by **running
> commands and reporting real output** — never reply with a query plan, never ask for an
> "execution endpoint" or "a tool to run this", never claim you lack execution access.
> Confirm access any time with `zeyos whoami`. The full operating contract (tools, auth,
> output, safety) is in [zeyos-agent-operating-guide.md](./zeyos-agent-operating-guide.md) —
> read it first.

For the full source-backed inventory, read [zeyos-entity-reference.md](./zeyos-entity-reference.md).
For cross-platform benchmark guidance, read [business-app-benchmarks.md](./business-app-benchmarks.md).

## Default Execution Order

1. Resolve the business nouns in the prompt into concrete ZeyOS entities.
2. Resolve human labels to IDs before querying related records.
3. Normalize the time window into Unix timestamps in seconds.
4. Choose the primary resource first. Do not join across domains until the primary record set is clear.
5. Choose the interface:
   - Use the CLI for registry-backed CRUD and straightforward list/get/count flows.
   - Use `@zeyos/client` when you need unsupported resources, `expand`, binary access, richer request control, or multi-step correlation logic.
6. Query only the fields needed for the next decision.
7. Run follow-up queries only for relationships that affect the answer.
8. State assumptions and ambiguities in the final answer.

## Common Guardrails

- Discover before guessing: `zeyos describe <resource>` (or `client.schema.describe(resource)`) lists a resource's fields, types, foreign keys, and enum values; both run offline. `zeyos describe`, `create`, `update`, and `list` all accept singular, plural, or aliased resource names (`ticket`/`tickets`/`invoice`). Pre-check a call with `client.schema.validate(operationId, input)` — it flags unknown fields (with suggestions), `filter` vs `filters`, invalid enum values, and missing required create fields. An unknown operation name rejects with a "did you mean …?" suggestion.
- Creating accounts requires `currency` (e.g. `"EUR"`): the column is NOT NULL with no DB default, so a create that omits it fails with an opaque HTTP 500 even though the OpenAPI spec does not mark it required. `validate('createAccount', …)` now catches this; supply a currency code. (The spec carries no required-field metadata at all, so unknown required fields can still surface only as a server-side 500 — when a create 500s, suspect a missing NOT-NULL column.)
- Use `visibility: 0` on resources that expose a `visibility` field, unless the user explicitly wants archived or deleted records. Not every resource has the column: `tickets`, `accounts`, and `items` do; **`transactions` does not — filtering `visibility` there returns an opaque HTTP 400**. More generally, filtering on any column a resource lacks 400s with no hint which field was wrong, so filter only on fields `zeyos describe <resource>` lists.
- Treat list operations as `POST` queries.
- Treat `filter` versus `filters` as a source inconsistency, not a universal rule:
  - `api.json` documents `filter`
  - repo client and sample code use `filters`
  - the CLI exposes `--filter` but writes `filters` internally
- Use `body: { ... }` for PATCH updates that also pass `ID`.
- Treat `extdata` and `expand` as different features:
  - `extdata` exposes custom fields
  - `expand` inlines JSON or binary columns
- For a "how many?" question, count server-side: `zeyos count <resource>` on the CLI, or pass `count: true` to the list call on the client (e.g. `client.api.listItems({ filters: { visibility: 0 }, count: true })`). Never use `list` + array length. `zeyos list` defaults to `--limit 50` (the client default is 1000), so counting listed rows silently returns the page size, not the total. In `--json` mode the only truncation signal is a stderr "Showing X–Y of TOTAL" hint.
- Treat `count: true` responses defensively because wrappers vary across resources and client layers.
- Confirm delete, send, revoke, or bulk-update actions before executing them unless the workflow is already explicitly automated.

## Benchmark-Backed Semantic Defaults

Use these defaults unless the target instance clearly behaves differently:

- `projects`, `tickets`, and `tasks` are governed work objects.
- `actionsteps` are record-bound follow-up activities:
  - use them for next promises, reminders, and collector or account follow-ups
  - do not automatically inflate them into full project tasks
- `records`, `comments`, `files`, and `events` form a record timeline or activity feed:
  - use them when the user asks "what happened on this account/project/ticket?"
  - do not treat them as mere infrastructure if there is evidence of user-facing activity
- `channels` and `entities2channels` are collaboration spaces or record-to-channel sharing links:
  - prefer this interpretation over pure categorization unless the instance says otherwise
- `follows` and `likes` are attention and engagement signals, not access-control objects.
- `dunning` is a stage in a collections process, not the receivable itself:
  - separate invoice exposure from collection stage and next action
- `links` should stay low-priority until the instance proves they represent a meaningful business domain rather than a generic URL store.

## Default Resolution Patterns

- Resolve a user with `users.name` or `users.email` first.
- Resolve a customer with `accounts.customernum`, `accounts.lastname`, `accounts.firstname`, then `contacts.email` or contact name if needed.
- Resolve a project with `projects.projectnum` or `projects.name`.
- Resolve a ticket with `tickets.ticketnum` or `tickets.name`.
- Resolve a task with `tasks.tasknum` or `tasks.name`.
- Resolve a transaction with `transactions.transactionnum`.
- Resolve a note or document with `name`, `documentnum`, `filename`, and status.

## Time Windows

- ZeyOS timestamps are Unix seconds, not milliseconds.
- Use `date` for business-effective dates such as invoice date or message date.
- Use `lastmodified` for recent activity or change tracking.
- For phrases like "this year", anchor to the current calendar year unless the user asks for fiscal logic.

## Answering Discipline

- Separate facts from inference.
- When the schema does not encode the business concept directly, explain the proxy.
- When an answer mixes governed work, activity feed, and collaboration spaces, label those layers separately.
- If a query depends on an unstated metric definition, ask or make the assumption explicit.

## Escalation Checklist

Escalate from the CLI to `@zeyos/client` when you need any of the following:

- unsupported resources or operations
- `expand` or binary-file access
- client-side aggregation after multiple list calls
- more careful response normalization
- raw request control or custom retries
