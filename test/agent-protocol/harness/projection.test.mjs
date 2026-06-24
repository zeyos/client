// Offline coverage for the projection engine: signed sums, joins, anti-joins, grouping.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPipeline, evalExpr, compareValues, computeProjection } from './projection.mjs';

test('evalExpr handles field refs, arithmetic and conditionals', () => {
  const row = { type: 4, netamount: 20, name: ' Acme ' };
  assert.equal(evalExpr('netamount', row), 20);
  assert.equal(evalExpr({ negate: 'netamount' }, row), -20);
  assert.equal(evalExpr({ if: ['type', 4, { negate: 'netamount' }, 'netamount'] }, row), -20);
  assert.equal(evalExpr({ if: ['type', 3, { negate: 'netamount' }, 'netamount'] }, row), 20);
  assert.equal(evalExpr({ trim: 'name' }, row), 'Acme');
});

test('signed sum: net revenue after credits (b24 shape)', () => {
  const sources = {
    tx: [
      { ID: 1, type: 3, netamount: 100.10 },
      { ID: 2, type: 3, netamount: 50.15 },
      { ID: 3, type: 4, netamount: 20.10 },
      { ID: 4, type: 9, netamount: 999 } // wrong-type distractor
    ]
  };
  const computed = runPipeline(sources, [
    { where: { source: 'tx', field: 'type', in: [3, 4] } },
    { derive: { signed: { if: ['type', 4, { negate: 'netamount' }, 'netamount'] } } },
    { aggregate: { netAfterCredits: { sum: 'signed' } } }
  ]);
  assert.ok(Math.abs(computed.netAfterCredits - 130.15) < 0.005);
});

test('anti-join: customers missing a billing address (b22 shape)', () => {
  const sources = {
    accounts: [{ ID: 1 }, { ID: 2 }, { ID: 3 }],
    billing: [{ account: 1 }] // only account 1 has a billing address
  };
  const computed = runPipeline(sources, [
    { from: { source: 'accounts' } },
    { antiJoin: { source: 'billing', on: { left: 'ID', right: 'account' } } },
    { project: { fields: ['ID'] } }
  ]);
  assert.deepEqual(computed.map((r) => r.ID).sort(), [2, 3]);
});

test('left join attaches matched rows; inner join keeps only matches', () => {
  const sources = {
    items: [{ ID: 1 }, { ID: 2 }],
    prices: [{ item: 1, price: 9.99 }]
  };
  const left = runPipeline(sources, [
    { from: { source: 'items' } },
    { leftJoin: { source: 'prices', on: { left: 'ID', right: 'item' }, as: 'price' } }
  ]);
  assert.equal(left.length, 2);
  assert.equal(left[0].price.price, 9.99);
  assert.equal(left[1].price, null);

  const inner = runPipeline(sources, [
    { from: { source: 'items' } },
    { join: { source: 'prices', on: { left: 'ID', right: 'item' } } }
  ]);
  assert.equal(inner.length, 1);
  assert.equal(inner[0].price, 9.99);
});

test('grouping with aggregates: stock by storage (b28 shape)', () => {
  const sources = {
    moves: [
      { storage: 'A', flag: 'booked', qty: 10 },
      { storage: 'A', flag: 'booked', qty: 5 },
      { storage: 'A', flag: 'reserved', qty: 3 },
      { storage: 'B', flag: 'booked', qty: 7 }
    ]
  };
  const computed = runPipeline(sources, [
    { from: { source: 'moves' } },
    { group: { by: 'storage', aggregate: {
      booked: { sum: { if: ['flag', 'booked', 'qty', { const: 0 }] } },
      reserved: { sum: { if: ['flag', 'reserved', 'qty', { const: 0 }] } }
    } } },
    { sort: { by: 'storage' } }
  ]);
  assert.deepEqual(computed, [
    { storage: 'A', booked: 15, reserved: 3 },
    { storage: 'B', booked: 7, reserved: 0 }
  ]);
});

test('ratio and avg aggregates (supplier scorecard shape)', () => {
  const rows = [
    { onTime: 1, days: 2 },
    { onTime: 0, days: 6 },
    { onTime: 1, days: 4 }
  ];
  const computed = runPipeline({ s: rows }, [
    { from: { source: 's' } },
    { aggregate: { on_time_rate: { ratio: ['onTime', { const: 1 }] }, avg_days: { avg: 'days' } } }
  ]);
  assert.ok(Math.abs(computed.on_time_rate - (2 / 3)) < 1e-6);
  assert.equal(computed.avg_days, 4);
});

test('compareValues honors tolerance, set and ordered semantics', () => {
  assert.equal(compareValues(130.15, 130.1500001, { tolerance: 0.005 }), true);
  assert.equal(compareValues(130.15, 131, { tolerance: 0.005 }), false);
  assert.equal(compareValues([1, 2, 3], [3, 2, 1], { comparator: 'set' }), true);
  assert.equal(compareValues([1, 2, 3], [3, 2, 1], { comparator: 'orderedArray' }), false);
});

test('computeProjection compares the computed value to the agent RESULT path', async () => {
  const expect = {
    kind: 'computeProjection',
    _sources: { tx: [{ type: 3, netamount: 100 }, { type: 4, netamount: 25 }] },
    pipeline: [
      { where: { source: 'tx', field: 'type', in: [3, 4] } },
      { derive: { signed: { if: ['type', 4, { negate: 'netamount' }, 'netamount'] } } },
      { aggregate: { netAfterCredits: { sum: 'signed' } } }
    ],
    select: '$.netAfterCredits',
    compareTo: '$RESULT.netAfterCredits',
    tolerance: 0.005
  };
  const ok = await computeProjection(expect, { resultValue: { netAfterCredits: 75 } });
  assert.equal(ok.pass, true);
  const bad = await computeProjection(expect, { resultValue: { netAfterCredits: 125 } });
  assert.equal(bad.pass, false);
});
