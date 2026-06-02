---
name: zeyos-collections-and-dunning
description: Analyze ZeyOS overdue receivables, dunning notices, payment gaps, and collection workflows. Use when asked which invoices are overdue, which reminders or notices are open, which receivables need follow-up, or how transactions, payments, and dunning records relate for an account.
---

# ZeyOS Collections And Dunning

Read [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the request crosses accounts, transactions, payments, and dunning. Read [references/workflows.md](references/workflows.md) for collections-specific query plans.

Typical prompts:

- "Which invoices are overdue for customer XYZ?"
- "What dunning notices are still open?"
- "Which receivables need follow-up this week?"
- "Show the payment gap for ACME and whether any invoices are already in dunning."
- "Which accounts should move to the next collection step?"

## Workflow

1. Decide whether the user wants:
   - overdue receivables
   - issued reminders or notices
   - account-level collection status
   - payment-gap analysis
2. Resolve the account, transaction number, and time window before correlating records.
3. Use the correct primary resource:
   - `transactions` for invoice and credit obligations
   - `payments` for cash actually received
   - `dunning` and `dunning2transactions` for reminder and notice state
4. State what "overdue" means in the answer:
   - past `duedate`
   - unpaid or not fully settled
   - already part of a dunning process
5. Reconcile at the smallest useful level:
   - by transaction if you need exact invoice state
   - by account if the user wants a collections summary
6. Separate collection stage from financial exposure. A dunning notice is not the same thing as the invoice balance.
7. Treat payment allocation carefully. A payment linked directly to an account is not the same as a payment linked to a specific invoice.
8. Keep creation or status changes to dunning records behind explicit confirmation.

## Output Discipline

- Separate invoice exposure, payments received, and dunning state.
- Call out status assumptions, especially around partially paid or cancelled records.
- Call out assigned collector or open follow-up activity when available.
- Say whether the answer is exact per transaction or approximate at account level.
