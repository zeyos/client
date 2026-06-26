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

test('every bundled skill explicitly references the operating guide', () => {
  const files = walk(path.join(ROOT, 'agents'), ['SKILL.md'])
    .filter((file) => path.basename(path.dirname(file)) !== 'shared');
  assert.ok(files.length > 0, 'expected skill files to exist');

  const offenders = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.includes('zeyos-agent-operating-guide.md')) {
      offenders.push(path.relative(ROOT, file));
    }
  }

  assert.deepEqual(offenders, [], `skills missing zeyos-agent-operating-guide.md:\n${offenders.join('\n')}`);
});

test('shared operating guide keeps shell-safe bare-skill guidance', () => {
  const content = readFileSync(path.join(ROOT, 'agents/shared/zeyos-agent-operating-guide.md'), 'utf8');

  for (const expected of [
    'Bare-skill checklist for Pi/OpenCode/local models',
    'copy-paste-safe JSON',
    'Never execute raw JSON as a shell command',
    '@filter.json',
    '--filter-file <path>',
    '--data-file <path>',
    'zeyos count <resource>',
    'Joined/anti-join counts',
    'unanswered mail'
  ]) {
    assert.ok(content.includes(expected), `missing shared guidance: ${expected}`);
  }
});

test('count-heavy workflows include first-command zeyos count snippets', () => {
  const expectations = [
    [
      'agents/zeyos-account-intelligence/references/workflows.md',
      `zeyos count accounts --filter '{"type":1,"visibility":0}'`
    ],
    [
      'agents/zeyos-billing-insights/references/workflows.md',
      'zeyos count transactions'
    ],
    [
      'agents/zeyos-commerce-and-inventory/references/workflows.md',
      `zeyos count items --filter '{"visibility":0}'`
    ],
    [
      'agents/zeyos-platform-and-schema/references/workflows.md',
      'zeyos count customfields'
    ],
    [
      'agents/zeyos-campaign-and-outreach/references/workflows.md',
      `zeyos count campaigns --filter '{"visibility":0}'`
    ],
    [
      'agents/zeyos-collaboration-and-activity/references/workflows.md',
      'zeyos count events'
    ],
    [
      'agents/zeyos-work-management/references/workflows.md',
      `zeyos count actionsteps --filter '{"status":0,"duedate":{"!=":null}}'`
    ]
  ];

  for (const [relativeFile, snippet] of expectations) {
    const content = readFileSync(path.join(ROOT, relativeFile), 'utf8');
    assert.ok(content.includes(snippet), `${relativeFile} missing ${snippet}`);
  }
});

test('platform customfield workflow forbids turning command failure into zero', () => {
  const content = readFileSync(path.join(ROOT, 'agents/zeyos-platform-and-schema/references/workflows.md'), 'utf8');

  for (const expected of [
    'zeyos count customfields --json',
    'listCustomFields',
    'Do not answer `0`',
    'Unknown resource',
    'zeyos doctor agent --json'
  ]) {
    assert.ok(content.includes(expected), `platform workflow missing: ${expected}`);
  }
});

test('billing and shared query guidance prevent account schema and filter-operator hallucinations', () => {
  const shared = readFileSync(path.join(ROOT, 'agents/shared/zeyos-query-patterns.md'), 'utf8');
  for (const expected of [
    'Company names live in `accounts.lastname`',
    'there is no generic `accounts.name` column',
    '`{"lastname":{"~~*":"%Bureau3%"}}`',
    'do not use',
    '`contains`'
  ]) {
    assert.ok(shared.includes(expected), `shared query guidance missing: ${expected}`);
  }

  const billing = readFileSync(path.join(ROOT, 'agents/zeyos-billing-insights/references/workflows.md'), 'utf8');
  for (const expected of [
    'Billing delivery notes are `transactions.type = 2`',
    'Company names are stored in `accounts.lastname`',
    `zeyos list accounts`,
    `--filter '{"lastname":{"~~*":"%Bureau3%"},"visibility":0}'`,
    `--filter '{"account":<accountId>,"type":2}'`
  ]) {
    assert.ok(billing.includes(expected), `billing workflow missing: ${expected}`);
  }
});

test('account data-quality workflows document efficient missing-billing anti-joins', () => {
  const account = readFileSync(path.join(ROOT, 'agents/zeyos-account-intelligence/references/workflows.md'), 'utf8');
  const dataQuality = readFileSync(path.join(ROOT, 'agents/zeyos-data-quality-and-governance/references/workflows.md'), 'utf8');
  const dataQualitySkill = readFileSync(path.join(ROOT, 'agents/zeyos-data-quality-and-governance/SKILL.md'), 'utf8');

  for (const [name, content] of [
    ['account intelligence', account],
    ['data quality', dataQuality],
    ['data quality skill', dataQualitySkill]
  ]) {
    for (const expected of [
      `zeyos list accounts --filter '{"type":1,"visibility":0,"lastname":{"~~*":"<prefix>%"}}'`,
      `zeyos list addresses --filter '{"account":[<accountIds>],"type":[0,1]}'`
    ]) {
      assert.ok(content.includes(expected), `${name} workflow missing: ${expected}`);
    }
    assert.ok(content.includes('addresses') && content.includes('visibility'), `${name} workflow missing address visibility warning`);
  }

  assert.ok(dataQualitySkill.includes('name_starts'), 'data quality skill should warn about invented prefix filters');
  assert.ok(dataQualitySkill.includes('lastname_starts'), 'data quality skill should warn about invented prefix filters');
  assert.ok(dataQualitySkill.includes('skip schema discovery'), 'data quality skill should avoid redundant describes for explicit address-type prompts');
  assert.ok(dataQualitySkill.includes('do not loop one account at a time'), 'data quality skill should require batched address lookup');
  assert.ok(dataQuality.includes('do not loop one account at a time'), 'data quality workflow should require batched address lookup');
});

test('work-management workflow documents actionstep operation IDs and effort semantics', () => {
  const content = readFileSync(path.join(ROOT, 'agents/zeyos-work-management/references/workflows.md'), 'utf8');

  for (const expected of [
    'listActionSteps',
    'getActionStep',
    'createActionStep',
    'effort',
    'BOOKED',
    'COMPLETED',
    'comparison filters like',
    '`duedate:null` is not',
    'duedate != null && Number(duedate) <= cutoff'
  ]) {
    assert.ok(content.includes(expected), `work-management workflow missing: ${expected}`);
  }
});

test('time-summary workflows roll task-linked actionsteps up to tickets', () => {
  const files = [
    'agents/zeyos-work-management/SKILL.md',
    'agents/zeyos-work-management/references/workflows.md',
    'agents/zeyos-time-tracking/SKILL.md',
    'agents/zeyos-time-tracking/references/workflows.md'
  ];

  for (const relativeFile of files) {
    const content = readFileSync(path.join(ROOT, relativeFile), 'utf8');
    for (const expected of ['task.ticket', 'actionstep', 'ticket', 'dedupe']) {
      assert.ok(content.includes(expected), `${relativeFile} missing ticket task-time rollup guidance: ${expected}`);
    }
  }
});

test('mail workflow documents efficient unanswered-ticket count path', () => {
  const files = [
    'agents/zeyos-mail-operations/SKILL.md',
    'agents/zeyos-mail-operations/references/workflows.md'
  ];

  for (const relativeFile of files) {
    const content = readFileSync(path.join(ROOT, relativeFile), 'utf8');
    for (const expected of [
      'skip schema',
      '{"visibility":0,"status":[0,1,2,3,4,5,6,7,11]}',
      `--filter '{"mailbox":0,"ticket":[<ticketIds>]}'`,
      `--filter '{"mailbox":2,"ticket":[<ticketIds>]}'`,
      'the join logic',
      'do not write a scratch JavaScript client script',
      'CLI normalizes array filters'
    ]) {
      assert.ok(content.includes(expected), `${relativeFile} missing: ${expected}`);
    }
  }

  const workflow = readFileSync(path.join(ROOT, 'agents/zeyos-mail-operations/references/workflows.md'), 'utf8');
  assert.ok(workflow.includes('Do not use `notin`'), 'mail workflow should reject notin');
  assert.ok(workflow.includes('Do not run a separate `zeyos count messages`'), 'mail workflow should avoid redundant raw count');
  assert.ok(workflow.includes('do not select `messageid`'), 'mail workflow should avoid messageid for this count');

  const skill = readFileSync(path.join(ROOT, 'agents/zeyos-mail-operations/SKILL.md'), 'utf8');
  assert.ok(skill.includes('status_neq'), 'mail skill should warn about status_neq');
  assert.ok(skill.includes('messageid'), 'mail skill should warn about messageid');
});
