# Collections And Dunning Workflows

## Primary Resources

- `accounts`
- `transactions`
- `payments`
- `dunning`
- `dunning2transactions`

## Important Status Caution

- `transactions.status` is broad and mixes lifecycle states such as invoiced, partly paid, paid, cancelled, and closed.
- `payments` can point either to a `transaction` or directly to an `account`.
- Do not claim exact open balance from schema alone if the available payment records are only account-level and not transaction-linked.
- Do not invent multi-level dunning procedures if the instance only exposes `type`, `status`, `date`, and `duedate`.

## Pattern: Overdue Invoices For A Customer

Use this for prompts like:

- "Which invoices are overdue for customer XYZ?"
- "Show overdue receivables for ACME."

Recommended approach:

1. Resolve the account.
2. Query billing invoices from `transactions` for that account.
3. Filter by `type = 3` and `duedate < now`.
4. Exclude clearly cancelled records.
5. If the user asks whether they are already in collections, follow with `dunning2transactions` and `dunning`.

Client example:

```js
const overdueInvoices = await client.api.listTransactions({
  fields: ['ID', 'transactionnum', 'account', 'date', 'duedate', 'status', 'netamount', 'currency'],
  filters: {
    account: accountId,
    type: 3,
    duedate: { '<': nowTs },
  },
  sort: ['+duedate'],
  limit: 200,
});
```

## Pattern: Open Dunning Notices And Covered Invoices

Use this for prompts like:

- "What dunning notices are still open?"
- "Which invoices are part of reminder notice 2025-004?"

Recommended approach:

1. Resolve the dunning record or account first.
2. Query `dunning` for active or recently relevant notices.
3. Query `dunning2transactions` for the linked transaction IDs.
4. Fetch the linked `transactions` to show invoice numbers, due dates, and values.
5. Present the result by dunning notice, then by covered invoice.

## Pattern: Account Collection Status

Use this for prompts like:

- "Show the payment gap for ACME and whether any invoices are already in dunning."
- "What is the current collection status for customer XYZ?"

Recommended approach:

1. Resolve the account.
2. Query invoice transactions for the account.
3. Query payments for the same account, and separately note which payments are directly tied to transactions.
4. Query dunning notices for the account.
5. Use `dunning2transactions` to mark which invoices are already in a reminder or notice flow.
6. Present:
   - overdue invoices
   - payments received
   - invoices already in dunning
   - invoices still overdue but not yet in dunning

## Pattern: Receivables Needing Follow-Up This Week

Use this for prompts like:

- "Which receivables need follow-up this week?"
- "What should collections work on next?"

Recommended approach:

1. Start from overdue invoices.
2. Split them into:
   - already in dunning
   - overdue without dunning
   - near due date but not yet overdue
3. If open `actionsteps` exist on the same account or transaction, include them as the operational next-step layer.
4. Be explicit when the prioritization is heuristic rather than enforced by schema.

## Pattern: Next Collection Step

Use this for prompts like:

- "Which accounts should move to the next collection step?"
- "What should collections do next?"

Recommended approach:

1. Start from overdue invoices and current dunning notices.
2. Group by account.
3. Distinguish:
   - overdue with no dunning yet
   - reminder issued but still unpaid
   - notice issued and still unpaid
4. If `assigneduser` or open `actionsteps` exist, use them as the operational ownership layer.
5. Present the recommendation as a heuristic next action unless the instance has a fully defined dunning procedure elsewhere.

## Common Failure Modes

- Treating invoice creation and cash receipt as the same thing.
- Assuming every payment can be allocated exactly to one invoice.
- Treating dunning state as visible from `transactions` without checking `dunning2transactions`.
- Ignoring credits when the user asks for net receivable exposure.
