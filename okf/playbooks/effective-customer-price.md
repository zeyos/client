---
type: Playbook
title: Effective Customer Price
description: "Resolve a customer price: price-list override, else item default."
tags: [commerce]
---

1. Resolve the customer's assigned price list via [pricelists2accounts](/entities/pricelists2accounts.md) (`listPriceListsToAccounts`).
2. For each item, look up a [prices](/entities/prices.md) row in that price list (`source = pricelist-override`).
3. If none, fall back to the item's own `sellingprice` (`source = item-default`).
4. Report `{itemId, price, currency, source, minAmount}`; always name the source. See [filters-vs-filter](/concepts/filters-vs-filter.md).
