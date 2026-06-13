// Guards against the class of drift where agent guidance, docs, or samples tell
// an agent to call an operation that does not exist (e.g. `listDunning` instead
// of `listDunningNotices`). Every operationId referenced in a markdown mapping
// table, or via `client.<service>.<op>`, must exist on the real client surface.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES } from '../src/generated/operations.js';
import { createZeyosClient } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Generated operationIds (what bare mapping-table cells should reference).
const generatedOps = new Set();
for (const def of Object.values(SERVICES)) {
  for (const op of def.operations || []) generatedOps.add(op.operationId);
}

// Live client surface — includes hand-written helpers (oauth2.buildAuthorizationUrl,
// exchangeAuthorizationCode, …) that are valid calls but not generated operations.
const liveClient = createZeyosClient({
  platform: 'https://example.test/inst/',
  auth: { mode: 'none' },
  fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
});
const isClientMethod = (service, op) => liveClient[service] != null && op in liveClient[service];

// Deliberate "don't do this — it will fail" examples written into the guidance.
const KNOWN_NEGATIVES = new Set([
  'listDunning', 'listActionsteps', 'listEntities2channels', 'listDunning2transactions'
]);

const OP_SHAPE = /^(?:list|get|create|update|delete|exists)[A-Z][A-Za-z0-9]*$/;
const CLIENT_REF = /client\.(api|oauth2|legacyAuth)\.([A-Za-z0-9_]+)/g;

function walk(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, exts));
    } else if (entry.isFile() && exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

test('agent mapping tables reference only real operationIds', () => {
  const files = walk(path.join(ROOT, 'agents'), ['.md']);
  assert.ok(files.length > 0, 'expected agent markdown files to exist');

  const offenders = [];
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('|')) continue;
      for (const rawCell of line.split('|')) {
        const cell = rawCell.trim().replace(/^`|`$/g, '').trim();
        if (OP_SHAPE.test(cell) && !generatedOps.has(cell) && !KNOWN_NEGATIVES.has(cell)) {
          offenders.push(`${path.relative(ROOT, file)}: ${cell}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], `operationIds in agent tables that do not exist:\n${offenders.join('\n')}`);
});

test('client.<service>.<operation> references in agents/docs/samples all exist', () => {
  const files = [
    ...walk(path.join(ROOT, 'agents'), ['.md']),
    ...walk(path.join(ROOT, 'docs'), ['.md']),
    ...walk(path.join(ROOT, 'samples'), ['.js'])
  ];

  const offenders = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    CLIENT_REF.lastIndex = 0;
    let match;
    while ((match = CLIENT_REF.exec(content)) !== null) {
      const [, service, op] = match;
      if (KNOWN_NEGATIVES.has(op)) continue;
      if (!isClientMethod(service, op)) {
        offenders.push(`${path.relative(ROOT, file)}: client.${service}.${op}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `client.<service>.<op> references to non-existent operations:\n${offenders.join('\n')}`);
});
