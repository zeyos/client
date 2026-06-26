/**
 * Result parsing for scenario v2 output contracts (spec §7.3).
 *
 * The agent communicates its answer through markers in stdout:
 *
 *   RESULT: 42                      inline scalar  (count/sum)
 *   RESULT: {"a":1}                 inline JSON/YAML (small structured answers)
 *   RESULT_BEGIN json … RESULT_END  multiline block (JSON/YAML/Markdown)
 *   RESULT_FILE: out/report.csv     a file in the attempt workspace (CSV/NDJSON/large)
 *
 * This module extracts the marker, then parses the payload into a JS value according to
 * the declared `format`. It is dependency-free: JSON via the platform, and small hand-
 * written parsers for YAML (1.2 core scalars — `yes`/`00123` stay strings), CSV and NDJSON.
 * Result *files* are read only from inside the isolated attempt workspace, with path-
 * traversal rejection and size/line caps, so a scenario can never make the harness read
 * an arbitrary host file.
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { isUnsafeResultPath } from './scenario-schema.mjs';

const MAX_RESULT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_RESULT_FILE_LINES = 100000;

export function cleanInlineResult(raw) {
  let value = String(raw ?? '').trim();
  value = value.replace(/^`+/, '').replace(/`+$/, '').trim();
  for (const marker of ['**', '__']) {
    if (value.startsWith(marker) && value.endsWith(marker) && value.length >= marker.length * 2) {
      value = value.slice(marker.length, -marker.length).trim();
    } else if (value.endsWith(marker)) {
      value = value.slice(0, -marker.length).trim();
    }
  }
  return value;
}

/**
 * Find the result the agent emitted, preferring (last) block, then file, then inline.
 * Returns `{ mode, format, raw, filePath }` or null when no marker is present.
 * `format` is a best-effort hint from the block tag; the caller's declared contract wins.
 */
export function parseResultMarkers(stdout) {
  const text = String(stdout || '');

  // Block form: RESULT_BEGIN [format] \n …payload… \n RESULT_END  (take the last one)
  const blockRe = /RESULT_BEGIN[ \t]*([A-Za-z]*)[ \t]*\r?\n([\s\S]*?)\r?\nRESULT_END/g;
  let blockMatch = null;
  let m;
  while ((m = blockRe.exec(text)) !== null) blockMatch = m;
  if (blockMatch) {
    return { mode: 'block', format: (blockMatch[1] || '').toLowerCase() || null, raw: blockMatch[2], filePath: null };
  }

  // File form: RESULT_FILE: relative/path  (last one)
  const fileRe = /RESULT_FILE:[ \t]*([^\n\r]+)/g;
  let fileMatch = null;
  while ((m = fileRe.exec(text)) !== null) fileMatch = m;
  if (fileMatch) {
    return { mode: 'file', format: null, raw: null, filePath: fileMatch[1].trim().replace(/^`+/, '').replace(/`+$/, '').trim() };
  }

  // Inline form: RESULT: <value>  (last one) — mirrors verify.mjs parseResultLine
  const inlineRe = /RESULT:[ \t]*([^\n\r]*)/g;
  let inlineRaw = null;
  while ((m = inlineRe.exec(text)) !== null) inlineRaw = m[1].trim();
  if (inlineRaw != null) {
    inlineRaw = cleanInlineResult(inlineRaw);
    return { mode: 'inline', format: null, raw: inlineRaw, filePath: null };
  }
  return null;
}

/** Coerce a scalar marker into number/boolean/null/string (JSON-ish, conservative). */
export function coerceScalar(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (t === '') return '';
  if (/^[-+]?\d+(\.\d+)?$/.test(t) && !/^[-+]?0\d/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^[[{]/.test(t)) {
    try { return JSON.parse(t); } catch { /* fall through to string */ }
  }
  return t;
}

// ── YAML (minimal, 1.2 core scalars) ──────────────────────────────────────────

/** Type a bare YAML scalar. 1.2 core: only true/false are booleans; `yes`/`00123` stay strings. */
function yamlScalar(token) {
  const t = token.trim();
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  const q = t.match(/^'(.*)'$/) || t.match(/^"(.*)"$/);
  if (q) return q[1];
  // integers/floats — but a leading zero (00123) or leading-zero-after-sign means string
  if (/^[-+]?\d+$/.test(t) && !/^[-+]?0\d/.test(t)) return Number(t);
  if (/^[-+]?\d*\.\d+$/.test(t)) return Number(t);
  return t;
}

function parseFlow(str) {
  // Tiny JSON-compatible flow parser for {a: 1, b: [x, y]} / [1, 2, 3].
  // YAML flow is close enough to JSON for our contracts once keys/strings are quoted;
  // we first try JSON, then a lenient fallback that quotes bare words.
  try { return JSON.parse(str); } catch { /* lenient */ }
  const jsonish = str
    .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'/g, '"');
  try { return JSON.parse(jsonish); } catch { return str; }
}

export function parseYaml(input) {
  const lines = String(input).split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
  let idx = 0;

  function indentOf(line) { return line.match(/^ */)[0].length; }

  function parseBlock(minIndent) {
    // Determine whether this block is a sequence or mapping by its first line.
    if (idx >= lines.length) return null;
    const first = lines[idx];
    const ind = indentOf(first);
    if (ind < minIndent) return null;
    const isSeq = /^\s*-\s/.test(first) || /^\s*-\s*$/.test(first);
    return isSeq ? parseSeq(ind) : parseMap(ind);
  }

  function parseSeq(indent) {
    const arr = [];
    while (idx < lines.length) {
      const line = lines[idx];
      if (indentOf(line) !== indent || !/^\s*-/.test(line)) break;
      const rest = line.slice(indent + 1).replace(/^\s/, '');
      idx += 1;
      if (rest === '') {
        arr.push(parseBlock(indent + 1));
      } else if (/^[[{]/.test(rest)) {
        arr.push(parseFlow(rest));
      } else if (/^[\w"'-]+\s*:(\s|$)/.test(rest)) {
        // inline map start "- key: value" — reinterpret by splicing the key line back
        lines[--idx] = ' '.repeat(indent + 2) + rest;
        arr.push(parseMap(indent + 2));
      } else {
        arr.push(yamlScalar(rest));
      }
    }
    return arr;
  }

  function parseMap(indent) {
    const obj = {};
    while (idx < lines.length) {
      const line = lines[idx];
      if (indentOf(line) !== indent || /^\s*-/.test(line)) break;
      const mm = line.slice(indent).match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (!mm) break;
      idx += 1;
      const key = yamlScalar(mm[1]);
      const valRaw = mm[2];
      if (valRaw === '') {
        obj[key] = parseBlock(indent + 1);
      } else if (/^[[{]/.test(valRaw)) {
        obj[key] = parseFlow(valRaw);
      } else {
        obj[key] = yamlScalar(valRaw);
      }
    }
    return obj;
  }

  if (lines.length === 0) return null;
  if (/^[[{]/.test(lines[0].trim())) return parseFlow(lines.join('\n'));
  return parseBlock(0);
}

// ── CSV / NDJSON ──────────────────────────────────────────────────────────────

/** Parse a CSV string into an array of row objects keyed by the header row. */
export function parseCsv(input, { delimiter = ',' } = {}) {
  const rows = parseCsvRows(input, delimiter);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
}

/** Low-level CSV → string[][] honoring quotes, escaped quotes and embedded newlines. */
export function parseCsvRows(input, delimiter = ',') {
  const out = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); out.push(row); row = []; field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); out.push(row); }
  return out.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parse NDJSON (one JSON value per non-empty line) into an array. */
export function parseNdjson(input) {
  return String(input)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l, i) => {
      try { return JSON.parse(l); } catch (err) { throw new Error(`NDJSON parse error on line ${i + 1}: ${err.message}`); }
    });
}

// ── File reading (sandboxed to the attempt workspace) ─────────────────────────

/**
 * Read a result file strictly from within `workspaceDir`. Rejects absolute paths, `..`
 * traversal, paths that resolve outside the workspace, and files over the size/line caps.
 */
export function readResultFile(relPath, workspaceDir) {
  if (isUnsafeResultPath(relPath)) throw new Error(`unsafe result file path: ${relPath}`);
  if (!workspaceDir) throw new Error('no workspace directory configured for result files');
  const resolved = path.resolve(workspaceDir, relPath);
  const root = path.resolve(workspaceDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`result file escapes the workspace: ${relPath}`);
  }
  const st = statSync(resolved);
  if (st.size > MAX_RESULT_FILE_BYTES) throw new Error(`result file too large (${st.size} > ${MAX_RESULT_FILE_BYTES} bytes)`);
  const content = readFileSync(resolved, 'utf8');
  const lineCount = content.split('\n').length;
  if (lineCount > MAX_RESULT_FILE_LINES) throw new Error(`result file has too many lines (${lineCount} > ${MAX_RESULT_FILE_LINES})`);
  return content;
}

/** Parse a payload string into a JS value per `format`. */
export function parseByFormat(raw, format, opts = {}) {
  switch ((format || 'scalar').toLowerCase()) {
    case 'json': return JSON.parse(raw);
    case 'yaml': return parseYaml(raw);
    case 'csv': return parseCsv(raw, opts);
    case 'ndjson': return parseNdjson(raw);
    case 'markdown':
    case 'text': return String(raw);
    case 'scalar':
    default: return coerceScalar(raw);
  }
}

/**
 * Resolve an agent's emitted result into a JS value, honoring the scenario's declared
 * result contract. `contract` is the turn's `result` block ({mode, format, path}).
 * Returns `{ value, mode, format, raw }` or `{ value: null, error }` on failure.
 */
export function resolveResult(stdout, contract = {}, { workspaceDir } = {}) {
  const markers = parseResultMarkers(stdout);
  if (!markers) return { value: null, mode: null, format: null, raw: null, error: 'no RESULT marker found' };

  const format = contract.format || markers.format || 'scalar';
  try {
    if (markers.mode === 'file') {
      const content = readResultFile(markers.filePath, workspaceDir);
      return { value: parseByFormat(content, format, contract), mode: 'file', format, raw: content, filePath: markers.filePath };
    }
    return { value: parseByFormat(markers.raw, format, contract), mode: markers.mode, format, raw: markers.raw };
  } catch (err) {
    return { value: null, mode: markers.mode, format, raw: markers.raw, error: err.message || String(err) };
  }
}
