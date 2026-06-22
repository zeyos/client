---
type: ZeyOS Entity
title: Bin Files
description: Binary file storage records.
resource: zeyos://api/binfiles
tags: [platform, generated]
api_backed: true
list_operation: listBinFiles
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `size` | integer | no | — | yes | — |
| `hash` | bytea | no | — | yes | — |

# Indexes

- `i_binfiles_hash` — hash on `hash`

# Operations

- list: `listBinFiles`
<!-- okf:generated:end -->

# Notes

List-only: `listBinFiles`.
