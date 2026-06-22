---
type: Metric
title: Invoiced Net Revenue
description: "Net invoiced revenue from billing invoices over a date window."
tags: [billing, revenue]
---

**Definition.** Sum of `netamount` over [transactions](/entities/transactions.md) where `type = 3` (billing invoice) and `date` falls in the window. For *net after credits*, also sum `type = 4` (billing credit) and subtract.

**Why `date`, not `lastmodified`.** `date` is the business-effective invoice date; `lastmodified` is change tracking. See [dates-unix-seconds](/concepts/dates-unix-seconds.md).

**No server-side SUM.** `list` the matching rows (high `--limit`, up to 10000) with `netamount` and add them up client-side. See [counting-and-sums](/concepts/counting-and-sums.md).

**Do not** add `"visibility":0` — `transactions` has no such column and it 400s. See [visibility-column](/concepts/visibility-column.md).

Related playbook: [revenue-this-year](/playbooks/revenue-this-year.md).
