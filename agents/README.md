# ZeyOS Agent Skills

This folder contains a repo-local skill pack for coding agents that use ZeyOS as a business operating system. The focus is not generic chat behavior. The focus is repeatable business queries and actions that depend on the ZeyOS entity model, its query rules, and safe escalation from the CLI to the JavaScript client.

The source-backed model reference lives in [`shared/zeyos-entity-reference.md`](./shared/zeyos-entity-reference.md) and is derived from [`openapi/dbref.json`](../openapi/dbref.json) and [`openapi/api.json`](../openapi/api.json).
Cross-platform modeling guidance lives in [`shared/business-app-benchmarks.md`](./shared/business-app-benchmarks.md).

## Structure

- `shared/` contains cross-domain query rules and entity relationships.
- `zeyos-work-management/` handles tasks, projects, tickets, and assignee workload questions.
- `zeyos-mail-operations/` handles message lookup, email summaries, threads, and safe draft workflows.
- `zeyos-billing-insights/` handles transactions, payments, invoices, credits, and revenue questions.
- `zeyos-notes-and-sops/` handles notes, SOP discovery, documents, and file-backed knowledge lookup.
- `zeyos-account-intelligence/` handles customer 360 questions across accounts, contacts, addresses, opportunities, and contracts.
- `zeyos-commerce-and-inventory/` handles catalog, pricing, stock, supplier, and price-list questions.
- `zeyos-collections-and-dunning/` handles overdue receivables, reminders, notices, and payment-gap analysis.
- `zeyos-campaign-and-outreach/` handles campaigns, mailing lists, participants, mailing activity, and recipient coverage.
- `zeyos-collaboration-and-activity/` handles record timelines, comments, followers, channels, files, and recent-activity reconstruction.
- `zeyos-platform-and-schema/` handles applications, services, custom fields, objects, groups, and permissions.

## Shared Design Rules

- Resolve business names to IDs before answering cross-record questions.
- Start with the smallest primary query, then follow relationships with a second query when needed.
- Use `visibility: 0` for resources that expose a `visibility` field.
- Check `zeyos resources --json` before assuming CLI coverage. If a required resource is missing from the curated CLI registry, switch to `@zeyos/client`.
- Treat `filter` vs `filters` as a source inconsistency; follow the interface-native convention and verify raw REST behavior against the target instance.
- Treat list responses and count-enabled responses defensively.
- Treat "worked on", "revenue", and "latest SOP" as potentially ambiguous business concepts and state the chosen interpretation.
- Keep destructive actions and outbound email sends behind explicit confirmation.

## Skill Catalog

| Skill | Best for | Example prompts |
|------|----------|-----------------|
| `zeyos-work-management` | Operational work queues, user workload, ticket-task-project tracing, follow-up work creation | "On which projects did Max Power work in the last two weeks?"; "Show overdue high-priority tickets for account ACME."; "What open tasks are blocking Project Atlas?" |
| `zeyos-mail-operations` | Customer mail summaries, thread reconstruction, draft preparation, mailbox analysis | "Give me a summary of all recent mails from customer XYZ."; "Which open tickets have unanswered customer emails?"; "Draft a reply to the latest complaint from ACME." |
| `zeyos-billing-insights` | Revenue, invoices, credits, payment tracking, transaction-level finance questions | "What is our net invoiced revenue this year?"; "How much cash did we collect this quarter?"; "Show all billing activity for customer XYZ." |
| `zeyos-notes-and-sops` | SOP retrieval, note summaries, final-document lookup, attachment discovery | "Find the current escalation SOP for billing disputes."; "Summarize our notes on failed invoice syncs."; "Which finalized onboarding SOP changed last month?" |
| `zeyos-account-intelligence` | Customer 360, contacts, contracts, opportunities, CRM hygiene | "Give me a 360 summary for customer XYZ."; "What open opportunities and active contracts do we have with ACME?"; "Which accounts are missing billing addresses?" |
| `zeyos-commerce-and-inventory` | Customer-specific pricing, stock, suppliers, catalog structure | "What price does customer XYZ get for item ABC?"; "Which items are low on stock?"; "Who are the suppliers for item ABC?" |
| `zeyos-collections-and-dunning` | Overdue invoices, dunning notices, payment gaps, receivables follow-up | "Which invoices are overdue for customer XYZ?"; "What dunning notices are still open?"; "Which receivables need follow-up this week?" |
| `zeyos-campaign-and-outreach` | Campaign setup, mailing-list membership, participant coverage, outreach execution | "How many participants are in campaign Spring Renewal?"; "Which mailing lists belong to campaign XYZ?"; "Who received the latest mailing?" |
| `zeyos-collaboration-and-activity` | Activity timelines, comments, channels, followers, attachments, recent changes | "What happened on account ACME this week?"; "Who follows Project Atlas?"; "Which channel is linked to ticket 812?" |
| `zeyos-platform-and-schema` | App inventory, service hooks, custom schema, group permissions | "Which custom fields exist on tickets?"; "Which services run after ticket modification?"; "Which groups grant access to application XYZ?" |

## Interface Boundary

The CLI covers common operational resources such as accounts, contacts, documents, items, projects, tasks, tickets, users, and groups. Skills that depend on platform, pricing, campaign-recipient, permission, channel, follower, or other specialist resources should start with `zeyos resources --json`; if the resource is absent, use `@zeyos/client` and the generated operation names from the API reference.

## Recommended Loading Order

1. Read `shared/zeyos-query-patterns.md`.
2. Read `shared/business-app-benchmarks.md` when the semantics are unclear.
3. Read `shared/zeyos-entity-reference.md` when the entity itself is unclear.
4. Read `shared/zeyos-entity-map.md` if the question crosses domains.
5. Load the matching skill folder and its `references/workflows.md`.

## Good Next Skills

Potential next additions that would fit this folder well are:

- calendar and appointment coordination
- document generation and approval flows
- purchasing and supplier performance analysis
