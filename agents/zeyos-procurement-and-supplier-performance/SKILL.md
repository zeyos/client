---
name: zeyos-procurement-and-supplier-performance
description: Compare suppliers, analyze procurement orders/deliveries/invoices, lead times, price variance and reorder worklists in ZeyOS. Use for "which supplier is best for 20 units of item ABC", "which purchase orders are late", "compare supplier delivery performance", "where did procurement prices exceed the order". Read-only analysis — never place, book, cancel or transmit a procurement transaction.
---

# ZeyOS Procurement and Supplier Performance

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. See the OKF `playbooks/supplier-scorecard` playbook and `metrics/supplier-delivery-performance` metric.

> **Keep ordered, delivered and invoiced quantities/values distinct**, and state the
> ranking policy before you rank. Analysis is read-only.

Primary entities: `transactions` types **5 PROCUREMENT_REQUEST, 6 ORDER, 7 DELIVERY, 8 INVOICE, 9 CREDIT** (`listTransactions`), `suppliers` (item↔supplier links: `listSuppliers`), `items`, `accounts` (the supplier), `stocktransactions`, `storages`, `payments`, and `contracts` where supplier agreements matter. `transactions` has **no** `visibility` column.

Typical prompts:

- "Which supplier is best for 20 units of item ABC?"
- "Which purchase orders are late?"
- "Compare supplier delivery performance."
- "Where did procurement prices exceed the order?"

## Workflow

1. Resolve the item and the supplier `accounts` (type 2 SUPPLIER).
2. For sourcing decisions, read `suppliers` links: `price`, `minamount`, `deliverytime`, `stock`.
3. Apply the order quantity: a supplier is eligible only if `minamount <= quantity` — never hide a minimum-quantity constraint (R-003).
4. State the ranking policy first (e.g. eligible, then price ascending, then delivery time), then rank.
5. For performance, keep ordered (type 6), delivered (type 7) and invoiced (type 8) values separate; compute price variance as invoiced − ordered.
6. Compute only over a declared time window and one currency (R-014, R-019). Exclude cancelled records by documented status policy.
7. Label reorder advice as heuristic unless a formal stock policy exists.

## Safety

- Never place, approve, book, cancel or transmit a procurement transaction automatically (R-010, R-011).
- Never change supplier master data or price lists from an analytical request.
- Any future write workflow requires exact supplier, item, quantity, currency and confirmation.
