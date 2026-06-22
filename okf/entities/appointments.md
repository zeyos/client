---
type: ZeyOS Entity
title: Appointments
description: Calendar appointments.
resource: zeyos://api/appointments
tags: [work, generated]
api_backed: true
list_operation: listAppointments
visibility_column: true
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
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `davserver` | integer | yes | — | yes | [davservers](/entities/davservers.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `location` | text | no | `''` | yes | — |
| `color` | character varying(6) | no | `''` | — | — |
| `datefrom` | bigint | no | — | yes | — |
| `dateto` | bigint | no | — | yes | — |
| `recurrence` | smallint | yes | — | — | — |
| `interval` | smallint | no | `1` | — | — |
| `maxoccurrences` | integer | no | `0` | — | — |
| `daterecurrence` | bigint | yes | — | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `davserver` → [davservers](/entities/davservers.md) (`davservers.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `recurrence`

`0` = DAY · `1` = WORKDAY · `2` = WEEK · `3` = MONTH · `4` = YEAR

# Indexes

- `fk_appointments_assigneduser` — gin, partial on `assigneduser`
- `fk_appointments_davserver` — gin, partial on `davserver`
- `fk_appointments_fork` — gin, partial on `fork`
- `fk_appointments_ownergroup` — gin, partial on `ownergroup`
- `fk_appointments_owneruser` — gin, partial on `owneruser`
- `i_appointments_datefrom_dateto` — btree on `datefrom, dateto`
- `i_appointments_nofork` — gin, partial on `fork`
- `i_appointments_noowner` — gin, partial on `ownergroup`
- `s_appointments_location` — gin, partial on `location`
- `s_appointments_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listAppointments`
- get: `getAppointment`
- create: `createAppointment`
- update: `updateAppointment`
- delete: `deleteAppointment`
- exists: `existsAppointment`
<!-- okf:generated:end -->
