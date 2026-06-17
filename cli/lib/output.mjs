/**
 * Output formatters: pretty table, JSON, YAML.
 * ANSI colors are stripped when stdout is not a TTY or --no-color is set.
 *
 * All public functions write to stdout; errors write to stderr.
 */

/** @typedef {import('./types.mjs').JsonValue} JsonValue */
/** @typedef {import('./types.mjs').JsonObject} JsonObject */
/** @typedef {import('./types.mjs').ValueFormatter} ValueFormatter */

// ── Colors ────────────────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY && !process.argv.includes('--no-color') && !process.env.NO_COLOR;

const c = {
  bold:   s => USE_COLOR ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    s => USE_COLOR ? `\x1b[2m${s}\x1b[0m`  : s,
  green:  s => USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:   s => USE_COLOR ? `\x1b[36m${s}\x1b[0m` : s,
  gray:   s => USE_COLOR ? `\x1b[90m${s}\x1b[0m` : s, // bright-black: dim IDs / muted cells
};

export { c as colors };

// ── Output mode ───────────────────────────────────────────────────────────────

/** Determine output mode from parsed CLI values. */
export function outputMode(values) {
  if (values.json) return 'json';
  if (values.yaml) return 'yaml';
  return 'table';
}

// ── JSON ──────────────────────────────────────────────────────────────────────

export function printJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// ── Query (dry run) ─────────────────────────────────────────────────────────────

/**
 * Print a dry-run request descriptor (from `--query`): the resolved HTTP route
 * and the JSON payload that *would* be sent, without performing the request.
 *
 * @param {{method:string,url:string,body?:unknown,bodyType?:string}} descriptor
 * @param {Record<string, unknown>} [values] - parsed CLI flags (for --json/--yaml)
 */
export function printQuery(descriptor, values = {}) {
  if (values.json) { printJson(descriptor); return; }
  if (values.yaml) { printYaml(descriptor); return; }

  const { method, url, body, bodyType } = descriptor;
  process.stdout.write(`${c.bold(method)} ${url}\n`);
  if (bodyType) {
    const contentType = bodyType === 'form' ? 'application/x-www-form-urlencoded' : 'application/json';
    process.stdout.write(c.dim(`Content-Type: ${contentType}`) + '\n');
  }
  process.stdout.write('\n');
  if (body === undefined || body === null) {
    process.stdout.write(c.dim('(no request body)') + '\n');
  } else {
    process.stdout.write(JSON.stringify(body, null, 2) + '\n');
  }
}

// ── YAML ──────────────────────────────────────────────────────────────────────

export function printYaml(data) {
  process.stdout.write(toYaml(data).replace(/^\n/, '') + '\n');
}

function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') {
    if (value === '') return '""';
    if (value.includes('\n')) {
      const lines = value.split('\n').map(l => `${pad}  ${l}`);
      return `|\n${lines.join('\n')}`;
    }
    // Quote strings that contain YAML-special characters, leading/trailing whitespace,
    // look like numbers (would be parsed as number by YAML loaders), or are YAML 1.1
    // boolean / null keywords (true, false, null, yes, no, on, off and their variants).
    if (
      /[:#\[\]{}&*!,|>'"@`%]/.test(value) ||
      /^\s|\s$/.test(value) ||
      /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value) ||
      /^(true|false|null|yes|no|on|off|y|n)$/i.test(value)
    ) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map(item => {
      const rendered = toYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null) {
        // First key on same line as dash
        const inner = rendered.trimStart();
        return `\n${pad}- ${inner}`;
      }
      return `\n${pad}- ${rendered}`;
    }).join('');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return entries.map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0) {
        return `\n${pad}${k}:\n${pad}  ${toYaml(v, indent + 1).trimStart()}`;
      }
      const rendered = toYaml(v, indent + 1);
      if (typeof v === 'object' && v !== null) {
        return `\n${pad}${k}:${rendered}`;
      }
      return `\n${pad}${k}: ${rendered}`;
    }).join('');
  }
  return String(value);
}

// ── Table ─────────────────────────────────────────────────────────────────────

/**
 * Print a list of objects as a plain-text table.
 *
 * @param {JsonObject[]} rows
 * @param {string[]} columns  - ordered list of keys to display
 * @param {Record<string,string>} [labels] - optional column header overrides
 * @param {Record<string,ValueFormatter>} [formatters] - optional per-key formatters
 */
export function printTable(rows, columns, labels = {}, formatters = {}) {
  if (rows.length === 0) {
    process.stdout.write(c.dim('  (no records)\n'));
    return;
  }

  const headers = columns.map(k => labels[k] ?? k.toUpperCase());

  const stringify = (key, val, row) => {
    if (formatters[key]) return String(formatters[key](val, row));
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const data = rows.map(row => columns.map(k => stringify(k, row[k], row)));

  const widths = columns.map((_, i) =>
    Math.max(headers[i].length, ...data.map(row => _visibleLength(row[i])))
  );

  // QW-2: detect numeric columns (every non-empty cell is a plain number,
  // ignoring ANSI) so we can right-align them — header included.
  const numeric = columns.map((_, i) => {
    let sawValue = false;
    for (const row of data) {
      const plain = row[i].replace(/\x1b\[[0-9;]*m/g, '');
      if (plain === '' || plain === '—') continue; // blank / em-dash placeholder
      sawValue = true;
      if (!/^-?\d+(\.\d+)?$/.test(plain)) return false;
    }
    return sawValue;
  });

  // QW-1: when stdout is a TTY, shrink the widest column(s) until the row fits
  // the terminal. Non-TTY (piped) output stays full-width so `| grep`/`| awk`
  // see complete cell text. Budget = columns − 2 leading spaces − 2 per gutter.
  if (process.stdout.isTTY) {
    const term = process.stdout.columns;
    if (term && term > 0) {
      const MIN_COL = 8;
      const gutters = (widths.length - 1) * 2;
      const budget = term - 2 - gutters;
      // Repeatedly trim the single widest column above the floor until it fits.
      let total = widths.reduce((a, b) => a + b, 0);
      while (total > budget) {
        let widest = -1;
        for (let i = 0; i < widths.length; i++) {
          if (widths[i] > MIN_COL && (widest === -1 || widths[i] > widths[widest])) widest = i;
        }
        if (widest === -1) break; // every column already at the floor
        widths[widest]--;
        total--;
      }
    }
  }

  const align = (str, i) => (numeric[i] ? _padLeft(str, widths[i]) : _pad(_truncate(str, widths[i]), widths[i]));

  const headerRow = headers.map((h, i) =>
    numeric[i] ? _padLeft(c.bold(h), widths[i]) : _pad(_truncate(c.bold(h), widths[i]), widths[i])
  ).join('  ');
  const separator = widths.map(w => '─'.repeat(w)).join('  ');

  process.stdout.write('\n');
  process.stdout.write('  ' + headerRow + '\n');
  process.stdout.write('  ' + c.dim(separator) + '\n');
  for (const row of data) {
    process.stdout.write('  ' + row.map((v, i) => align(v, i)).join('  ') + '\n');
  }
  process.stdout.write('\n');
}

/**
 * Print a single record as a vertical key-value list.
 *
 * @param {JsonObject} record
 * @param {string[]} [keys]  - subset of keys to show (default: all)
 * @param {Record<string,string>} [labels]
 * @param {Record<string,ValueFormatter>} [formatters]
 */
export function printRecord(record, keys, labels = {}, formatters = {}) {
  const keyList = keys ?? Object.keys(record);
  const maxLabel = Math.max(...keyList.map(k => (labels[k] ?? k).length));

  process.stdout.write('\n');
  for (const key of keyList) {
    const val = record[key];
    if (val === undefined) continue;

    const label = _pad(labels[key] ?? key, maxLabel);
    let display;

    if (formatters[key]) {
      display = String(formatters[key](val, record));
    } else if (val === null || val === '') {
      // QW-6: render null AND empty string as a dim em-dash, not a blank gap.
      display = c.dim('—');
    } else if (Array.isArray(val)) {
      // QW-6: empty array → dim em-dash; otherwise compact JSON.
      display = val.length === 0 ? c.dim('—') : JSON.stringify(val);
    } else if (typeof val === 'object') {
      // QW-6: empty object → dim em-dash; otherwise compact JSON.
      display = Object.keys(val).length === 0 ? c.dim('—') : JSON.stringify(val);
    } else {
      display = String(val);
    }

    // Handle multi-line display values: indent continuation lines
    // so they align with the first line (after the label column).
    if (display.includes('\n')) {
      const indent = ' '.repeat(maxLabel + 4); // "  label  " padding
      const lines = display.split('\n');
      process.stdout.write(`  ${c.dim(label)}  ${lines[0]}\n`);
      for (let li = 1; li < lines.length; li++) {
        process.stdout.write(`${indent}${lines[li]}\n`);
      }
    } else {
      process.stdout.write(`  ${c.dim(label)}  ${display}\n`);
    }
  }
  process.stdout.write('\n');
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function success(msg) {
  process.stderr.write(c.green('✓') + ' ' + msg + '\n');
}

export function warn(msg) {
  process.stderr.write(c.yellow('⚠') + ' ' + msg + '\n');
}

export function error(msg) {
  process.stderr.write(c.red('✗') + ' ' + msg + '\n');
}

export function info(msg) {
  process.stderr.write(c.dim('·') + ' ' + msg + '\n');
}

// ── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format a Unix timestamp (seconds) to a date string.
 * Supports tokens: YYYY, MM, DD, HH, mm, ss.
 * Returns '' for null/undefined/0 values.
 *
 * @param {number|string|null|undefined} timestamp - Unix timestamp in seconds
 * @param {string} format - e.g. 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm'
 * @returns {string}
 */
export function formatDate(timestamp, format = 'YYYY-MM-DD') {
  if (timestamp == null || timestamp === 0 || timestamp === '') return '';
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return String(timestamp);
  const d = new Date(n * 1000);
  if (isNaN(d.getTime())) return String(timestamp);
  return format
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD',   String(d.getDate()).padStart(2, '0'))
    .replace('HH',   String(d.getHours()).padStart(2, '0'))
    .replace('mm',   String(d.getMinutes()).padStart(2, '0'))
    .replace('ss',   String(d.getSeconds()).padStart(2, '0'));
}

/** Well-known date field names in ZeyOS. */
const DATE_FIELDS = new Set([
  'duedate', 'lastmodified', 'creationdate', 'created',
  'date', 'startdate', 'enddate',
]);

/**
 * Check whether a field name represents a date.
 * @param {string} name
 * @returns {boolean}
 */
export function isDateField(name) {
  const lower = name.toLowerCase();
  return DATE_FIELDS.has(lower) || lower.endsWith('date') || lower.endsWith('modified');
}

/**
 * Build a formatters object for known date fields.
 * For list views where alias names differ from API paths, pass the
 * aliasToPath map so date detection works on the API path.
 *
 * @param {string[]} columns - display column keys
 * @param {string}   dateFormat - format string (default 'YYYY-MM-DD')
 * @param {Record<string,string>} [aliasToPath] - alias → API field path
 * @returns {Record<string, ValueFormatter>}
 */
export function buildDateFormatters(columns, dateFormat = 'YYYY-MM-DD', aliasToPath) {
  const formatters = {};
  for (const col of columns) {
    const fieldPath = aliasToPath?.[col] ?? col;
    const leaf = fieldPath.includes('.') ? fieldPath.split('.').pop() : fieldPath;
    if (isDateField(leaf)) {
      formatters[col] = (val) => formatDate(val, dateFormat);
    }
  }
  return formatters;
}

// ── Semantic enum / ID coloring (QW-3) ─────────────────────────────────────────

/**
 * Pick a colorizer for an enum LABEL by keyword.
 *
 * Enum codes are resource-specific (ticket status 1 = AWAITINGACCEPTANCE but
 * transaction status 1 = COMPLETED), so color is derived from the label text —
 * never from the numeric code. Returns `null` when no keyword matches, so the
 * caller renders the value plain rather than guessing.
 *
 * @param {string} label
 * @returns {((s:string)=>string)|null}
 */
function _enumColorForLabel(label) {
  const L = String(label).toUpperCase();
  // Positive / terminal-success states → green.
  if (/COMPLETED|BOOKED|ACTIVE|DONE|ACCEPTED|PAID/.test(L)) return c.green;
  // Failure / negative states → red.
  if (/CANCELLED|CANCELED|FAILED|REJECTED|DELETED|OVERDUE/.test(L)) return c.red;
  // Priority extremes.
  if (/HIGHEST|HIGH/.test(L)) return c.red;
  if (/LOWEST|LOW/.test(L)) return c.dim;
  return null;
}

/** A field name that denotes a record identifier / foreign key → render dim. */
function _isIdField(name) {
  const lower = String(name).toLowerCase();
  return lower === 'id' || lower.endsWith('id');
}

/**
 * Build value formatters that colorize enum + ID columns, schema-driven.
 *
 * For each display column, the API field path (via `aliasToPath`) is reduced to
 * its leaf column name and looked up in `fieldDefs` (a resource's
 * `schema.describe(resource).fields` map). Columns whose field has an `enum` are
 * colored by label keyword; ID/FK columns are dimmed. Columns with no resolvable
 * enum label are left plain. No-ops entirely when color is disabled.
 *
 * @param {string[]} columns - display column keys
 * @param {Record<string, {enum?:Record<string,string>, fk?:string}>} [fieldDefs]
 * @param {Record<string,string>} [aliasToPath] - alias → API field path
 * @returns {Record<string, ValueFormatter>}
 */
export function buildEnumFormatters(columns, fieldDefs = {}, aliasToPath) {
  const formatters = {};
  if (!USE_COLOR) return formatters; // color-gated: nothing to do when plain.

  for (const col of columns) {
    const fieldPath = aliasToPath?.[col] ?? col;
    // Dot-notation joins (contact.city) can't be mapped to a base column reliably.
    if (fieldPath.includes('.')) continue;
    const def = fieldDefs[fieldPath];

    if (def?.enum) {
      const enumMap = def.enum;
      formatters[col] = (val) => {
        if (val == null || val === '') return c.dim('—');
        const label = enumMap[String(val)];
        if (label == null) return String(val); // unknown code → plain, never guess
        const paint = _enumColorForLabel(label);
        return paint ? paint(String(val)) : String(val);
      };
    } else if (_isIdField(fieldPath) || def?.fk) {
      formatters[col] = (val) => (val == null || val === '' ? c.dim('—') : c.gray(String(val)));
    }
  }
  return formatters;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** String length ignoring ANSI escape codes. */
function _visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string to a visible width, accounting for ANSI escape codes. */
function _pad(str, len) {
  const visible = _visibleLength(str);
  if (visible >= len) return str;
  return str + ' '.repeat(len - visible);
}

/** Left-pad a string to a visible width (right-align), ANSI-aware. */
function _padLeft(str, len) {
  const visible = _visibleLength(str);
  if (visible >= len) return str;
  return ' '.repeat(len - visible) + str;
}

/**
 * Truncate a string to a max visible width, appending '…', ANSI-aware.
 * Preserves any trailing reset so colored cells don't bleed. Strings already
 * within the budget are returned untouched.
 *
 * @param {string} str
 * @param {number} max - max visible width (including the ellipsis)
 * @returns {string}
 */
function _truncate(str, max) {
  if (max <= 0) return '';
  if (_visibleLength(str) <= max) return str;

  // Walk the string copying characters, skipping over ANSI sequences (which
  // have zero visible width), until we've kept (max - 1) visible chars; then
  // append the ellipsis and any trailing reset.
  const keep = max - 1;
  let out = '';
  let visible = 0;
  let i = 0;
  let hadColor = false;
  while (i < str.length && visible < keep) {
    const ansi = str.slice(i).match(/^\x1b\[[0-9;]*m/);
    if (ansi) {
      out += ansi[0];
      hadColor = true;
      i += ansi[0].length;
      continue;
    }
    out += str[i];
    visible++;
    i++;
  }
  out += '…';
  // Re-apply a reset if the original was colored so the ellipsis/padding stay clean.
  if (hadColor) out += '\x1b[0m';
  return out;
}
