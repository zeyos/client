---
name: zeyos
description: Read or change ZeyOS business data (accounts, contacts, tickets, tasks, projects, items, transactions, documents, and more) by running the authenticated `zeyos` CLI. Use this as the general entry point whenever a request touches ZeyOS data and no more specific zeyos-* skill clearly fits — it explains how to actually talk to the instance and run queries.
---

# Working with ZeyOS via the CLI

This is the generic, do-it-now skill for talking to a ZeyOS instance. The specialized
`zeyos-*` skills add metric definitions and domain rules; this one routes to the right
guide, makes sure you **run real commands against the live instance**, and answers from
the result.

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md)
first (it establishes that you have tools and the CLI is already authenticated), then
[../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) for the query rules.

## Route first, then execute

When `/zeyos` is invoked, inspect the user request and read the matching specialized
skill before querying. Do not ask the user to pick the skill and do not answer from this
generic guide if the request needs domain rules.

| Request area | Read this guide |
| --- | --- |
| Accounts, customers, contacts, CRM profile, account type, relationship lookup | [../zeyos-account-intelligence/SKILL.md](../zeyos-account-intelligence/SKILL.md) |
| Tickets, tasks, projects, actionstep queues, workload, third-person effort summaries | [../zeyos-work-management/SKILL.md](../zeyos-work-management/SKILL.md) |
| First-person work ("my ...") or logging/booking time | [../zeyos-time-tracking/SKILL.md](../zeyos-time-tracking/SKILL.md) |
| Transactions, invoices, delivery notes, revenue, payments, billing documents | [../zeyos-billing-insights/SKILL.md](../zeyos-billing-insights/SKILL.md) |
| Dunning notices, receivables follow-up, collection state | [../zeyos-collections-and-dunning/SKILL.md](../zeyos-collections-and-dunning/SKILL.md) |
| Items, products, catalog, stock, inventory, orders | [../zeyos-commerce-and-inventory/SKILL.md](../zeyos-commerce-and-inventory/SKILL.md) |
| Mail, inbound/outbound messages, drafts, unanswered ticket mail | [../zeyos-mail-operations/SKILL.md](../zeyos-mail-operations/SKILL.md) |
| Campaigns, mailing lists, outreach recipients, message reads | [../zeyos-campaign-and-outreach/SKILL.md](../zeyos-campaign-and-outreach/SKILL.md) |
| Activity events, timeline, collaboration history | [../zeyos-collaboration-and-activity/SKILL.md](../zeyos-collaboration-and-activity/SKILL.md) |
| Notes, SOPs, knowledge retrieval | [../zeyos-notes-and-sops/SKILL.md](../zeyos-notes-and-sops/SKILL.md) |
| Documents, approval gates, official/latest file state | [../zeyos-document-and-approval/SKILL.md](../zeyos-document-and-approval/SKILL.md) |
| Calendar availability, scheduling, appointment creation | [../zeyos-calendar-and-scheduling/SKILL.md](../zeyos-calendar-and-scheduling/SKILL.md) |
| Custom fields, schema/admin resources, operationId traps, platform model lookup | [../zeyos-platform-and-schema/SKILL.md](../zeyos-platform-and-schema/SKILL.md) |
| Supplier scorecards, procurement, supplier delivery performance | [../zeyos-procurement-and-supplier-performance/SKILL.md](../zeyos-procurement-and-supplier-performance/SKILL.md) |
| Duplicate accounts, null/empty/missing checks, remediation previews | [../zeyos-data-quality-and-governance/SKILL.md](../zeyos-data-quality-and-governance/SKILL.md) |

If multiple domains apply, read each relevant specialized guide plus
[../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md), then choose the smallest
query plan that answers the user.

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
excluding archived"). For a domain-specific metric (revenue, receivables, workload), read
the matching `zeyos-*` skill for the correct definition, then still run the query here.

## Safety

Read-only by default. Refuse unscoped bulk deletes ("delete all …", "clean up the
queue") even for apparent test data; deletes are per-record against IDs you can name.
Never send outbound email/dunning/campaigns — stop at draft. See the operating guide for
the full constraints.
