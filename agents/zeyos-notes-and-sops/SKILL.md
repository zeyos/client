---
name: zeyos-notes-and-sops
description: Retrieve and summarize ZeyOS notes, SOPs, documents, and file-backed knowledge. Use when asked to find an internal procedure, summarize notes, locate the latest finalized operating document, inspect attachments, or explain whether knowledge lives in notes, documents, or files.
---

# ZeyOS Notes And SOPs

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. Read [../shared/zeyos-entity-map.md](../shared/zeyos-entity-map.md) when the request spans notes, documents, files, and related business records. Read [references/workflows.md](references/workflows.md) for knowledge-retrieval patterns.

Typical prompts:

- "Find the current escalation SOP for billing disputes."
- "Summarize our notes on failed invoice syncs."
- "Which finalized onboarding SOP changed last month?"
- "Which files are attached to this document?"

## Workflow

1. Decide whether the user is asking for note text, a formal document, or an attachment.
2. Prefer `notes` when the question is about readable text.
3. Prefer `documents` when the question is about the official SOP artifact or finalized file.
4. Use `files` only when the request is explicitly about attachments or file inventory.
5. Prefer finalized material for SOP-style questions and say which status/date you used.
6. Do not claim to have read binary document content unless you actually fetched it through the appropriate path.
7. Present competing matches when names are similar or multiple revisions exist.

## Output Discipline

- State whether the answer came from a note, document, or attachment.
- Report the status and last-modified context for SOP-style answers.
- Call out when the documented schema does not expose direct business-record linkage.
