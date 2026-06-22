---
type: ZeyOS Entity
title: Opportunities
description: Sales pipeline and deal records.
resource: zeyos://api/opportunities
tags: [crm, generated]
api_backed: true
list_operation: listOpportunities
visibility_column: true
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `contact` | integer | yes | — | yes | [contacts](/entities/contacts.md) |
| `campaign` | integer | yes | — | yes | [campaigns](/entities/campaigns.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `opportunitynum` | text | no | `''` | yes | — |
| `date` | bigint | no | `EXTRACT(epoch FROM now())` | yes | — |
| `duedate` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `priority` | smallint | no | `2` | — | — |
| `probability` | smallint | no | `0` | — | — |
| `worstcase` | double precision | no | `0` | — | — |
| `mostlikely` | double precision | no | `0` | — | — |
| `upside` | double precision | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)
- `contact` → [contacts](/entities/contacts.md) (`contacts.ID`)
- `campaign` → [campaigns](/entities/campaigns.md) (`campaigns.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = UNEVALUATED · `1` = ELIGIBLE · `2` = FEEDBACKREQUIRED · `3` = INNEGOTIATION · `4` = OFFERED · `5` = ACCEPTED · `6` = REJECTED

### `priority`

`0` = LOWEST · `1` = LOW · `2` = MEDIUM · `3` = HIGH · `4` = HIGHEST

# Indexes

- `fk_opportunities_account` — btree, partial on `account`
- `fk_opportunities_assigneduser` — gin, partial on `assigneduser`
- `fk_opportunities_campaign` — btree, partial on `campaign`
- `fk_opportunities_contact` — btree, partial on `contact`
- `fk_opportunities_fork` — gin, partial on `fork`
- `fk_opportunities_ownergroup` — gin on `ownergroup`
- `i_opportunities_date` — btree on `date`
- `i_opportunities_nofork` — gin, partial on `fork`
- `i_opportunities_noowner` — gin, partial on `ownergroup`
- `s_opportunities_name` — gin on `name`
- `s_opportunities_opportunitynum` — gin, partial on `opportunitynum`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listOpportunities`
- get: `getOpportunity`
- create: `createOpportunity`
- update: `updateOpportunity`
- delete: `deleteOpportunity`
- exists: `existsOpportunity`
<!-- okf:generated:end -->
