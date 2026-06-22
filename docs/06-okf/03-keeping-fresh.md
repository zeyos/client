# Keeping OKF Fresh

The OKF bundle is generated from the OpenAPI/dbref snapshots in `openapi/`. When ZeyOS
updates its database model or API, those specs are re-exported and the bundle is
regenerated. The design keeps that safe and observable.

## What protects curation

1. **Deterministic generation.** `npm run generate` runs the OKF producer alongside the
   client codegen. Re-running with unchanged specs produces **no diff** (no timestamp churn).
2. **Managed blocks.** Only the fenced `okf:generated` region of each entity concept is
   rewritten; curated `# Notes`/`# Metrics` prose is spliced back unchanged. See the
   [overview](./01-overview.md#generated-vs-curated-managed-blocks).
3. **`source_snapshot`.** The root `index.md` frontmatter carries a content hash of the
   schema. When the specs change, the hash changes — a staleness signal for consumers and
   the drift gate.
4. **`log.md` schema diff.** The producer diffs the new schema against the last snapshot and
   appends a dated entry (added/removed fields, changed enums, new foreign keys) — an
   OKF-native, human- and agent-readable record of *what changed when the model updated*.

## The spec-refresh runbook

```bash
# 1. Replace the snapshots with the newly exported specs
#    openapi/api.json, openapi/dbref.json

# 2. Regenerate the client and the OKF bundle
npm run generate

# 3. Review the diff and the changelog
git diff okf/ agents/shared/zeyos-entity-reference.md
cat okf/log.md          # newest dated entry summarizes the schema changes

# 4. Validate conformance + the drift gate
npm run okf:check

# 5. (Optional) enrich weak concepts — see ./04-loops.md
npm run okf:refine -- --concept entities/<changed-entity>

# 6. Commit
git add okf agents/shared src/generated && git commit -m "Refresh schema + OKF"
```

## The drift gate (CI)

`npm run okf:check` runs `test/okf.test.js`, which regenerates the bundle and asserts the
committed content matches a fresh regen. It fails the build when:

- the specs changed but `okf/` wasn't regenerated and committed;
- someone hand-edited a generated region;
- a concept is non-conformant, an API-backed entity lacks a concept, or a structural
  cross-link is broken;
- the shared reference's generated operationId table fell out of sync.
