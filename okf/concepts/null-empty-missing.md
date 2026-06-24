---
type: Reference
title: Null, empty and missing are distinct
description: "Do not silently equate missing fields, empty strings, zero and null."
tags: [query]
---

A missing field, an empty string, a literal zero and `null` are different facts. In data-quality and completeness work, state the normalization you apply (e.g. "trimmed lowercase; empty treated as missing") and keep the original values.

This matters most for anti-joins and duplicate detection, where conflating them changes the result.
