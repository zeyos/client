---
type: Playbook
title: Customer 360
description: "Assemble a cross-domain summary for one customer."
tags: [crm]
---

1. Resolve the account first ([accounts](/entities/accounts.md) by `customernum`/`lastname`).
2. Open work: [tickets](/entities/tickets.md) for the account.
3. Billing: [transactions](/entities/transactions.md) (invoices/credits) and [payments](/entities/payments.md).
4. Mail: resolve [contacts](/entities/contacts.md) email, then [messages](/entities/messages.md) (no direct account FK — see the entity note).
5. Present facts and inference separately; state interpretations.
