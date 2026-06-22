---
type: Playbook
title: Ticket Work Packet
description: "Trace a ticket down to its tasks and follow-ups."
tags: [work]
---

1. Resolve the [ticket](/entities/tickets.md) (`ticketnum`/`name`).
2. [tasks](/entities/tasks.md) where `ticket` = that ID (use the `filters` form for the FK — see [filters-vs-filter](/concepts/filters-vs-filter.md)).
3. [actionsteps](/entities/actionsteps.md) bound to the ticket/its tasks for smaller follow-ups.
4. Summarize open vs closed (closed ticket = `status` IN [9, 11]).
