---
name: zeyos-time-tracking
description: First-person personal work and interactive time logging in ZeyOS. Use when the user speaks about their own work ("what are my current tickets?", "what's on my plate?", "what am I working on?", "my open tasks", "my action steps") or wants to record/log/book time or effort ("log 60 minutes for client XYZ", "record 2 hours on ticket 812", "book time against Project Atlas"). Resolves the current user, finds the right account and the candidate ticket/task/project to attach time to, confirms the target with the user, then writes the time entry as an actionstep with `effort`.
---

# ZeyOS Time Tracking

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [references/workflows.md](references/workflows.md) for the concrete query and write patterns. This skill overlaps with [../zeyos-work-management/SKILL.md](../zeyos-work-management/SKILL.md): use **work-management** for third-person, analytical queries about other people's queues, project tracing, and effort *summaries*; use **time-tracking** when the request is **first-person** ("my …") or is about **recording new time**.

Typical prompts:

- "What are my current tickets?" / "What's on my plate?" / "What am I working on?"
- "Show my open tasks." / "What action steps are assigned to me?"
- "Log 60 minutes of work for client XYZ."
- "Record 2 hours on ticket 812." / "Book 90 minutes against Project Atlas."
- "Log half an hour for ACME, I was on a call about the renewal."
- "How much time did I log this week?" / "Summarize my logged hours by account."
- "Give me a summary of logged ticket time from the last four weeks."
- "Actually make that 90 minutes, not 60." / "Move that time to ticket 813."

## Two jobs

1. **Read "my work"** — resolve the current user, then list their open tickets / tasks / action steps. Read-only; just run it.
2. **Log time (a write)** — resolve *who* the time is for, *what* it attaches to, then create one `actionstep` carrying the effort. This is interactive and confirmed.

## The current user

The logged-in user's id is `getUserInfo().sub` — a stringified positive integer that **is** the `users.ID`. Get it from `zeyos whoami --json` (read the `sub` field) before any "my …" query, and use it as `assigneduser` on the work resources. Do not guess it and do not ask the user for it.

## Interactive discipline (this is the point of the skill)

Interactivity here means **act first, then ask only when real data is ambiguous** — never the planning-instead-of-running failure the operating guide warns about.

1. **Always run the resolution queries before asking anything.** "I found 3 accounts matching 'XYZ' — which one?" is good (grounded in a query you ran). "Which account do you mean?" with no search behind it is not.
2. **Ask only when the data is genuinely ambiguous** and the answer changes the write: multiple account matches, or several plausible tickets/tasks. A single unambiguous match needs no question — state it and continue.
3. **Confirm the target before the write.** Time logging creates a record. The user's "log 60 minutes" authorizes *one* entry; the confirmation is about *where* it lands (which work item) and *what* it says — show the actionstep you are about to create and let the user correct it.
4. **Never invent the attachment.** If you cannot resolve a confident target and there is no human to ask (e.g. an automated run), stop and report what you found rather than guessing a foreign key for a write.

## Safety

- Read views are read-only; run them directly.
- Logging time is a **create**, allowed because the user explicitly asked to log it. Preview with `--query` and confirm the target first; create exactly one record; then read it back.
- Never delete or bulk-modify time entries on a category ("clear my logged time", "remove old entries") — those are per-record, by id, after preview. See the destructive-operations rules in [../zeyos-work-management/SKILL.md](../zeyos-work-management/SKILL.md).

## Output discipline

- For "my work": state the resolved user and the open-status definition you used, then the list.
- For ticket time summaries: include both actionsteps directly linked by `actionstep.ticket` and actionsteps linked by `actionstep.task` where `task.ticket` is the summarized ticket; dedupe by actionstep ID before summing.
- For a logged entry: report the created actionstep id, the attached record (ticket/task/account), the effort in minutes, and the date.
- Separate what you resolved from what you assumed; call out any account or work-item ambiguity you had to break.
