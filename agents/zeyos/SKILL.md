---
name: zeyos
description: Read or change ZeyOS business data (accounts, contacts, tickets, tasks, projects, items, transactions, documents, and more) by running the authenticated `zeyos` CLI. Use this as the general entry point whenever a request touches ZeyOS data and no more specific zeyos-* skill clearly fits — it explains how to actually talk to the instance and run queries.
---

# Working with ZeyOS via the CLI

This is the generic, do-it-now skill for talking to a ZeyOS instance. The specialized
`zeyos-*` skills add metric definitions and domain rules; this one just makes sure you
**run real commands against the live instance and answer from the result**.

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md)
first (it establishes that you have tools and the CLI is already authenticated), then
[../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) for the query rules.

## Do this, don't just describe it

When asked anything about ZeyOS data, **run a `zeyos` command and report what it
returns.** Never reply with a query plan, never ask for "an endpoint" or "a tool to run
this", never say you lack execution access — the `zeyos` CLI is installed and
authenticated. If unsure it works, run `zeyos whoami`.

**`zeyos` is a shell command — run it with your `bash`/shell tool.** Your first action is a
shell tool call, e.g. `zeyos count accounts --filter '{"type":1}'`. Do **not** call a tool
or spawn a sub-agent named `zeyos` / `zeyos-*` (those don't exist and will error), and do
**not** invent flags like `zeyos --work-management "…"`. Use the exact grammar below.

## The CLI surface

```
zeyos whoami                       # confirm auth + see the current user/instance
zeyos resources --json             # list every available resource type
zeyos describe <resource>          # fields, types, enums, foreign keys (offline)

zeyos count  <resource> --filter '{"status":1}'
zeyos list   <resource> --filter '{…}' --fields ID,name,status --sort -lastmodified --limit 50 --json
zeyos get    <resource> <id> --json          # single record (alias: show)

zeyos create <resource> --name "…" --priority 3
zeyos update <resource> <id> --status 2
zeyos delete <resource> <id> --force         # per-record only; see Safety
```

Resource names accept singular, plural, or aliases (`ticket` / `tickets` / `invoice`).
Add `--json` whenever another step will parse the output.

**Preview before you run:** append `--query` to any data command (`list`, `count`,
`get`, `create`, `update`, `delete`) to print the resolved route + JSON payload
**without sending the request**. Use it to confirm a filter/body is shaped the way
you intend before hitting the live instance — especially before any write. Add
`--json` to `--query` for the full machine-readable request descriptor.

## Things that bite people (read before querying)

- **Counting:** use `zeyos count <resource>`. Do **not** `zeyos list` and count rows —
  `list` defaults to `--limit 50`, so you get the page size, not the total. In `--json`
  the only truncation signal is a stderr `Showing X–Y of TOTAL` hint.
- **Totals / sums:** there is no server-side sum. `list` the matching records with the
  numeric field and a high `--limit` (up to 10000), then add them up yourself.
- **Filters:** the flag is `--filter '{…}'` (JSON). The CLI writes it to the API's
  `filters` key internally, which is the form that works for foreign-key (GIN-indexed)
  fields like `account`, `project`, `ticket`. **Only filter on columns the resource
  actually has** — filtering an unknown field returns an opaque HTTP 400 with no hint
  which field was wrong. When unsure, run `zeyos describe <resource>` first.
- **`visibility: 0`** hides archived/deleted records — but **only some resources have a
  `visibility` column** (e.g. `tickets`, `accounts`, `items` do; `transactions` does
  **not** — adding `"visibility":0` there 400s). Include it on resources that have it
  unless the user wants archived records; omit it otherwise. `zeyos describe <resource>`
  tells you whether the column exists.
- **Dates** are Unix timestamps in **seconds**. Use the `date` field for business-effective
  reporting (invoice date, message date), `lastmodified` for "recently changed".
- **Discover before guessing:** `zeyos describe <resource>` shows the real field names and
  enum values. operationId / REST names don't always match the dbref noun.
- **Resource not in the CLI?** If `zeyos resources` doesn't list what you need (platform,
  pricing, campaign-recipient, permission, channel, follower resources, `expand`, binary
  files), escalate to `@zeyos/client` — import from the repo's `src/index.js`.

## Worked example: "how many open customers do we have?"

```bash
zeyos describe accounts | grep -i type      # confirm: type 1 = CUSTOMER
zeyos count accounts --filter '{"type":1,"visibility":0}'
```

Report the number, and state the definition you used ("customer = `accounts.type` 1,
excluding archived"). For a domain-specific metric (revenue, receivables, workload),
hand off to the matching `zeyos-*` skill for the correct definition, but still run the
query here.

## Safety

Read-only by default. Refuse unscoped bulk deletes ("delete all …", "clean up the
queue") even for apparent test data; deletes are per-record against IDs you can name.
Never send outbound email/dunning/campaigns — stop at draft. See the operating guide for
the full constraints.
