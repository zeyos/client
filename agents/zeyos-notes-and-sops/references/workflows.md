# Notes And SOP Workflows

## Resource Choice

Use `notes` when:

- the user wants text content to summarize
- the content is likely lightweight operational knowledge

Use `documents` when:

- the user wants the official or finalized SOP
- the artifact is file-like and may have filename or document number metadata

Use `files` when:

- the user asks for attachments
- you need to inspect what file objects are linked to a record or comment

## Pattern: Find The Current SOP

Use this for prompts like:

- "Find the current escalation SOP for billing disputes."
- "Which onboarding SOP is final right now?"

Recommended approach:

1. Search `documents` first with name- or filename-oriented filters plus final status where possible.
2. Search `notes` second if the SOP may live as text rather than a file artifact.
3. Prefer status `4` (`FINAL`) for both documents and notes when the user asks for the current or official process.
4. If multiple finals exist, sort by `lastmodified` and present the top candidates instead of guessing.

## Pattern: Summarize Internal Notes

Use this for prompts like:

- "Summarize the notes about the migration checklist."
- "What do our notes say about handling failed invoice syncs?"

Recommended approach:

1. Search `notes` by `name`, `assigneduser`, or broader text-oriented query terms.
2. Pull `text` only for the shortlisted notes.
3. Summarize common instructions, warnings, and unresolved items.

Important caveat:

- The documented note schema does not show direct account, project, or ticket foreign keys. Search may therefore be keyword-driven unless the instance stores those references in note names or text.

## Pattern: Retrieve A Formal File Or Attachment

Use this for prompts like:

- "Get me the attached SOP file."
- "Which files are attached to this record?"

Recommended approach:

1. Resolve the parent note, document, or record first.
2. Query `files` for attachments when the file inventory matters.
3. Escalate to `@zeyos/client` if you need binary expansion or file-body handling.

## Pattern: Compare Note Guidance Versus Formal SOP

Use this for prompts like:

- "Do our notes and the finalized SOP say the same thing?"
- "Is the current onboarding SOP aligned with the internal notes?"

Recommended approach:

1. Retrieve the likely final document candidate first.
2. Retrieve notes on the same topic second.
3. Compare:
   - procedural steps
   - warnings and exceptions
   - revision freshness
4. Report conflicts explicitly instead of merging them into one synthetic answer.

## Common Failure Modes

- Claiming document text content without fetching the underlying binary.
- Mixing drafts, revisions, and finals into one answer without saying so.
- Assuming notes and documents have the same linkage model.
