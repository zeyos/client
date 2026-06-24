---
type: Reference
title: Calendar timezones and intervals
description: "Appointments are Unix seconds; reason about half-open intervals in a stated timezone."
tags: [work]
---

[appointments](/entities/appointments.md) use `datefrom`/`dateto` as Unix **seconds**. Compute availability over half-open intervals `[start,end)` and state the timezone (and daylight-saving interpretation) you used.

Two intervals conflict when `aFrom < bTo && bFrom < aTo`. A calendar [invitation](/entities/invitations.md) records an attendee/response — it is not proof an external email was delivered. See [dates-unix-seconds](/concepts/dates-unix-seconds.md).
