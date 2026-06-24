---
type: Reference
title: Idempotency and deduplication
description: "Search for an existing owned/semantic duplicate before creating."
tags: [safety]
---

When a user-facing workflow may be retried or re-entered, search for an exact owned or semantic duplicate before creating a record. Prefer a stable, run-scoped name so a retry can find and reuse the prior record rather than creating a second one.

After any allowed create/update, re-read the record by ID and verify the intended fields.
