---
type: Metric
title: Open Customers
description: "Count of active customer accounts."
tags: [crm]
---

**Definition.** Count of [accounts](/entities/accounts.md) where `type = 1` (CUSTOMER), excluding archived (`visibility = 0`).

```bash
zeyos count accounts --filter '{"type":1,"visibility":0}'
```

Count server-side (`count`), never `list` + row length. See [counting-and-sums](/concepts/counting-and-sums.md). State the definition you used ("customer = type 1, excluding archived").
