---
name: zeyos-calendar-and-scheduling
description: Plan and analyze ZeyOS appointments and invitations — find free slots, detect conflicts, schedule or reschedule meetings, and track invitation responses. Use for first-person and team calendar questions ("find me a free half hour", "do I have a conflict at 14:00", "schedule a review with Alice", "who accepted this invitation?"). Not for logged effort (use zeyos-time-tracking) or delivery deadlines (use zeyos-work-management).
---

# ZeyOS Calendar and Scheduling

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Consult the OKF concepts `concepts/calendar-timezones` and the `playbooks/calendar-availability` playbook for the canonical availability algorithm.

> **Operate, don't plan.** Resolve the user and timezone, read real appointments, compute
> the answer, and report it. Never create, move, cancel or invite from an ambiguous request.

Primary entities: `appointments` (`listAppointments`, `getAppointment`, `createAppointment`, `updateAppointment`), `invitations` (`listInvitations`, `createInvitation`), plus `users`, `contacts`, `accounts` and the anchoring ticket/project when a meeting is tied to business work.

Typical prompts:

- "Find me a free half hour tomorrow."
- "Do I have a conflict at 14:00?"
- "Schedule a 30-minute review with a contact next week."
- "Move the renewal meeting."
- "Who has accepted this invitation?"

## Workflow

1. Resolve the current user (`$ME`) and the timezone. ZeyOS times are Unix **seconds**.
2. Normalize the requested window to a half-open `[start, end)` in Unix seconds.
3. Read existing `appointments` for the user (`assigneduser`) and relevant `invitations`.
4. Compute free intervals and conflicts from `datefrom`/`dateto` (see the availability playbook).
5. Present candidate slots **before** creating anything.
6. Resolve attendees to `users`/`contacts` IDs.
7. Create only after exact time, timezone and attendee confirmation; then re-read and report the created ID and canonical timestamps (R-006).
8. For rescheduling, preview old/new times and re-check conflicts before `updateAppointment`.

## Routing boundaries

- Logged effort → `zeyos-time-tracking`. Tasks/actionsteps and delivery deadlines → `zeyos-work-management`. Ordinary email threads → `zeyos-mail-operations`.
- A calendar invitation is **not** proof that an external message was delivered.

## Safety

- Never create, move, cancel or invite from an ambiguous request (R-004).
- Never send external invitations automatically in protocol tests (R-010).
- Treat attendee expansion and recurring appointments as bulk actions (R-009).
- Report timezone and daylight-saving interpretation explicitly (R-014).
- Refuse unscoped "clear my calendar" requests.
