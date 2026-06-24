# Procurement and Supplier Performance Workflows

## Procurement transaction types

`transactions.type`: 5 PROCUREMENT_REQUEST, 6 PROCUREMENT_ORDER, 7 PROCUREMENT_DELIVERY,
8 PROCUREMENT_INVOICE, 9 PROCUREMENT_CREDIT. (Billing types 0–4 are a different domain.)
`transactions` has **no** `visibility` column — do not add `"visibility":0`.

## Supplier comparison for an order quantity

1. Resolve the item, then read its supplier links:

   ```bash
   zeyos list suppliers --filter '{"item":<itemId>}' \
     --fields ID,account,price,minamount,deliverytime,stock --limit 1000 --json
   ```

2. Resolve each `account` to a supplier name.
3. Eligibility: `minamount <= orderQuantity`. State eligibility explicitly — never drop a
   supplier silently because of its minimum.
4. Ranking policy (declare before ranking): eligible first, then `price` ascending, then
   `deliverytime` ascending. Report `rank` and `eligible` per option.

## Supplier scorecard over a period

Group procurement `transactions` by supplier `account` within a declared window + currency:

- `ordered_value` = Σ `netamount` where type 6
- `invoiced_value` = Σ `netamount` where type 8
- `price_variance` = invoiced_value − ordered_value
- delivery timing from type 7 dates vs the order `duedate` (on-time when delivered by duedate)

Keep all values in one currency (R-019); exclude cancelled records per documented policy.

## Reorder advice

Label reorder suggestions as heuristic unless the instance has a formal stock policy
(min/max levels). Combine `stocktransactions` net-booked stock by `storages` with supplier
`deliverytime` to flag at-risk items — but present it as advice, not an action.

## Common failure modes

- Mixing billing types (0–4) with procurement types (5–9).
- Hiding a minimum-order-quantity constraint when ranking.
- Conflating ordered, delivered and invoiced values.
- Summing across currencies.
