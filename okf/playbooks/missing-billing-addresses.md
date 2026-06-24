---
type: Playbook
title: Missing Billing Addresses
description: "Anti-join: active customers with no billing address."
tags: [crm]
---

1. List active customers ([accounts](/entities/accounts.md) `type = 1`, `visibility = 0`).
2. List billing [addresses](/entities/addresses.md) (`type = 1`). `addresses` has **no** `visibility` column — do not filter it.
3. Keep customers whose ID has no matching `addresses.account` (the anti-join).
4. Optionally flag whether each still has a shipping address (`type = 0`).
5. Export with a stable header and declared null representation. See [account-address-completeness](/metrics/account-address-completeness.md).
