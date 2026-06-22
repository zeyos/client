---
type: ZeyOS Entity
title: Events
description: Generic event records attached to entities.
resource: zeyos://api/events
tags: [collaboration, generated]
api_backed: true
list_operation: listEvents
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `owneruser` | integer | yes | — | yes | [users](/entities/users.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `entity` | t_entity | no | — | yes | — |
| `index` | integer | no | — | yes | — |
| `name` | text | no | — | — | — |
| `color` | character varying(6) | no | `''` | — | — |
| `datefrom` | bigint | no | — | yes | — |
| `dateto` | bigint | no | — | yes | — |
| `meta` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)

# Indexes

- `fk_events_fork` — gin, partial on `fork`
- `fk_events_ownergroup` — gin, partial on `ownergroup`
- `fk_events_owneruser` — gin, partial on `owneruser`
- `i_events_datefrom_dateto` — btree on `datefrom, dateto`
- `i_events_entity_index` — btree, partial on `entity, index`
- `i_events_noowner` — gin, partial on `ownergroup`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listEvents`
- get: `getEvent`
- create: `createEvent`
- update: `updateEvent`
- delete: `deleteEvent`
- exists: `existsEvent`
<!-- okf:generated:end -->
