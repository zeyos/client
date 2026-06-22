---
type: Playbook
title: Revenue This Year
description: "Answer \"what have we invoiced/collected this year?\" end to end."
tags: [billing]
---

1. Decide invoiced revenue vs cash received. If unspecified, state you are using invoiced net revenue ([invoiced-net-revenue](/metrics/invoiced-net-revenue.md)).
2. Normalize the window to Unix **seconds** (e.g. 2026-01-01 = 1767225600). See [dates-unix-seconds](/concepts/dates-unix-seconds.md).
3. `list` billing invoices ([transactions](/entities/transactions.md) `type = 3`) in the window with `netamount`; high `--limit`.
4. If net-after-credits, `list` `type = 4` and subtract.
5. Sum client-side and report the figure (do not describe the plan — run it).

```bash
zeyos list transactions \
  --filter '{"type":3,"date":{">=":1767225600,"<":1798761600}}' \
  --fields ID,transactionnum,date,netamount --limit 10000 --json \
  | python3 -c 'import sys,json; r=json.load(sys.stdin); print(sum(x.get("netamount",0) for x in r.get("data",r)))'
```
