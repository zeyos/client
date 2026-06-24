# Calendar and Scheduling Workflows

## Availability (free-slot) algorithm

1. Resolve `$ME` and the timezone (default to the user's stated zone, e.g. Europe/Berlin).
2. Convert the requested window to Unix **seconds**, half-open `[start, end)`.
3. Fetch the user's appointments overlapping the window:

   ```bash
   zeyos list appointments --filter '{"assigneduser":<me>}' \
     --fields ID,name,datefrom,dateto --limit 1000 --json
   ```

4. Sort busy intervals by `datefrom`. Walk them, tracking a cursor at `start`; any gap
   `>= requested duration` between the cursor and the next `datefrom` is a free slot. The
   tail gap between the last `dateto` and `end` counts too.
5. Report the slot as both Unix seconds and ISO timestamps, and name the timezone you used.

## Conflict detection

Two intervals conflict when `aFrom < bTo && bFrom < aTo`. A zero-length appointment
(`datefrom == dateto`) is a point marker, not a busy block — treat it as a boundary.

## Create only after confirmation

```bash
# Preview first (no write):
zeyos create appointment --query \
  --name "Review" --datefrom 1893484800 --dateto 1893486600 --assigneduser <me>
# After the user confirms the exact time + attendee, create and re-read:
zeyos create appointment --name "Review" --datefrom 1893484800 --dateto 1893486600 --assigneduser <me>
```

For attendees, resolve `contacts`/`users` to IDs and add `invitations` linking the
appointment to each attendee. Re-read the created appointment and report its ID and
canonical `datefrom`/`dateto` (R-006). Never auto-send external invitations in tests.

## Rescheduling

Preview the old and new times, re-run conflict detection for the new slot, then
`updateAppointment` the exact ID. Recurring series and attendee expansion are bulk
actions — require explicit confirmation (R-009, R-011).

## Common failure modes

- Using milliseconds instead of seconds.
- Off-by-one at window boundaries (use half-open `[start, end)`).
- Treating an invitation row as proof an email was delivered.
- Creating before the user confirmed the exact time, timezone and attendee.
