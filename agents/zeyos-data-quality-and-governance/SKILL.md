---
name: zeyos-data-quality-and-governance
description: Detect duplicate accounts, completeness gaps, stale data and schema hygiene issues in ZeyOS, and produce safe, explainable remediation previews. Use for "find duplicate customer accounts", "which customers are missing billing addresses", "show stale contacts with no email", "clean up duplicate records", "which custom fields are unused". Read-only by default — detection is separate from remediation, which requires a human decision per record.
---

# ZeyOS Data Quality and Governance

Read [../shared/zeyos-agent-operating-guide.md](../shared/zeyos-agent-operating-guide.md) and [../shared/zeyos-query-patterns.md](../shared/zeyos-query-patterns.md) first. See the OKF `playbooks/duplicate-account-review` playbook and `concepts/null-empty-missing` concept.

> **Detection is not remediation.** Find and explain; never bulk-merge, archive or delete
> from a fuzzy match. Each fix is a human decision on a named ID.

Primary entities (cross-domain): `accounts`, `contacts`, `addresses`, `users`, `customfields`, `objects`, plus the domain records the user names.

Typical prompts:

- "Find duplicate customer accounts."
- "Which customers are missing billing addresses?"
- "Show stale contacts with no email."
- "Clean up duplicate records." (→ becomes a preview, not an action)
- "Which custom fields are unused or inconsistent?"

## Workflow

1. Define the population and the active/archived scope (R-012).
2. Normalize comparison fields (lowercase, trim) **without losing the original values** (R-020).
3. Generate candidate pairs from deterministic evidence and **score + explain** each:
   - exact customer number → strong
   - exact normalized email (incl. via `contacts`) → strong
   - exact normalized name/address → strong
   - near/fuzzy name only → weak (low confidence)
4. Sort candidates by score descending; label confidence high/medium/low.
5. Keep detection separate from remediation. For a "clean up" request, return a bounded
   preview: exact IDs + proposed per-ID action, and request a human decision (R-009, R-023).
6. Re-query after any approved, bounded remediation.

## Safety

- Read-only by default.
- No automated merge until ZeyOS exposes a documented, reversible merge operation.
- Never bulk archive/delete from fuzzy matching (R-009, R-011).
- Never treat a shared generic email domain or similar name as conclusive.
- Preserve source IDs and explain confidence (R-020).
