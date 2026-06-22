---
type: Metric
title: Overdue Receivables
description: "Receivables in collection, via dunning — not from transactions alone."
tags: [collections]
---

**Definition.** Overdue/in-collection exposure is tracked through [dunning](/entities/dunning.md) notices and the [dunning2transactions](/entities/dunning2transactions.md) junction, not inferred from [transactions](/entities/transactions.md) alone.

**operationId trap.** Use `listDunningNotices` / `getDunningNotice` and `listDunningToTransactions`. See [operationid-vocabulary](/concepts/operationid-vocabulary.md).

Separate invoice exposure (the receivable) from collection stage and next action.
