/**
 * Output formatters: pretty table, JSON, YAML.
 * ANSI colors are stripped when stdout is not a TTY or --no-color is set.
 *
 * All public functions write to stdout; errors write to stderr.
 */

// ── Colors ────────────────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY && !process.argv.includes('--no-color') && !process.env.NO_COLOR;

const c = {
  bold:   s => USE_COLOR ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    s => USE_COLOR ? `\x1b[2m${s}\x1b[0m`  : s,
  green:  s => USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:   s => USE_COLOR ? `\x1b[36m${s}\x1b[0m` : s,
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
    if (/[:#\[\]{}&*!,|>'"@`%]/.test(value) || /^\s|\s$/.test(value)) {
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
 * @param {object[]} rows
 * @param {string[]} columns  - ordered list of keys to display
 * @param {Record<string,string>} [labels] - optional column header overrides
 * @param {Record<string,(v:any,row:object)=>string>} [formatters] - optional per-key formatters
 */
export function printTable(rows, columns, labels = {}, formatters = {}) {
  if (rows.length === 0) {
    process.stdout.write(c.dim('  (no records)\n'));
    return;
  }

  // Build header labels
  const headers = columns.map(k => labels[k] ?? k.toUpperCase());

  // Stringify all cell values
  const stringify = (key, val, row) => {
    if (formatters[key]) return String(formatters[key](val, row));
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const data = rows.map(row => columns.map(k => stringify(k, row[k], row)));

  // Compute column widths
  const widths = columns.map((_, i) =>
    Math.max(headers[i].length, ...data.map(row => _visibleLength(row[i])))
  );

  // Header line
  const headerRow = headers.map((h, i) => _pad(c.bold(h), widths[i])).join('  ');
  const separator = widths.map(w => '─'.repeat(w)).join('  ');

  process.stdout.write('\n');
  process.stdout.write('  ' + headerRow + '\n');
  process.stdout.write('  ' + c.dim(separator) + '\n');
  for (const row of data) {
    process.stdout.write('  ' + row.map((v, i) => _pad(v, widths[i])).join('  ') + '\n');
  }
  process.stdout.write('\n');
}

/**
 * Print a single record as a vertical key-value list.
 *
 * @param {object} record
 * @param {string[]} [keys]  - subset of keys to show (default: all)
 * @param {Record<string,string>} [labels]
 * @param {Record<string,(v:any)=>string>} [formatters]
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
    } else if (val === null) {
      display = c.dim('—');
    } else if (typeof val === 'object') {
      display = JSON.stringify(val);
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
 * @param {number} timestamp - Unix timestamp in seconds
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
 * @returns {Record<string, (v:any)=>string>}
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
