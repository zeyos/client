---
type: Playbook
title: Duplicate Account Review
description: "Find and explain duplicate-account candidates safely."
tags: [crm]
---

1. Define the population and active scope; normalize comparison fields without losing originals (see [null-empty-missing](/concepts/null-empty-missing.md)).
2. Score candidate pairs from deterministic evidence: exact `customernum`, exact normalized email (via [contacts](/entities/contacts.md)), exact normalized name/address (strong); near-name-only (weak/low confidence).
3. Sort by score; explain reasons + confidence. Detection is read-only and separate from remediation.
4. A "clean up" request becomes a bounded preview (exact IDs + proposed per-ID action) requiring a human decision — never a bulk merge/archive/delete.
