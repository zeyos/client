# Mission Control

A team-performance dashboard for an IT consultancy running on ZeyOS — built on
the [`@zeyos/client`](../../README.md) library. It answers the managing
director's question: **who is actually working, and where is there untapped
capacity?**

A dark "mission control" view: a velocity KPI row, a 13-week throughput trend,
a team-capacity strip, and a searchable/sortable/filterable grid of per-employee
activity cards (click one for a per-type digest + contribution graph).

## What it shows

1. **Velocity** — tickets opened vs closed in the window, net flow, average /
   median / p90 **cycle time** (open → close), open backlog (with overdue), and
   total **hours booked**. A 13-week **throughput trend** of opened vs closed.
2. **Activity card per employee** — open tickets, open tasks, tickets closed,
   hours booked, a weekly-hours sparkline, team/location tags, a **capacity
   badge** (Overloaded / Balanced / Available / Idle / Former), and **last
   activity** (the most recent time entry) — flagged red when it's **older than
   7 days**. Hover "last activity" to see the engineer's **last 10 time entries**
   (date · type · customer · ticket · hours).
3. **Per-employee digest** (click a card) — **booked hours stacked by
   `extdata.type`** (Weekly / Monthly), and a **GitHub-style contribution graph**
   of their time-entry activity over the last 53 weeks.

Filters: search by name, **filter by team / department / location** (group
membership), capacity chips (Engaged / Spare capacity / Inactive >7d /
Overloaded / All), and sort by activity, hours, throughput, workload, cycle,
overdue, or least-recent.

The **Team capacity** strip and the *Spare capacity* filter surface the
"untapped resources": active engineers running light or with no load at all,
contrasted with the overloaded ones — the clearest place to rebalance work.

## Run it

```bash
# 1. Authenticate once (if you haven't already)
zeyos login --base-url https://zeyos.cms-it.de/dev

# 2. Pull live data into data.js (read-only; reuses your CLI credentials)
node samples/missioncontrol/fetch-data.mjs            # 90-day window
node samples/missioncontrol/fetch-data.mjs --days 180 # custom window

# 3. Open the dashboard
#    Either open index.html directly, or serve the folder:
python3 -m http.server 8765 --directory samples/missioncontrol
#    → http://localhost:8765
```

`fetch-data.mjs` writes `data.js` (a `window.MISSION_DATA = …` assignment) so
`index.html` works straight from disk — no server, no CORS, no token pasting.
Re-run the fetcher to refresh; the page is otherwise a static, dependency-free
single file (hand-rolled CSS + inline-SVG charts).

## How it works

`fetch-data.mjs` reads the credentials `zeyos login` stored
(`.zeyos/auth.json` or `~/.config/zeyos/credentials.json`), builds an
auto-refreshing client with `createZeyosClient`, and issues a handful of
**read-only** `list` queries (tickets, `actionsteps`, tasks, groups), then
aggregates them client-side (ZeyOS has no server-side group-by). It never writes
to ZeyOS.

### Metric definitions (so the numbers are reproducible)

| Metric | Definition |
|--------|------------|
| **Time entry** | an `actionsteps` row with `status IN [1, 3]` (COMPLETED + BOOKED), attributed to an engineer via **`assigneduser`** (`owneruser` is unused here). `effort` is in **minutes**. |
| **Last activity** | the engineer's most recent time-entry `date`; **stale** (red ⚠) when it's >7 days before the "as of" date. |
| **Type** | `extdata.type` of each time entry (Intern / Auftrag / Consulting / Wartung / …), selected on `list` via the `extdata.type` field. Top 6 are charted; the rest roll into *Other*. |
| **Closed / done** | tickets with `status IN [9, 11]` — COMPLETED + BOOKED (BOOKED, completed & billed, is the dominant terminal state). |
| **Open backlog** | `status IN [0, 1, 2, 4, 6, 7]` — started/accepted/active but not done. |
| **Opened in window** | tickets whose indexed `date` falls in the window. |
| **Cycle time** | `lastmodified − creationdate` for tickets closed in the window (a proxy for the close timestamp, which ZeyOS does not store separately). |
| **Capacity** | relative to the engaged-and-active cohort: *overloaded* (top-quintile workload or ≥3 overdue), *available* (low workload **and** below-median throughput), *idle* (active user, zero load), *balanced* (else), *former* (deactivated user with leftover assignments). |
| **Team / location** | the engineer's **group memberships** (see below). |

### Notes & limitations

- **Department/location = groups.** ZeyOS *defines* custom fields
  `users.department`/`users.location`/`users.team`, but the API returns
  *"Extension data not available for users"* — they can't be read. The org
  structure instead lives in **group membership** (e.g. `Developers`,
  `Services`, `Technik`, `Berlin`, `Bayern`, `Nordrhein-Westfalen`), which is
  what the team/location filter uses.
- **`extdata` only lists via dot-fields.** Custom fields aren't returned by a
  plain `list` (or `extdata=1`); they must be selected explicitly, e.g.
  `fields: ['…','extdata.type']` (returned as `extdata_type`). On single records
  `getTicket(…, { query:{ extdata:1 } })` returns them under an `extdata` object.
- **Corrupt time-entry dates.** Many `actionsteps` have far-future `date` values
  (year 2099+); the fetcher bounds queries to `date ≤ now` to exclude them.
- **"As of" anchoring.** Windows are measured back from the latest activity in
  the data, not wall-clock today — so a frozen/dev snapshot still produces
  meaningful windows (and the 7-day staleness check is relative to it). The
  anchor date is shown in the header.
- **`date`, not `creationdate`, for windows.** `creationdate`/`lastmodified` are
  unindexed on `tickets`; range-scanning them can time out (HTTP 503). The
  indexed `date` column is used for opened-in-window queries.
- **Roles aren't distinguished.** Every active user is included; a salesperson
  with no tickets shows as *Idle*. Use the team filter / search to focus on a
  delivery team.

> `data.js` / `data.json` are generated and contain real names from your
> instance — they are git-ignored. Commit only the source.
