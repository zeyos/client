---
type: Reference
title: Currency and rounding
description: "Do not sum across currencies; compare money with a small tolerance."
tags: [billing]
---

Keep monetary aggregates in one currency unless an explicit exchange-rate policy and effective date are provided; otherwise return per-currency totals.

State the basis (invoiced vs cash) and currency. When comparing computed sums, allow a small decimal tolerance (e.g. 0.005) to absorb floating-point error. See [invoiced-net-revenue](/metrics/invoiced-net-revenue.md) and [cash-received](/metrics/cash-received.md).
