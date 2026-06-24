---
type: Metric
title: Account Address Completeness
description: "Which active customers lack a billing (or shipping) address."
tags: [crm]
---

**Definition.** Active [accounts](/entities/accounts.md) (`type = 1`, `visibility = 0`) with no [addresses](/entities/addresses.md) row of `type = 1` (billing). `addresses` has **no** `visibility` column — do not filter it.

This is an anti-join, not a count. See [missing-billing-addresses](/playbooks/missing-billing-addresses.md) and [null-empty-missing](/concepts/null-empty-missing.md).
