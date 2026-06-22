---
type: Reference
title: Dates are Unix seconds
description: "All ZeyOS timestamps are Unix seconds; pick the indexed date field."
tags: [query]
---

All ZeyOS dates are Unix timestamps in **seconds** (not milliseconds).

- `date` — business-effective date (invoice date, message date). Use for period reporting. Indexed.
- `lastmodified` — recent-change tracking.
- `creationdate` — often **unindexed**; filtering a time window on it (or other unindexed date columns) can return **HTTP 503**. Prefer the indexed `date` field for windows.
