---
name: zeyos-commerce-and-inventory
description: Analyze ZeyOS items, pricing, price lists, supplier links, stock movement, storage, coupons, and related commerce entities. Use when asked about customer-specific pricing, item catalogs, stock availability, supplier sourcing, applicable price lists, or product and inventory questions that span items, prices, accounts, and stock transactions.
---

# ZeyOS Commerce And Inventory

Read [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) and [../shared/zeyos-entity-reference.md](../shared/zeyos-entity-reference.md) when the request crosses pricing, accounts, and stock. Read [references/workflows.md](references/workflows.md) for commerce-specific query plans.

Typical prompts:

- "What price does customer XYZ get for item ABC?"
- "Which items are low on stock?"
- "Who are the suppliers for item ABC?"
- "Which price list applies to account ACME?"

## Workflow

1. Resolve the item, account, price list, or storage first.
2. Distinguish catalog questions from pricing questions and stock questions.
3. Use:
   - `items` for product identity
   - `prices` and `pricelists` for effective commercial pricing
   - `pricelists2accounts` for account-specific price-list assignment
   - `stocktransactions` and `storages` for inventory movement and location
   - `suppliers` for vendor sourcing
4. State whether a quoted price is:
   - base item price
   - price-list override
   - customer-specific via price-list assignment
5. Treat stock answers as derived from movements unless the question explicitly asks for transaction history.
6. Keep procurement-side and billing-side price logic separate.

## Output Discipline

- Start with the resolved item/account/storage identity.
- Separate price determination from stock determination.
- Call out whether the answer came from item defaults, price lists, supplier pricing, or stock movements.
