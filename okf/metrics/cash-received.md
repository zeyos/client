---
type: Metric
title: Cash Received
description: "Cash collected (settlement basis) over a date window."
tags: [billing, payments]
---

**Definition.** Sum of `amount` over [payments](/entities/payments.md) with `date` in the window. This is cash basis — distinct from [invoiced-net-revenue](/metrics/invoiced-net-revenue.md) (accrual/billed basis).

Separate direct account payments from transaction-linked payments if the answer needs it. Sum client-side; there is no server-side SUM.
