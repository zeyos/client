---
name: zeyos-billing-insights
description: Analyze ZeyOS billing transactions, invoices, credits, payments, and revenue-style metrics. Use when asked about current revenue, invoice totals, payment status, outstanding receivables, account-level transaction history, or finance questions that require choosing between transaction, payment, and document data.
---

# ZeyOS Billing Insights

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the request crosses accounts, transactions, payments, items, and documents. Read [references/workflows.md](references/workflows.md) for finance-specific metric selection and query plans.

> **Run the query — don't hand back a plan.** Finance questions still get answered by
> executing `zeyos` commands (or `@zeyos/client`) against the live instance and summing
> real rows. State your metric definition, then go fetch the numbers. Never end by asking
> for "an execution endpoint" or "the data layer" — it's already wired (`zeyos whoami`).

Typical prompts:

- "What is our net invoiced revenue this year?"
- "How much cash did we collect this quarter?"
- "Show all billing activity for customer XYZ."
- "Which invoices contributed most to this month's revenue?"
- "Which overdue invoices are already in dunning?"

## Workflow

1. Determine the metric before querying:
   - invoiced revenue
   - collected cash
   - outstanding receivables
   - account transaction detail
2. Resolve the time window and any account or customer scope.
3. Choose the correct primary resource:
   - use `transactions` for invoice and credit value
   - use `payments` for cash movement
   - use `documents` only when the question is about the formal document artifact
   - use `dunning` plus `dunning2transactions` when the question is really about receivables follow-up or collection state (operationIds: `listDunningNotices`, `listDunningToTransactions` — these dbref nouns do not map naively; see [../shared/zeyos-entity-reference.md](../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid))
4. State the default metric if the prompt is ambiguous. Do not silently switch between net, gross, invoiced, and paid.
5. Pull line-item detail only when necessary, usually with `expand: ['items']` through `@zeyos/client`.
6. If the prompt is mainly about overdue notices, reminder stages, or next collection actions, treat that as a collections workflow rather than a pure revenue workflow.
7. Present totals, counts, and exceptional records separately.
8. Keep finance answers explicit about assumptions, especially around statuses, credits, and payment allocation.

## Output Discipline

- State the metric definition up front.
- Separate invoice creation from payment collection.
- Call out excluded statuses, date fields, credits, and whether collection state came from `dunning`.
