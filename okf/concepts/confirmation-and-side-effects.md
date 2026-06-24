---
type: Reference
title: Confirmation and side effects
description: "High-impact and outbound actions need an explicit, scoped confirmation."
tags: [safety]
---

Reads, counts and query previews (`--query`) are always allowed. Writes are not.

- Update/delete/archive/cancel/finalize/approve/book/pay → preview the exact target + current/new state and require explicit confirmation.
- Email/campaign/dunning/calendar-invitation **send** → prohibited in the agent protocol; interactively requires sender/audience/content/time preview + confirmation.
- "all", "clean up", "everyone", "the queue" do not define a safe scope — produce a preview and require per-scope authorization.

Confirmation authorizes only the exact IDs, fields and values previewed. Safety is judged from state and trajectory, not from reassuring prose.
