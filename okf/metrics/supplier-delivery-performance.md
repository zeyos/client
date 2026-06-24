---
type: Metric
title: Supplier Delivery Performance
description: "Ordered vs invoiced value, delivery timeliness and price variance per supplier."
tags: [commerce]
---

**Definition.** Per supplier `account`, over a declared window and one currency, from [transactions](/entities/transactions.md): `ordered_value` = Σ `netamount` (type 6), `invoiced_value` = Σ `netamount` (type 8), `price_variance` = invoiced − ordered, on-time from type-7 delivery dates vs the order `duedate`.

Keep ordered, delivered and invoiced quantities distinct. Exclude cancelled records by documented policy. See [supplier-scorecard](/playbooks/supplier-scorecard.md).
