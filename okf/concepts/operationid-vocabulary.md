---
type: Reference
title: operationId ≠ table noun
description: "REST operationIds are CamelCase compounds; several diverge from the dbref noun."
tags: [query]
---

The dbref table noun (also the REST URL path segment) is **not** the `@zeyos/client` operationId. Most follow `list<Plural>`/`get<Singular>`/… but several diverge:

- `dunning` → `listDunningNotices` / `getDunningNotice`
- `dunning2transactions` → `listDunningToTransactions`
- `pricelists` → `listPriceLists`; `pricelists2accounts` → `listPriceListsToAccounts`
- `mailinglists` → `listMailingLists`; `actionsteps` → `listActionSteps`
- `categories` → `listCategorys` (sic) but `getCategory`
- `davservers` → `listDAVServers`; `binfiles` → `listBinFiles` (list-only)

Each entity concept's **Operations** section lists its real operationIds (read straight from `api.json`). `client.schema.validate()` suggests the closest operationId for an unknown name.
