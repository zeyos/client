---
type: ZeyOS Entity
title: Campaigns
description: Marketing or outreach campaigns.
resource: zeyos://api/campaigns
tags: [outreach, generated]
api_backed: true
list_operation: listCampaigns
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
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `datefrom` | bigint | no | — | — | — |
| `dateto` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = DRAFT · `1` = NOTSTARTED · `2` = AWAITINGAPPROVAL · `3` = APPROVED · `4` = DISMISSED · `5` = ACTIVE · `6` = INACTIVE · `7` = INEVALUATION · `8` = CANCELLED · `9` = CLOSED

# Indexes

- `fk_campaigns_assigneduser` — gin, partial on `assigneduser`
- `fk_campaigns_fork` — gin, partial on `fork`
- `fk_campaigns_ownergroup` — gin on `ownergroup`
- `i_campaigns_nofork` — gin, partial on `fork`
- `i_campaigns_noowner` — gin, partial on `ownergroup`
- `s_campaigns_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listCampaigns`
- get: `getCampaign`
- create: `createCampaign`
- update: `updateCampaign`
- delete: `deleteCampaign`
- exists: `existsCampaign`
<!-- okf:generated:end -->
