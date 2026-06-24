---
type: Metric
title: Stock Movement by Storage
description: "Booked/reserved/cancelled stock movement quantities grouped per storage."
tags: [commerce]
---

**Definition.** Group [stocktransactions](/entities/stocktransactions.md) for an item by `storage`, summing `amount` per `flag` (0 BOOKED, 1 RESERVED, 2 CANCELLED).

Never report one storage — or one flag — as the global stock level. `stocktransactions` has no `visibility` column. See [counting-and-sums](/concepts/counting-and-sums.md).
