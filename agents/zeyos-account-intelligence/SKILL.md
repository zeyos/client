---
name: zeyos-account-intelligence
description: Analyze ZeyOS customer and account context across accounts, contacts, addresses, opportunities, contracts, campaigns, and related records. Use when asked for customer 360 summaries, active contacts, open opportunities, contract state, address completeness, or account-centric answers that span multiple CRM entities.
---

# ZeyOS Account Intelligence

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) for the relationship map and [../shared/zeyos-entity-reference.md](../shared/zeyos-entity-reference.md) for the source-backed inventory. Read [references/workflows.md](references/workflows.md) for account-specific query plans.

Typical prompts:

- "Give me a 360 summary for customer XYZ."
- "Who are the active contacts for customer XYZ?"
- "What open opportunities and active contracts do we have with ACME?"
- "Which accounts are missing billing addresses?"

## Workflow

1. Resolve the account first, then fan out to related entities.
2. Treat `accounts` as the anchor record for customer 360 work.
3. Pull `contacts`, `addresses`, `opportunities`, and `contracts` separately unless the answer only needs one layer.
4. Distinguish:
   - current relationship state
   - future pipeline
   - historical activity
5. Use address type codes explicitly when the question is about billing or shipping readiness.
6. Treat campaigns and participants as outreach context, not proof of commercial engagement. Use `zeyos-campaign-and-outreach` if the user wants mailing or campaign execution detail.
7. State whether the answer is account-wide, contact-specific, or contract-specific.

## Output Discipline

- Start with the resolved account and the matching logic used.
- Separate account master data from linked people, opportunities, and contracts.
- Call out missing CRM hygiene fields such as missing contacts or missing billing addresses.
