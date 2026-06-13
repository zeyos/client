# Commerce And Inventory Workflows

## Primary Resources

- `items`
- `prices`
- `pricelists`
- `pricelists2accounts`
- `stocktransactions`
- `storages`
- `suppliers`
- `relateditems`
- `components`
- `coupons`
- `couponcodes`

These are dbref nouns, not operationIds. Several diverge: `pricelists` -> `listPriceLists`,
`pricelists2accounts` -> `listPriceListsToAccounts`, `stocktransactions` -> `listStockTransactions`,
`relateditems` -> `listRelatedItems`, `couponcodes` -> `listCouponCodes`. See
[../../shared/zeyos-entity-reference.md](../../shared/zeyos-entity-reference.md#entity-noun-to-rest-operationid)
before calling `@zeyos/client`.

## Pattern: Effective Price For A Customer

Use this for prompts like:

- "What price does customer XYZ get for item ABC?"
- "Which price applies to ACME for this SKU?"

Recommended approach:

1. Resolve the account.
2. Resolve the item.
3. Query `pricelists2accounts` to find assigned price lists.
4. Query `prices` for the item across those price lists.
5. If no override exists, fall back to item default selling or purchase price depending on the commercial context.

Important caveat:

- `prices.price` may explicitly fall back to item defaults according to the schema. Say when that happened.

## Pattern: Low Stock Or Stock History

Use this for prompts like:

- "Which items are low on stock?"
- "Show stock movements for item ABC in the last month."

Recommended approach:

1. Resolve the item or storage scope.
2. Query `stocktransactions` in the relevant period.
3. Aggregate movement client-side for availability-style answers.
4. Keep the raw transaction list for audit-style answers.

## Pattern: Supplier Lookup

Use this for prompts like:

- "Who are the suppliers for item ABC?"
- "What supplier price do we have for this item?"

Recommended approach:

1. Resolve the item.
2. Query `suppliers` for that item.
3. Resolve supplier accounts to readable names if needed.
4. Present supplier price, minimum amount, and delivery time when available.

## Pattern: Price List Coverage

Use this for prompts like:

- "Which price list applies to ACME?"
- "Which accounts use price list Spring 2026?"

Recommended approach:

1. Resolve either the account or the price list first.
2. Query `pricelists2accounts`.
3. Join to `pricelists` or `accounts` for names and active dates.

## Pattern: Promotions And Coupon Codes

Use this for prompts like:

- "Which coupons are active right now?"
- "Which codes belong to coupon Spring Promo?"

Recommended approach:

1. Query `coupons` for active date windows and activity state.
2. Query `couponcodes` when the user needs concrete redeemable codes.
3. Keep generic promotion definitions separate from individual codes.

## Common Failure Modes

- Quoting a price without saying whether it is default or overridden.
- Mixing billing and procurement price logic.
- Reporting stock from one storage as if it were global inventory.
- Ignoring minimum quantities or supplier-specific constraints.
