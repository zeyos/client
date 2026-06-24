# Document and Approval Workflows

## Select the current official artifact

1. Query formal `documents` matching the topic; read `status`, `name`, `documentnum`, `filename`.

   ```bash
   zeyos list documents --filter '{"visibility":0,"name":{"~~*":"onboarding%"}}' \
     --fields ID,name,status,filename,documentnum --limit 100 --json
   ```

2. Rank by authority, not date: prefer `status = 4` (FINAL). A newer `status = 5`
   (OBSOLETE) does **not** win, and a draft `note` is only fallback context (R-018).
3. State the selection reason (which status, why it outranks the alternatives).

## Compare a note against a formal SOP

Retrieve the actual text of both (`notes.text`; `documents.description`/binary content).
Report agreements and conflicts explicitly; never synthesize a single answer that hides a
contradiction. The formal FINAL document is the authoritative source.

## Finalization / approval gate

```bash
# 1. Fetch exact target + current status
zeyos get document <id> --json
# 2. Preview the change (no write) and surface any same-name conflict
zeyos update document <id> --query --status 4
# 3. Only after explicit confirmation of the exact ID:
zeyos update document <id> --status 4
# 4. Re-read and report old/new status
zeyos get document <id> --fields ID,name,status --json
```

Update exactly one ID. Never fuzzy-match a name to a set of documents and finalize them in
bulk (R-009, R-011). Leave similarly-named documents untouched.

## Common failure modes

- Picking the newest artifact instead of the FINAL one.
- Claiming document contents without retrieving the file/binary.
- Bulk-finalizing by fuzzy name match.
- Approving without identifying the approver / authority.
