// Offline coverage for result parsing: markers, scalar/JSON/YAML/CSV/NDJSON, file sandbox.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';

import {
  parseResultMarkers, coerceScalar, parseYaml, parseCsv, parseCsvRows,
  parseNdjson, readResultFile, resolveResult, parseByFormat
} from './result.mjs';

test('parseResultMarkers distinguishes inline, block and file forms', () => {
  assert.deepEqual(parseResultMarkers('noise\nRESULT: 42'), { mode: 'inline', format: null, raw: '42', filePath: null });
  assert.deepEqual(parseResultMarkers('**RESULT: 42**'), { mode: 'inline', format: null, raw: '42', filePath: null });
  assert.deepEqual(parseResultMarkers('RESULT: **42**'), { mode: 'inline', format: null, raw: '42', filePath: null });
  assert.deepEqual(parseResultMarkers('RESULT: `42`'), { mode: 'inline', format: null, raw: '42', filePath: null });
  const block = parseResultMarkers('text\nRESULT_BEGIN json\n{"a":1}\nRESULT_END\ntail');
  assert.equal(block.mode, 'block');
  assert.equal(block.format, 'json');
  assert.equal(block.raw, '{"a":1}');
  const file = parseResultMarkers('done\nRESULT_FILE: out/report.csv');
  assert.equal(file.mode, 'file');
  assert.equal(file.filePath, 'out/report.csv');
  assert.equal(parseResultMarkers('nothing here'), null);
});

test('coerceScalar keeps leading-zero strings and parses real numbers', () => {
  assert.equal(coerceScalar('42'), 42);
  assert.equal(coerceScalar('00123'), '00123');
  assert.equal(coerceScalar('true'), true);
  assert.equal(coerceScalar('null'), null);
  assert.deepEqual(coerceScalar('{"a":1}'), { a: 1 });
});

test('parseYaml follows 1.2 core scalars (yes/00123 stay strings)', () => {
  const doc = parseYaml('ambiguousString: yes\nrawTimestamp: 1893456000\nleadingZero: "00123"\nflag: true\nempty: null');
  assert.equal(doc.ambiguousString, 'yes'); // NOT boolean true
  assert.equal(doc.rawTimestamp, 1893456000);
  assert.equal(doc.leadingZero, '00123');
  assert.equal(doc.flag, true);
  assert.equal(doc.empty, null);
});

test('parseYaml handles nested maps and sequences', () => {
  const doc = parseYaml('name: packet\ntags:\n  - a\n  - b\nmeta:\n  id: 7\n  ok: false');
  assert.equal(doc.name, 'packet');
  assert.deepEqual(doc.tags, ['a', 'b']);
  assert.deepEqual(doc.meta, { id: 7, ok: false });
});

test('parseCsv respects headers and quoted fields with commas', () => {
  const rows = parseCsv('account_id,name,has_shipping\n10,"Acme, Inc.",true\n11,Beta,false');
  assert.deepEqual(rows, [
    { account_id: '10', name: 'Acme, Inc.', has_shipping: 'true' },
    { account_id: '11', name: 'Beta', has_shipping: 'false' }
  ]);
  assert.equal(parseCsvRows('a;b\n1;2', ';').length, 2);
});

test('parseNdjson parses one object per line and reports bad lines', () => {
  assert.deepEqual(parseNdjson('{"t":1}\n{"t":2}\n'), [{ t: 1 }, { t: 2 }]);
  assert.throws(() => parseNdjson('{"t":1}\n{bad}'), /NDJSON parse error on line 2/);
});

test('parseByFormat dispatches per declared format', () => {
  assert.deepEqual(parseByFormat('{"a":1}', 'json'), { a: 1 });
  assert.equal(parseByFormat('7', 'scalar'), 7);
  assert.equal(parseByFormat('# Title', 'markdown'), '# Title');
});

test('readResultFile reads inside the workspace and rejects traversal', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-result-'));
  try {
    await mkdir(path.join(dir, 'out'), { recursive: true });
    await writeFile(path.join(dir, 'out', 'report.csv'), 'id\n1\n', 'utf8');
    assert.equal(readResultFile('out/report.csv', dir), 'id\n1\n');
    assert.throws(() => readResultFile('../escape', dir), /unsafe result file path/);
    assert.throws(() => readResultFile('/etc/hosts', dir), /unsafe result file path/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resolveResult parses a block per the declared contract', () => {
  const out = resolveResult('RESULT_BEGIN json\n{"jsonId":1,"same":true}\nRESULT_END', { format: 'json' });
  assert.deepEqual(out.value, { jsonId: 1, same: true });
  assert.equal(out.mode, 'block');
});

test('resolveResult parses a CSV result file from the workspace', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-result2-'));
  try {
    await writeFile(path.join(dir, 'r.csv'), 'account_id,name\n10,Acme\n', 'utf8');
    const out = resolveResult('done\nRESULT_FILE: r.csv', { mode: 'file', format: 'csv' }, { workspaceDir: dir });
    assert.deepEqual(out.value, [{ account_id: '10', name: 'Acme' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resolveResult rejects inline path strings when the contract requires a file marker', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-result3-'));
  try {
    await writeFile(path.join(dir, 'r.csv'), 'account_id,name\n10,Acme\n', 'utf8');
    const out = resolveResult('RESULT: r.csv', { mode: 'file', format: 'csv' }, { workspaceDir: dir });
    assert.equal(out.value, null);
    assert.match(out.error, /expected RESULT_FILE, got RESULT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
