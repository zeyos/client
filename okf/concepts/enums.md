---
type: Reference
title: Common enums
description: "Priority and ticket status enum values."
tags: [reference]
---

Each entity concept's **Enums** section carries that entity's enums (parsed from the schema). The most-used:

**Priority** (tickets/tasks): `0`=LOWEST, `1`=LOW, `2`=MEDIUM, `3`=HIGH, `4`=HIGHEST.

**Ticket status**: `0`=NOT_STARTED, `1`=AWAITING_ACCEPTANCE, `2`=ACCEPTED, `3`=REJECTED, `4`=ACTIVE, `5`=INACTIVE, `6`=FEEDBACK_REQUIRED, `7`=TESTING, `8`=CANCELLED, `9`=COMPLETED, `10`=FAILED, `11`=BOOKED. Closed = IN [9, 11].

**Account type**: `0`=PROSPECT, `1`=CUSTOMER, `2`=SUPPLIER, `3`=CUSTOMERANDSUPPLIER, `4`=COMPETITOR, `5`=EMPLOYEE.
