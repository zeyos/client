# Billing Insights Workflows

## Choose The Metric First

Default interpretations:

- "Revenue" is ambiguous.
- "Invoice total" usually means billing transactions, not payments.
- "Cash received" usually means payments, not invoices.

Recommended defaults when the user does not specify:

- Use current calendar year for "this year".
- Use `transactions.type = 3` for billing invoices.
- Use `netamount` for invoiced revenue unless the user asks for gross.
- Subtract billing credits (`transactions.type = 4`) if the user asks for net revenue after credits.
- If the question is about reminders, notices, or overdue follow-up, switch to `dunning` and `dunning2transactions` instead of answering from revenue data alone.

## Important Status Caution

The transaction status enum is broad and instance behavior may differ. Do not hard-code business meaning beyond what the schema documents unless the instance conventions are known.

Safe examples:

- Exclude clearly cancelled records when appropriate.
- Treat `payments` as cash movement.
- Treat transaction `date` as the primary business date for invoice-period reporting.

## Pattern: Current Revenue This Year

Use this for prompts like:

- "What is our current revenue this year?"
- "How much have we invoiced so far this year?"

Recommended approach:

1. Decide whether the user means invoiced revenue or cash received.
2. If not specified, say you are using invoiced net revenue from billing invoices.
3. Query billing invoices in the date range.
4. If credits matter, query billing credits separately and subtract them.
5. Sum the values client-side.

Client example:

```js
const invoices = await client.api.listTransactions({
  fields: ['ID', 'transactionnum', 'date', 'type', 'status', 'netamount', 'tax', 'account', 'account.lastname'],
  filters: {
    type: 3,
    date: { '>=': yearStart },
  },
  limit: 1000,
});
```

If the user actually wants cash basis, switch to `payments` and sum `amount` over the same date window.

## Pattern: Billing Detail For One Customer

Use this for prompts like:

- "Show me all invoice activity for customer XYZ."
- "What is the payment status for account 122?"

Recommended approach:

1. Resolve the account first.
2. Query `transactions` for invoice and credit records for that account.
3. Query `payments` for the same account or linked transactions.
4. Present:
   - invoices and credits
   - payments received
   - open items or gaps you can identify from the available status fields

## Pattern: Cash Received In A Period

Use this for prompts like:

- "How much cash did we collect this quarter?"
- "What payments came in from ACME this month?"

Recommended approach:

1. Use `payments` as the primary source.
2. Filter by `date` in the requested period.
3. Resolve account scope if the question is customer-specific.
4. Sum `amount` client-side and separate direct account payments from transaction-linked payments if that matters to the answer.

## Pattern: Inspect Line Items

Use this when the user asks about product mix, billed quantities, or invoice composition.

Recommended approach:

1. Query the relevant transaction IDs first.
2. Re-fetch the subset with `expand: ['items']` if needed.
3. Sum or regroup line items client-side.

## Common Failure Modes

- Confusing invoiced revenue with collected cash.
- Ignoring billing credits when the question implies net revenue.
- Treating overdue or in-collections state as if it were visible from `transactions` alone.
- Using `lastmodified` instead of `date` for period reporting.
- Treating `documents` as the financial source of truth when the question is really about monetary totals.
