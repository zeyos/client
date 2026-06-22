---
type: Reference
title: filters vs filter (the FK/GIN footgun)
description: "Use `filters` (plural) so foreign-key fields match via their GIN/partial indexes."
tags: [query]
---

The OpenAPI spec documents the list body field as `filter` (singular), but **`filters` (plural)** is what reliably matches GIN-indexed / partial-indexed foreign-key fields (`account`, `project`, `ticket` on related resources).

- `@zeyos/client`: use `filters`.
- `zeyos` CLI: pass `--filter '{…}'` — it serializes to `filters` internally.
- Raw REST: the spec says `filter`; verify against the target instance.

`client.schema.validate()` flags a top-level `filter` on list/count ops and suggests `filters`. Only filter on columns the resource actually has — an unknown column 400s with no hint which field was wrong (run `zeyos describe <resource>` first).
