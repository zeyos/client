# Producing & Consuming OKF

## CLI

```bash
zeyos okf list                 # list concepts (type, id, title); --json for automation
zeyos okf show tickets         # print a concept (bare resource name or entities/tickets)
zeyos okf check                # validate the bundle for OKF v0.1 conformance (exit non-zero on error)
zeyos okf export --out ./okf   # copy the shipped bundle into a directory
zeyos okf build  --out ./okf   # synthesize a bundle from the client's schema
```

`export` copies the rich shipped bundle (with curated metrics/playbooks/notes). `build`
synthesizes a structural bundle from the client's introspection surface — useful where the
shipped files aren't present, or to diff against a live instance.

## JavaScript client

The OKF surface is exported from `@zeyos/client`:

```js
import { buildOkf, loadOkfBundle, validateOkfBundle, validateOkfFiles, OKF_VERSION } from '@zeyos/client';

// Synthesize a conformant bundle from the client's generated schema (pure; browser-safe).
const files = buildOkf();                       // { 'entities/tickets.md': '…', … }
const { valid, errors } = validateOkfFiles(files);

// Load the shipped (or any) bundle from disk (Node only).
const bundle = await loadOkfBundle('node_modules/@zeyos/client/okf');
bundle.version;                                 // '0.1'
bundle.concepts['entities/tickets'].frontmatter // { type: 'ZeyOS Entity', title: 'Tickets', … }

// Validate a directory or an in-memory file map.
await validateOkfBundle('okf');
```

- `buildOkf({ schema?, services? })` — pure producer; defaults to the generated `SCHEMA`/`SERVICES`.
- `loadOkfBundle(dir)` — Node-only reader (lazy `fs`), returns `{ version, files, concepts }`.
- `validateOkfBundle(dirOrFiles)` / `validateOkfFiles(files)` — v0.1 conformance check.

## Build-time producer

In this repo, `npm run okf:build` (or `npm run generate`, which runs it alongside the client
codegen) emits the rich bundle from `openapi/{api,dbref}.json` plus the curated content in
`scripts/data/okf-curation.mjs`. It also injects the generated operationId table into
`agents/shared/zeyos-entity-reference.md`. Validate with `npm run okf:check`.
