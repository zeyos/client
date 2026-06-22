# Concepts

* [Common enums](enums.md) - Priority and ticket status enum values.
* [Counting and summing](counting-and-sums.md) - Count server-side; there is no server-side SUM.
* [Dates are Unix seconds](dates-unix-seconds.md) - All ZeyOS timestamps are Unix seconds; pick the indexed date field.
* [filters vs filter (the FK/GIN footgun)](filters-vs-filter.md) - Use `filters` (plural) so foreign-key fields match via their GIN/partial indexes.
* [operationId ≠ table noun](operationid-vocabulary.md) - REST operationIds are CamelCase compounds; several diverge from the dbref noun.
* [visibility: 0 (only where the column exists)](visibility-column.md) - visibility:0 hides archived rows — but only resources that have the column.
