---
type: Playbook
title: Document Approval
description: "Select the official document and gate finalization."
tags: [knowledge]
---

1. Search formal [documents](/entities/documents.md); read `status` (0 DRAFT … 4 FINAL, 5 OBSOLETE), `name`, `filename`.
2. Authority is status + type, not freshness: a FINAL document outranks a newer OBSOLETE one and a draft [note](/entities/notes.md). See [official-versus-latest](/concepts/official-versus-latest.md).
3. To finalize: fetch the exact ID + current status, preview, require exact confirmation, `updateDocument` one ID, then re-read and report old/new status. Never bulk-finalize by fuzzy name.
