# OKF Overview

The **Open Knowledge Format (OKF v0.1)** is Google's minimal, vendor-neutral spec for
sharing the metadata and curated context that surrounds data: a directory of Markdown
files, each with YAML frontmatter whose only required field is `type`, optional `index.md`
and `log.md`, and Markdown cross-links that turn the directory into a knowledge graph.
Producers emit a bundle; consumers (coding agents, viewers, search) read it.

`@zeyos/client` ships a conformant OKF bundle under [`okf/`](https://github.com/zeyos/client/tree/main/okf)
that describes the ZeyOS data model, and tooling to produce, consume, validate, and refine it.

## Why OKF fits ZeyOS

The client already derives a compact schema from the OpenAPI/dbref specs. OKF turns that —
plus the curated business knowledge that used to live only in the skill pack — into a
portable knowledge layer any agent or tool can read, independent of this client.

The bundle is **canonical** for ZeyOS structural facts: the hand-maintained
`agents/shared/zeyos-entity-reference.md` operationId table is now generated from the same
source, so the skills and the OKF bundle can't drift apart.

## Bundle layout

```
okf/
  index.md                  # root listing; frontmatter: okf_version, source_snapshot
  log.md                    # schema-change history (auto-appended on real changes)
  entities/                 # one concept per API-backed entity — type: ZeyOS Entity
    index.md
    accounts.md  tickets.md  transactions.md  …
  metrics/                  # business metric definitions — type: Metric
  playbooks/                # step-by-step query workflows — type: Playbook
  concepts/                 # cross-cutting rules / footguns — type: Reference
```

Each entity concept carries a **Schema** table (column, type, nullability, default, index,
foreign key), **Foreign Keys** (cross-linked to the target entity), **Enums** (parsed from
the schema), **Indexes** (including the GIN/partial indexes behind the `filters` footgun),
and **Operations** (the real `@zeyos/client` operationIds, read straight from `api.json`).

## Generated vs curated: managed blocks

Each entity concept mixes auto-generated structure with curated prose. The generated region
is fenced by HTML-comment markers:

```markdown
<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema
…
<!-- okf:generated:end -->

# Notes
Curated guidance — preserved across every regeneration.
```

The producer rewrites **only** the region between the markers. Curated `# Notes`/`# Metrics`
prose (added by a human or the refinement loop) is preserved verbatim, so regenerating after
a schema change never clobbers curation. See [Keeping OKF fresh](./03-keeping-fresh.md).

## Relationship to the skill pack

Two projections of one knowledge core:

- **Skills** (`agents/`) stay the task/runner-facing layer: the operating contract, "act,
  don't plan", and safety.
- **OKF** (`okf/`) is the reference layer: the entity schema-of-record plus the metric,
  playbook, and concept catalog.

Skills point into `okf/`; when a schema fact in a shared reference and in `okf/` ever
disagree, `okf/` wins.
