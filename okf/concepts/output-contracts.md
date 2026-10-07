---
type: Reference
title: Output Contracts
description: "Produce the requested parseable result, including actual files for file-mode contracts."
tags: [query, agents]
---

Honor the caller's result format and schema. Preserve stable keys, requested column order, a declared null representation, and the distinction between zero, empty and missing values. Report incomplete paging rather than implying a complete result.

In the agent protocol, use `RESULT: <value>` for a scalar or small inline JSON result, or `RESULT_BEGIN <format>` followed by the payload and `RESULT_END` for a multiline block. For file mode, write the actual file inside the attempt workspace first, then emit `RESULT_FILE: <workspace-relative-path>`. A filename on a `RESULT:` line is not a file result.

- JSON must parse as JSON; YAML must match the declared schema.
- CSV needs the requested stable header and correctly quoted fields.
- NDJSON contains one JSON object per nonempty line, without fences or commentary.
- File paths are workspace-relative, never absolute or escaping with `..`.

MCP tools provide an `outputSchema` and an object-valued `structuredContent`: success is `{ok: true, data: ...}`; a tool failure is `{ok: false, error: {code, message, actions?}}` with `isError: true`. The existing text payload remains available for older hosts. A deprecated MCP `filter` alias adds a warning; use canonical `filters` for new calls.

See [null-empty-missing](/concepts/null-empty-missing.md) and [counting-and-sums](/concepts/counting-and-sums.md).
