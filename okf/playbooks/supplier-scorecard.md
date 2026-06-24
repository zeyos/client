---
type: Playbook
title: Supplier Scorecard
description: "Rank suppliers and score procurement performance."
tags: [commerce]
---

1. Resolve the item and supplier [accounts](/entities/accounts.md) (`type = 2`).
2. For sourcing: read [suppliers](/entities/suppliers.md) links (`price`, `minamount`, `deliverytime`, `stock`); a supplier is eligible only if `minamount <= quantity`. State the ranking policy before ranking.
3. For performance: group procurement [transactions](/entities/transactions.md) (types 6/7/8) by supplier over a declared window + currency. See [supplier-delivery-performance](/metrics/supplier-delivery-performance.md). Never place or transmit a procurement transaction.
