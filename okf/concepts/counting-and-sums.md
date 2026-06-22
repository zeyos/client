---
type: Reference
title: Counting and summing
description: "Count server-side; there is no server-side SUM."
tags: [query]
---

**Counts.** Use `zeyos count <resource>` (CLI) or `count: true` on the list call (client). Never `list` + array length: `zeyos list` defaults to `--limit 50`, so you get the page size, not the total (the only `--json` truncation signal is a stderr "Showing X–Y of TOTAL" hint).

**Sums.** There is no server-side SUM. `list` the matching rows with the numeric field at a high `--limit` (up to 10000) and add them up client-side.
