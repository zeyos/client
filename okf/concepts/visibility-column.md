---
type: Reference
title: visibility: 0 (only where the column exists)
description: "visibility:0 hides archived rows — but only resources that have the column."
tags: [query]
---

`visibility = 0` excludes archived/deleted rows, but **only some resources have a `visibility` column**:

- Have it: [tickets](/entities/tickets.md), [accounts](/entities/accounts.md), [items](/entities/items.md).
- Do **not** have it: [transactions](/entities/transactions.md) — adding `"visibility":0` there returns an opaque **HTTP 400**.

More generally, filtering on any column a resource lacks 400s with no field name. Include `visibility:0` on resources that have it unless the user wants archived records; `zeyos describe <resource>` tells you whether the column exists.
