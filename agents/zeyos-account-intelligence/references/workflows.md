# Account Intelligence Workflows

## Primary Resources

- `accounts`
- `contacts`
- `addresses`
- `opportunities`
- `contracts`
- `campaigns`
- `participants`

## First Commands For Counts

- Customer accounts, active only: `zeyos count accounts --filter '{"type":1,"visibility":0}'`
- All active accounts: `zeyos count accounts --filter '{"visibility":0}'`

`accounts.type = 1` is `CUSTOMER`. Use `zeyos count`, not `list` plus row length.

## Pattern: Customer 360 Summary

Use this for prompts like:

- "Give me a 360 summary for customer XYZ."
- "What is the current state of ACME as a customer?"

Recommended approach:

1. Resolve the account first.
2. Fetch the account master record.
3. Fetch linked contacts and addresses.
4. Fetch open opportunities.
5. Fetch active or recent contracts.
6. Optionally pull recent tickets, transactions, or messages if the question implies them.

Present the result in sections:

- account identity and ownership
- key contacts
- address completeness
- open pipeline
- active contracts
- notable risk or data-quality gaps

## Pattern: Active Contacts For An Account

Use this for prompts like:

- "Who are the active contacts for customer XYZ?"
- "Which people do we know at ACME?"

Recommended approach:

1. Resolve the account.
2. Query contacts linked through the account relationship or contact fields used by the instance.
3. Prefer contacts with usable email or phone data when the user asks who can be reached.
4. Distinguish company-level contacts from individual people where needed.

## Pattern: Open Opportunities And Active Contracts

Use this for prompts like:

- "What open opportunities and active contracts do we have with ACME?"
- "What pipeline and active commitments exist for this customer?"

Recommended approach:

1. Resolve the account.
2. Query `opportunities` filtered by account and non-terminal statuses.
3. Query `contracts` filtered by account and active or recently relevant statuses.
4. Present opportunities and contracts as separate layers, because pipeline and signed commitments are not the same thing.

## Pattern: Missing Billing Addresses

Use this for prompts like:

- "Which accounts are missing billing addresses?"
- "Which customers do not have a billing address configured?"

Recommended approach:

1. Query addresses with type `1` (`BILLING_BILLING`) for the population you care about.
2. Compare against the account set client-side.
3. Report missing accounts and, if useful, whether they still have shipping addresses.

## Common Failure Modes

- Treating contacts as if they were users.
- Assuming every account has a single canonical contact.
- Mixing open opportunities with active contracts into one commercial status.
- Using campaigns or participants as proof of actual customer engagement instead of outreach context.
