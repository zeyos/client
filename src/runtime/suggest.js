// Small, dependency-free fuzzy matcher used to turn "not found" failures into
// self-correcting, agent-friendly errors ("did you mean ...?").

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[n];
}

/**
 * Return the closest candidate to `name`, or null when nothing is close enough.
 * Case-insensitive. Prefers an exact case-insensitive match, then a substring
 * match, then the smallest edit distance within a length-scaled threshold.
 *
 * @param {string} name
 * @param {Iterable<string>} candidates
 * @returns {string|null}
 */
export function suggestClosest(name, candidates) {
  if (typeof name !== 'string' || !name) return null;
  const list = Array.from(candidates);
  const lowerName = name.toLowerCase();

  let exact = null;
  let substring = null;
  let best = null;
  let bestDistance = Infinity;

  for (const candidate of list) {
    if (typeof candidate !== 'string' || !candidate) continue;
    const lower = candidate.toLowerCase();

    if (lower === lowerName) {
      exact = candidate;
      break;
    }
    if (!substring && (lower.includes(lowerName) || lowerName.includes(lower))) {
      substring = candidate;
    }

    const distance = levenshtein(lowerName, lower);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (exact) return exact;
  if (substring) return substring;

  // Accept the nearest match only when the edit distance is small relative to
  // the name length, so unrelated names don't produce misleading suggestions.
  const threshold = Math.max(2, Math.floor(name.length / 3));
  return bestDistance <= threshold ? best : null;
}
