---
type: Playbook
title: Calendar Availability
description: "Find free slots and conflicts from appointments."
tags: [work]
---

1. Resolve the user (`$ME`) and timezone; normalize the window to a half-open `[start,end)` in Unix **seconds**.
2. List [appointments](/entities/appointments.md) for the user overlapping the window (`datefrom`/`dateto`).
3. Sort busy intervals; a gap `>=` the requested duration is a free slot (two intervals conflict when `aFrom < bTo && bFrom < aTo`).
4. Report Unix seconds + ISO and the timezone used. Create only after exact confirmation; an [invitation](/entities/invitations.md) is not proof an email was sent. See [calendar-timezones](/concepts/calendar-timezones.md).
