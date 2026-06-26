# Data Quality and Governance Workflows

## Duplicate-account detection (deterministic scoring)

1. Pull the active population:

   ```bash
   zeyos list accounts --filter '{"type":1,"visibility":0}' \
     --fields ID,customernum,lastname,firstname --limit 10000 --json
   ```

2. Normalize comparison keys (lowercase, trim, collapse whitespace) but keep originals.
3. Score candidate pairs with a published, deterministic policy:

   | Evidence | Weight | Confidence |
   |---|---|---|
   | Exact `customernum` | 1.0 | high |
   | Exact normalized email (via `contacts`) | 0.9 | high |
   | Exact normalized name + address | 0.8 | high |
   | Near name only (edit distance) | 0.4 | low |

4. Sort pairs by score descending; emit `{accountA, accountB, score, reasons, confidence}`.
   A clearly different account is not a candidate. Shared generic email domains and similar
   names are never conclusive on their own.

## Completeness gaps (anti-join)

"Customers missing a billing address": list customers, list `addresses` of `type: 1`
(billing), keep customers with no matching `account`. `addresses` has **no** `visibility`
column — do not filter it. For scoped/prefix tasks, batch address lookup with
`account:[ids]`; do not loop one account at a time. Use:

```bash
zeyos list accounts --filter '{"type":1,"visibility":0,"lastname":{"~~*":"<prefix>%"}}' --fields ID,lastname --limit 1000 --json
zeyos list addresses --filter '{"account":[<accountIds>],"type":[0,1]}' --fields ID,account,type --limit 1000 --json
```

State whether you treat empty string, null and missing the same (R-020); by default they
are distinct.

## Remediation is a preview, not an action

A "clean up duplicates" request returns:

```json
{ "executed": false,
  "candidates": [ { "accountA": 1, "accountB": 2 } ],
  "proposedActions": [ { "accountId": 2, "action": "archive (needs human review)" } ] }
```

Never delete, archive or merge from this analysis (R-009, R-011, R-023). Each action is a
human decision on an exact ID. Re-query only after an approved, bounded change.

## Common failure modes

- Treating a fuzzy name match as a confirmed duplicate.
- Collapsing null / empty / zero into one bucket without saying so.
- Executing a bulk archive/delete from a "clean up" instruction.
- Filtering `visibility` on `addresses` (no such column → HTTP 400).
