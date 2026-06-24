---
name: zeyos-document-and-approval
description: Find formal ZeyOS documents, judge draft/final/obsolete status, run approval and finalization gates, and compare notes against formal SOPs. Use when status transitions, approval authority, version choice or formal file artifacts matter ("find the current approved onboarding SOP", "which contracts await approval", "make document 812 final", "compare the draft with the final version"). For lightweight note retrieval use zeyos-notes-and-sops.
---

# ZeyOS Document and Approval

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. See the OKF `concepts/official-versus-latest` concept and the `playbooks/document-approval` playbook.

> **Status, not freshness, decides authority.** The newest artifact is not necessarily the
> current official one. Retrieve content before claiming what a document says.

Primary entities: `documents` (`listDocuments`, `getDocument`, `createDocument`, `updateDocument`), `notes` (`listNotes`, `getNote`), `binfiles` (`listBinFiles`), `files`, plus `users`/`groups` for approval context. Document `status`: 0 DRAFT, 1 FEEDBACKREQUIRED, 2 INREVISION, 3 AWAITINGAPPROVAL, 4 FINAL, 5 OBSOLETE.

Typical prompts:

- "Find the current approved onboarding SOP."
- "Which contracts are awaiting approval?"
- "Compare the draft with the final version."
- "Make document 812 final."

## Workflow

1. Search formal `documents` first for "official", "approved", "final" or "current".
2. Select by **status plus freshness** — a FINAL document outranks a newer OBSOLETE one and a draft note (R-018).
3. Retrieve binary/file content (`binfile`/`files`) before claiming its contents.
4. Keep `notes` (lightweight) and `documents` (formal) as separate sources; do not silently merge conflicting sources (surface the conflict, name the authoritative source).
5. For finalization/approval: fetch the exact ID + current status, show a preview and any naming conflict, require exact confirmation, `updateDocument` one ID, then re-read and report old/new status (R-005, R-006, R-011).

## Routing boundaries

- Note-centric retrieval/summarization → `zeyos-notes-and-sops`.
- Use this skill when status transitions, approval authority, version choice or formal files matter.

## Safety

- FINAL, APPROVED, OBSOLETE and cancellation transitions are high impact (R-011).
- Never approve on behalf of an unidentified user/group.
- Never bulk-finalize or bulk-obsolete documents (R-009).
- Never overwrite a binary file without an explicit target and confirmation.
- Preserve provenance and revision identifiers in summaries.
