---
type: Playbook
title: Activity Timeline
description: "Chronological, source-labelled timeline for a record."
tags: [collaboration]
---

1. Resolve the anchor record (e.g. a [ticket](/entities/tickets.md)).
2. Gather the directly-linked items by their own date fields: [tasks](/entities/tasks.md), [actionsteps](/entities/actionsteps.md), [messages](/entities/messages.md) (and [records](/entities/records.md)/[comments](/entities/comments.md)/[files](/entities/files.md) where present).
3. Merge into one stream sorted ascending by timestamp; keep each entry's `type` (provenance).
4. Emit one object per line (NDJSON) with `timestamp,type,id,parentId,summary`. Keep root and comment attachments distinguishable.
