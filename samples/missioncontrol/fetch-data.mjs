#!/usr/bin/env node
/**
 * Mission Control — data fetcher
 * ──────────────────────────────
 * Pulls team-performance data from a live ZeyOS instance using the
 * `@zeyos/client` library and the credentials you already created with
 * `zeyos login` (read from .zeyos/auth.json or ~/.config/zeyos/credentials.json).
 *
 * It aggregates tickets (velocity) and `actionsteps` (time entries) into the
 * metrics the dashboard needs and writes `data.js` (a `window.MISSION_DATA = …`
 * assignment) so `index.html` can be opened straight from disk — no server, no
 * CORS, no token pasting.
 *
 * Usage:
 *   node samples/missioncontrol/fetch-data.mjs            # 90-day window
 *   node samples/missioncontrol/fetch-data.mjs --days 180
 *
 * Read-only: this script only issues list/count queries. It never writes to ZeyOS.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createZeyosClient, MemoryTokenStore, normalizeListResult } from '../../src/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DAY = 86400;

// ── Tunables ────────────────────────────────────────────────────────────────
const WINDOW_DAYS = parseInt(argValue('--days') ?? '90', 10);   // primary window
const TREND_WEEKS = 13;                                          // velocity / digest trend
const CONTRIB_WEEKS = 53;                                        // contribution graph span
const STALE_DAYS = 7;                                            // "last activity" warning threshold
const TOP_TYPES = 6;                                             // distinct time-entry types to chart; rest → "Other"

// ── Status vocabulary ─────────────────────────────────────────────────────────
const CLOSED_STATUSES = [9, 11];               // tickets: COMPLETED + BOOKED
const OPEN_STATUSES = [0, 1, 2, 4, 6, 7];      // tickets/tasks: in-flight backlog
const TIME_STATUSES = [1, 3];                  // actionsteps: COMPLETED + BOOKED (booked time)

// ── Credentials ───────────────────────────────────────────────────────────────
const LOCAL_FILE = '.zeyos/auth.json';
const GLOBAL_FILE = join(homedir(), '.config', 'zeyos', 'credentials.json');

function findCredentials() {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, LOCAL_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return existsSync(GLOBAL_FILE) ? GLOBAL_FILE : null;
}

const credPath = findCredentials();
if (!credPath) { console.error('No ZeyOS credentials found. Run `zeyos login` first.'); process.exit(1); }
const cred = JSON.parse(readFileSync(credPath, 'utf8'));
if (!cred.baseUrl || !cred.accessToken) {
  console.error(`Credentials at ${credPath} look incomplete. Run \`zeyos login\` again.`); process.exit(1);
}

const tokenStore = new MemoryTokenStore({
  accessToken: cred.accessToken, refreshToken: cred.refreshToken,
  expiresAt: cred.expiresAt, refreshTokenExpiresAt: cred.refreshTokenExpiresAt,
});
const client = createZeyosClient({
  platform: cred.baseUrl,
  auth: { mode: 'oauth', oauth: { clientId: cred.clientId, clientSecret: cred.clientSecret, tokenStore, autoRefresh: true } },
});

async function persistTokens() {
  try {
    const ts = await tokenStore.get();
    if (ts?.accessToken && ts.accessToken !== cred.accessToken) {
      writeFileSync(credPath, JSON.stringify({ ...cred, ...ts }, null, 2) + '\n', { mode: 0o600 });
    }
  } catch { /* non-critical */ }
}

// ── Query helpers ───────────────────────────────────────────────────────────
async function listAll(op, body) {
  return normalizeListResult(await client.api[op]({ limit: 10000, ...body })).data;
}
/** Page through a large collection (ZeyOS caps a single page at 10000). */
async function listPaged(op, body, cap = 250000) {
  const out = []; const limit = 10000;
  for (let offset = 0; ; offset += limit) {
    const page = normalizeListResult(await client.api[op]({ ...body, limit, offset })).data;
    out.push(...page);
    if (page.length < limit || out.length >= cap) break;
  }
  return out;
}

// ── Aggregation utilities ─────────────────────────────────────────────────────
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const percentile = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const round1 = (n) => Math.round(n * 10) / 10;
const weekLabel = (ts) => { const d = new Date(ts * 1000); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const REAL_NOW = Math.floor(Date.now() / 1000);
  console.error(`⚡️ Mission Control — fetching from ${cred.baseUrl}`);
  console.error(`   window: last ${WINDOW_DAYS} days · contribution: ${CONTRIB_WEEKS} weeks\n`);

  // 1) Active roster
  const users = await listAll('listUsers', { fields: ['ID', 'name', 'email'], filters: { activity: 0 } });
  const userById = new Map(users.map((u) => [u.ID, u]));
  console.error(`· users (active):        ${users.length}`);

  // 2) Group membership → department/location facet (user extdata isn't API-readable).
  const groups = await listAll('listGroups', { fields: ['ID', 'name'] });
  const groupName = new Map(groups.map((g) => [g.ID, g.name]));
  const g2u = await listPaged('listGroupsToUsers', { fields: ['group', 'user'] });
  const userGroups = new Map();
  for (const row of g2u) {
    if (!userById.has(row.user)) continue;
    if (!userGroups.has(row.user)) userGroups.set(row.user, []);
    const name = groupName.get(row.group);
    if (name) userGroups.get(row.user).push(name);
  }
  console.error(`· groups:                ${groups.length}`);

  // 3) Anchor "now" to the latest real activity (data may be a frozen snapshot).
  const latestTicket = await listAll('listTickets', { fields: ['ID', 'date'], filters: { visibility: 0 }, sort: ['-date'], limit: 1 });
  let asOf = latestTicket[0]?.date || REAL_NOW;

  // 4) Tickets — velocity (indexed `date` for opened; lastmodified for closed).
  const trendStart = asOf - TREND_WEEKS * 7 * DAY;
  const windowStart = asOf - WINDOW_DAYS * DAY;
  const recentTickets = await listAll('listTickets', {
    fields: ['ID', 'assigneduser', 'status', 'date', 'creationdate', 'lastmodified'],
    filters: { visibility: 0, date: { '>=': trendStart, '<=': asOf } }, sort: ['-date'],
  });
  const closedTickets = await listAll('listTickets', {
    fields: ['ID', 'assigneduser', 'status', 'date', 'creationdate', 'lastmodified'],
    filters: { visibility: 0, status: { IN: CLOSED_STATUSES }, lastmodified: { '>=': trendStart } }, sort: ['-lastmodified'],
  });
  const openTickets = await listAll('listTickets', {
    fields: ['ID', 'assigneduser', 'status', 'duedate'],
    filters: { visibility: 0, status: { IN: OPEN_STATUSES } },
  });
  const openTasks = await listAll('listTasks', {
    fields: ['ID', 'assigneduser', 'status'],
    filters: { visibility: 0, status: { IN: OPEN_STATUSES } },
  });
  console.error(`· tickets:               ${recentTickets.length} opened / ${closedTickets.length} closed (trend) · ${openTickets.length} open · ${openTasks.length} tasks`);

  // 5) Time entries — actionsteps (booked time). Bound to sane dates (≤ now) to
  //    skip corrupt far-future rows. Paged; extdata.type pulled via dot-field.
  const contribStartRaw = asOf - (CONTRIB_WEEKS * 7 - 1) * DAY;
  // snap contribution window start back to a Monday for clean week columns
  const csWeekday = (new Date(contribStartRaw * 1000).getDay() + 6) % 7;
  const contribStart = contribStartRaw - csWeekday * DAY;
  const entries = await listPaged('listActionSteps', {
    fields: ['ID', 'assigneduser', 'date', 'effort', 'ticket', 'account', 'extdata.type'],
    filters: { status: { IN: TIME_STATUSES }, date: { '>=': contribStart, '<=': REAL_NOW } }, sort: ['-date'],
  });
  // entries arrive with `extdata_type`; normalise to `type`
  for (const e of entries) { e.type = e.extdata_type || 'Untyped'; delete e.extdata_type; if (e.date > asOf) asOf = e.date; }
  console.error(`· time entries:          ${entries.length} (${CONTRIB_WEEKS}w)`);

  await persistTokens();

  // recompute windows against possibly-updated asOf
  const winStart = asOf - WINDOW_DAYS * DAY;
  const trStart = asOf - TREND_WEEKS * 7 * DAY;

  // ── Distinct time-entry types → top N + Other (stable chart segmentation) ────
  const typeTotals = new Map();
  for (const e of entries) if (e.date >= winStart) typeTotals.set(e.type, (typeTotals.get(e.type) || 0) + e.effort);
  const topTypes = [...typeTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_TYPES).map(([t]) => t);
  const typeBucket = (t) => (topTypes.includes(t) ? t : 'Other');
  const TYPE_ORDER = [...topTypes, ...(typeTotals.size > TOP_TYPES ? ['Other'] : [])];

  // ── Velocity (tickets) ──────────────────────────────────────────────────────
  const weeks = [];
  for (let w = TREND_WEEKS - 1; w >= 0; w--) {
    const s = asOf - (w + 1) * 7 * DAY, e = asOf - w * 7 * DAY;
    weeks.push({ start: s, end: e, label: weekLabel(e),
      opened: recentTickets.filter((t) => t.date >= s && t.date < e).length,
      closed: closedTickets.filter((t) => t.lastmodified >= s && t.lastmodified < e).length });
  }
  const cycleDaysAll = closedTickets.filter((t) => t.lastmodified >= winStart)
    .map((t) => (t.lastmodified - (t.creationdate || t.date)) / DAY).filter((d) => d >= 0 && d < 3650);
  const cycle = { avgDays: round1(mean(cycleDaysAll)), medianDays: round1(median(cycleDaysAll)), p90Days: round1(percentile(cycleDaysAll, 90)), sampleSize: cycleDaysAll.length };
  const openedInWindow = recentTickets.filter((t) => t.date >= winStart).length;
  const closedInWindow = closedTickets.filter((t) => t.lastmodified >= winStart).length;
  const overdueOpen = openTickets.filter((t) => t.duedate > 0 && t.duedate < asOf).length;

  // ── Per-employee aggregation ─────────────────────────────────────────────────
  const contribCols = Math.ceil((asOf - contribStart) / DAY / 7) + 1;
  const dayIndex = (ts) => Math.floor((ts - contribStart) / DAY);

  const byUser = new Map();
  const ensure = (uid) => {
    if (uid == null) return null;
    if (!byUser.has(uid)) {
      const u = userById.get(uid);
      byUser.set(uid, {
        id: uid, name: u?.name || `user#${uid}`, email: u?.email || '', active: !!u,
        groups: userGroups.get(uid) || [],
        openTickets: 0, overdueTickets: 0, openTasks: 0, openedInWindow: 0, closedInWindow: 0,
        cycleDays: [], _entries: [], lastActivity: 0,
      });
    }
    return byUser.get(uid);
  };
  for (const u of users) ensure(u.ID);

  for (const t of openTickets) { const a = ensure(t.assigneduser); if (!a) continue; a.openTickets++; if (t.duedate > 0 && t.duedate < asOf) a.overdueTickets++; }
  for (const t of openTasks) { const a = ensure(t.assigneduser); if (a) a.openTasks++; }
  for (const t of recentTickets) { const a = ensure(t.assigneduser); if (a && t.date >= winStart) a.openedInWindow++; }
  for (const t of closedTickets) {
    const a = ensure(t.assigneduser); if (!a) continue;
    if (t.lastmodified >= winStart) { a.closedInWindow++; const d = (t.lastmodified - (t.creationdate || t.date)) / DAY; if (d >= 0 && d < 3650) a.cycleDays.push(d); }
  }
  for (const e of entries) {
    const a = ensure(e.assigneduser); if (!a) continue;
    a._entries.push(e);
    if (e.date > a.lastActivity) a.lastActivity = e.date;
  }

  // Resolve customer (account) + ticket numbers for the recent-entries hover.
  // Many entries carry only a ticket, so backfill the customer via the ticket's account.
  const accIds = new Set(), tkIds = new Set();
  for (const a of byUser.values()) for (const e of a._entries.slice(0, 10)) { if (e.account) accIds.add(e.account); if (e.ticket) tkIds.add(e.ticket); }
  const accName = new Map(), tkNum = new Map(), tkAccount = new Map();
  if (tkIds.size) for (const t of await listAll('listTickets', { fields: ['ID', 'ticketnum', 'account'], filters: { ID: { IN: [...tkIds] } } })) {
    tkNum.set(t.ID, t.ticketnum || `#${t.ID}`);
    if (t.account) { tkAccount.set(t.ID, t.account); accIds.add(t.account); }
  }
  if (accIds.size) for (const acc of await listAll('listAccounts', { fields: ['ID', 'lastname', 'firstname'], filters: { ID: { IN: [...accIds] } } }))
    accName.set(acc.ID, acc.lastname || acc.firstname || `#${acc.ID}`);
  const customerOf = (e) => { const id = e.account || tkAccount.get(e.ticket); return id ? (accName.get(id) || `#${id}`) : ''; };

  let employees = [...byUser.values()].map((e) => {
    const entriesWin = e._entries.filter((x) => x.date >= winStart);
    // weekly stacked-by-type (last TREND_WEEKS)
    const weeklyByType = weeks.map((w) => {
      const seg = {};
      for (const x of e._entries) if (x.date >= w.start && x.date < w.end) seg[typeBucket(x.type)] = (seg[typeBucket(x.type)] || 0) + x.effort;
      return { label: w.label, seg };
    });
    // contribution: sparse [dayIndex, count]
    const contribMap = new Map();
    for (const x of e._entries) { const d = dayIndex(x.date); if (d >= 0) contribMap.set(d, (contribMap.get(d) || 0) + 1); }
    const contrib = [...contribMap.entries()].sort((a, b) => a[0] - b[0]);
    // recent 10 entries for the hover
    const recentEntries = e._entries.slice(0, 10).map((x) => ({
      date: x.date, mins: x.effort, type: x.type,
      customer: customerOf(x),
      ticket: x.ticket ? (tkNum.get(x.ticket) || `#${x.ticket}`) : '',
    }));
    const throughput = e.closedInWindow, workload = e.openTickets + e.openTasks;
    return {
      id: e.id, name: e.name, email: e.email, active: e.active, groups: e.groups,
      openTickets: e.openTickets, overdueTickets: e.overdueTickets, openTasks: e.openTasks,
      openedInWindow: e.openedInWindow, closedInWindow: e.closedInWindow,
      avgCycleDays: round1(mean(e.cycleDays)), throughput, workload,
      lastActivity: e.lastActivity,
      stale: e.lastActivity > 0 && (asOf - e.lastActivity) > STALE_DAYS * DAY,
      bookedHours: round1(sum(entriesWin.map((x) => x.effort)) / 60),
      entriesInWindow: entriesWin.length,
      recentEntries, weeklyByType, contrib,
      activityScore: workload + throughput + e.openedInWindow + entriesWin.length,
    };
  });

  // ── Capacity classification (engaged-and-active cohort defines thresholds) ───
  const engaged = employees.filter((e) => e.active && e.activityScore > 0);
  const wLow = percentile(engaged.map((e) => e.workload), 33);
  const wHigh = percentile(engaged.map((e) => e.workload), 80);
  const tMed = median(engaged.map((e) => e.throughput));
  for (const e of employees) {
    if (!e.active) e.capacity = 'former';
    else if (e.activityScore === 0) e.capacity = 'idle';
    else if (e.workload >= wHigh || e.overdueTickets >= 3) e.capacity = 'overloaded';
    else if (e.workload <= wLow && e.throughput <= tMed) e.capacity = 'available';
    else e.capacity = 'balanced';
  }
  employees.sort((a, b) => b.activityScore - a.activityScore || b.throughput - a.throughput);

  // ── Group facet for the filter (only groups engaged employees belong to) ─────
  const groupCount = new Map();
  for (const e of employees) if (e.capacity !== 'former') for (const g of e.groups) groupCount.set(g, (groupCount.get(g) || 0) + 1);
  const groupFacet = [...groupCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));

  // ── Team-level time summary ──────────────────────────────────────────────────
  const winEntries = entries.filter((e) => e.date >= winStart);
  const byTypeHours = TYPE_ORDER.map((t) => ({ type: t, hours: round1(sum(winEntries.filter((e) => typeBucket(e.type) === t).map((e) => e.effort)) / 60) }));

  const data = {
    meta: {
      instance: cred.baseUrl, generatedAt: REAL_NOW, asOf,
      windowDays: WINDOW_DAYS, trendWeeks: TREND_WEEKS,
      contribWeeks: CONTRIB_WEEKS, contribStart, contribCols, staleDays: STALE_DAYS,
      typeOrder: TYPE_ORDER, closedStatuses: CLOSED_STATUSES, openStatuses: OPEN_STATUSES, timeStatuses: TIME_STATUSES,
    },
    velocity: {
      openedInWindow, closedInWindow, net: openedInWindow - closedInWindow,
      backlogOpen: openTickets.length, backlogOverdue: overdueOpen, openTasks: openTasks.length,
      weeklyOpenedAvg: round1(mean(weeks.map((w) => w.opened))), weeklyClosedAvg: round1(mean(weeks.map((w) => w.closed))),
      cycle, trend: weeks.map(({ label, opened, closed }) => ({ label, opened, closed })),
    },
    time: {
      entries: winEntries.length, bookedHours: round1(sum(winEntries.map((e) => e.effort)) / 60),
      byType: byTypeHours, staleEngineers: employees.filter((e) => e.active && e.stale).length,
    },
    team: {
      activeUsers: users.length, engaged: engaged.length,
      available: employees.filter((e) => e.capacity === 'available').length,
      overloaded: employees.filter((e) => e.capacity === 'overloaded').length,
      balanced: employees.filter((e) => e.capacity === 'balanced').length,
      idle: employees.filter((e) => e.capacity === 'idle').length,
      former: employees.filter((e) => e.capacity === 'former').length,
    },
    groups: groupFacet,
    employees: employees.map(({ activityScore, ...rest }) => rest),
  };

  const json = JSON.stringify(data, null, 1);
  writeFileSync(join(__dir, 'data.js'), `window.MISSION_DATA = ${json};\n`);
  writeFileSync(join(__dir, 'data.json'), json + '\n');

  console.error(`\n✓ Wrote data.js + data.json`);
  console.error(`  as of ${new Date(asOf * 1000).toISOString().slice(0, 10)} · ${openedInWindow} opened / ${closedInWindow} closed · ` +
    `${data.time.bookedHours}h booked · ${data.time.staleEngineers} engineers stale (>${STALE_DAYS}d) · ` +
    `${employees.length} employees · ${data.team.available} available, ${data.team.overloaded} overloaded`);
}

function argValue(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; }

main().catch((err) => { console.error(`\n✗ ${err.message}`); if (err.status) console.error(`  HTTP ${err.status}`); process.exit(1); });
