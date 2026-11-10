const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createWebhookHandler, addCalendarMonths } = require(process.env.WEBHOOK_TEST_MODULE);

const secret = 'unit-test-secret-not-a-real-credential';
const now = new Date('2026-01-31T12:15:00.000Z');
const user = { id: 'user-1', email: 'beneficiary@example.invalid' };
const initial = () => ({ users: [user], payments: [], subscriptions: [], plans: [
  { id: 'plan-1', name: 'mensal' }, { id: 'plan-3', name: 'trimestral' },
  { id: 'plan-12', name: 'anual' },
] });
const approved = (overrides = {}) => ({
  id: 123, status: 'approved', currency_id: 'BRL', transaction_amount: 59,
  transaction_amount_refunded: 0, live_mode: true,
  metadata: { plan: 'mensal', source: 'site' }, external_reference: user.id,
  payer: { email: 'different-payer@example.invalid' }, ...overrides,
});

function notification(id = '123', options = {}) {
  const ts = '1704908010'; // Old signed deliveries must remain idempotent.
  const requestId = 'request-1';
  const hash = createHmac('sha256', secret)
    .update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return new Request(`https://example.invalid/api/webhook?data.id=${id}`, {
    method: 'POST', headers: {
      'content-type': 'application/json', 'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${hash}`, ...options.headers,
    }, body: options.rawBody ?? JSON.stringify(options.body ?? { type: 'payment', data: { id } }),
  });
}

// Optimistic snapshot fake: allows overlapping callbacks, rolls back failed writes,
// and reports commit conflicts. This tests retry orchestration, NOT PostgreSQL itself.
function database(seed = initial(), options = {}) {
  let state = structuredClone(seed);
  let version = 0;
  let calls = 0;
  let conflicts = 0;
  let failures = options.failures ?? 1;
  const api = {
    get state() { return structuredClone(state); },
    get calls() { return calls; },
    get conflicts() { return conflicts; },
    async $transaction(callback, transactionOptions) {
      calls++;
      assert.equal(transactionOptions.isolationLevel, 'Serializable');
      if (options.alwaysConflict) throw { code: 'P2034' };
      if (options.uniqueFailure) throw { code: 'P2002' };
      const snapshot = structuredClone(state);
      const startVersion = version;
      let dirty = false;
      function fail(stage) {
        if (options.failAt === stage && failures-- > 0) throw new Error('PRIVATE_DATABASE_DETAIL');
      }
      const tx = {
        user: { findUnique: async ({ where }) => { fail('user'); return snapshot.users.find(u => u.id === where.id) ?? null; } },
        plan: { findUnique: async ({ where }) => { fail('plan'); return snapshot.plans.find(p => p.name === where.name) ?? null; } },
        payment: {
          findUnique: async ({ where }) => snapshot.payments.find(p => p.mercadopagoId === where.mercadopagoId) ?? null,
          create: async ({ data }) => {
            fail('payment');
            if (snapshot.payments.some(p => p.mercadopagoId === data.mercadopagoId)) throw { code: 'P2002' };
            dirty = true;
            snapshot.payments.push(structuredClone(data));
            return data;
          },
        },
        subscription: {
          findFirst: async ({ where, orderBy }) => {
            assert.deepEqual(orderBy, { endDate: 'desc' });
            return snapshot.subscriptions.filter(s => s.userId === where.userId &&
              s.status === where.status && s.endDate > where.endDate.gt)
              .sort((a, b) => b.endDate - a.endDate)[0] ?? null;
          },
          create: async ({ data }) => {
            fail('subscription');
            dirty = true;
            snapshot.subscriptions.push(structuredClone(data));
            return data;
          },
        },
      };
      const result = await callback(tx);
      fail('commit');
      if (dirty && version !== startVersion) {
        conflicts++;
        throw { code: options.conflictCode ?? 'P2034' };
      }
      if (dirty) { state = snapshot; version++; }
      return result;
    },
  };
  return api;
}

function harness({ db = database(), payment = approved(), config = {}, fetch: provider } = {}) {
  let requests = 0;
  const handler = createWebhookHandler({
    db, now: () => new Date(now),
    config: () => ({ accessToken: 'test-token', webhookSecret: secret, environment: 'production', ...config }),
    fetch: async (url, init) => {
      requests++;
      assert.equal(init.cache, 'no-store');
      assert.equal(init.redirect, 'error');
      return provider ? provider(url, init) : Response.json(payment);
    },
  });
  return { handler, db, get requests() { return requests; } };
}

for (const [plan, amount, end] of [
  ['mensal', 59, '2026-02-28T12:15:00.000Z'],
  ['trimestral', 139, '2026-04-30T12:15:00.000Z'],
  ['anual', 499, '2027-01-31T12:15:00.000Z'],
]) {
  test(`approved ${plan}: exactly one payment and period`, async () => {
    const h = harness({ payment: approved({ metadata: { plan, source: 'site' }, transaction_amount: amount }) });
    const response = await h.handler(notification());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].status, 'processed');
    assert.equal(h.db.state.payments.length, 1);
    assert.equal(h.db.state.payments[0].amount, amount * 100);
    assert.equal(h.db.state.payments[0].email, user.email);
    assert.equal(h.db.state.users.length, 1);
    assert.equal(h.db.state.subscriptions.length, 1);
    assert.equal(h.db.state.subscriptions[0].endDate.toISOString(), end);
  });
}

test('repeated notification does not grant again', async () => {
  const h = harness();
  await h.handler(notification());
  const before = h.db.state;
  const response = await h.handler(notification());
  assert.equal((await response.json()).results[0].status, 'duplicate');
  assert.deepEqual(h.db.state, before);
});

for (const conflictCode of ['P2034', 'P2002']) {
  test(`simultaneous duplicate retries ${conflictCode} and commits once`, async () => {
    const h = harness({ db: database(initial(), { conflictCode }) });
    const responses = await Promise.all([h.handler(notification()), h.handler(notification())]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    const statuses = await Promise.all(responses.map(async r => (await r.json()).results[0].status));
    assert.deepEqual(statuses.sort(), ['duplicate', 'processed']);
    assert.ok(h.db.conflicts > 0, 'must exercise overlapping transactions');
    assert.equal(h.db.state.payments.length, 1);
    assert.equal(h.db.state.subscriptions.length, 1);
  });
}

test('different simultaneous payments preserve both paid periods', async () => {
  const h = harness({ fetch: url => Response.json(approved({ id: Number(url.split('/').at(-1)) })) });
  const responses = await Promise.all([h.handler(notification('123')), h.handler(notification('124'))]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(h.db.state.payments.length, 2);
  const periods = h.db.state.subscriptions.sort((a, b) => a.startDate - b.startDate);
  assert.equal(periods.length, 2);
  assert.equal(periods[1].startDate.toISOString(), periods[0].endDate.toISOString());
  assert.equal(periods[1].endDate.toISOString(), '2026-03-28T12:15:00.000Z');
});

test('renewal appends to greatest active end, leaves existing records unchanged', async () => {
  const seed = initial();
  seed.subscriptions = [
    { userId: user.id, status: 'active', startDate: new Date('2025-12-01'), endDate: new Date('2026-03-31T12:15:00Z') },
    { userId: user.id, status: 'active', startDate: new Date('2026-03-31'), endDate: new Date('2026-06-30T12:15:00Z') },
    { userId: user.id, status: 'cancelled', endDate: new Date('2028-01-01') },
    { userId: 'another-user', status: 'active', endDate: new Date('2029-01-01') },
  ];
  const h = harness({ db: database(seed) });
  assert.equal((await h.handler(notification())).status, 200);
  const rows = h.db.state.subscriptions;
  assert.deepEqual(rows.slice(0, 4), seed.subscriptions);
  assert.equal(rows[4].startDate.toISOString(), '2026-06-30T12:15:00.000Z');
  assert.equal(rows[4].endDate.toISOString(), '2026-07-30T12:15:00.000Z');
});

test('expired subscription starts a new period now', async () => {
  const seed = initial();
  seed.subscriptions.push({ userId: user.id, status: 'active', endDate: new Date('2025-01-01') });
  const h = harness({ db: database(seed) });
  await h.handler(notification());
  assert.deepEqual(h.db.state.subscriptions[1].startDate, now);
});

test('calendar addition clamps leap day without mutating input', () => {
  const date = new Date('2024-02-29T23:59:00Z');
  assert.equal(addCalendarMonths(date, 12).toISOString(), '2025-02-28T23:59:00.000Z');
  assert.equal(date.toISOString(), '2024-02-29T23:59:00.000Z');
});

for (const stage of ['user', 'plan', 'payment', 'subscription', 'commit']) {
  test(`failure at ${stage} rolls back; retry grants exactly once`, async () => {
    const h = harness({ db: database(initial(), { failAt: stage }) });
    const before = h.db.state;
    const failed = await h.handler(notification());
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'PERSISTENCE_FAILED' });
    assert.deepEqual(h.db.state, before);
    assert.equal((await h.handler(notification())).status, 200);
    assert.equal(h.db.state.payments.length, 1);
    assert.equal(h.db.state.subscriptions.length, 1);
  });
}

for (const option of ['alwaysConflict', 'uniqueFailure']) {
  test(`exhausted ${option} is retryable failure, never false success`, async () => {
    const h = harness({ db: database(initial(), { [option]: true }) });
    assert.equal((await h.handler(notification())).status, 503);
    assert.equal(h.db.calls, 3);
    assert.equal(h.db.state.payments.length, 0);
  });
}

for (const [label, overrides, error] of [
  ['currency', { currency_id: 'USD' }, 'INVALID_PAYMENT_CURRENCY'],
  ['underpayment', { transaction_amount: 1 }, 'INVALID_PAYMENT_AMOUNT'],
  ['overpayment', { transaction_amount: 60 }, 'INVALID_PAYMENT_AMOUNT'],
  ['fractional cent', { transaction_amount: 59.001 }, 'INVALID_PAYMENT_AMOUNT'],
  ['string amount', { transaction_amount: '59' }, 'INVALID_PAYMENT_AMOUNT'],
  ['plan', { metadata: { plan: 'unknown', source: 'site' } }, 'INVALID_PAYMENT_PLAN'],
  ['prototype key', { metadata: { plan: 'constructor', source: 'site' } }, 'INVALID_PAYMENT_PLAN'],
  ['source', { metadata: { plan: 'mensal' } }, 'INVALID_PAYMENT_PLAN'],
  ['test payment in production', { live_mode: false }, 'PAYMENT_ENVIRONMENT_MISMATCH'],
  ['refund', { transaction_amount_refunded: 1 }, 'REFUND_STATE_REQUIRES_REVIEW'],
  ['missing refund state', { transaction_amount_refunded: undefined }, 'REFUND_STATE_REQUIRES_REVIEW'],
  ['missing beneficiary', { external_reference: undefined }, 'BENEFICIARY_REFERENCE_REQUIRED'],
  ['unknown beneficiary', { external_reference: 'missing' }, 'BENEFICIARY_NOT_FOUND'],
]) {
  test(`reject ${label} without writes`, async () => {
    const h = harness({ payment: approved(overrides) });
    const response = await h.handler(notification());
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(h.db.state, initial());
  });
}

for (const status of ['pending', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
  test(`${status} cannot create access`, async () => {
    const h = harness({ payment: approved({ status }) });
    const response = await h.handler(notification());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].status, 'ignored');
    assert.equal(h.db.calls, 0);
  });
}

test('development accepts R$1 only with test payment', async () => {
  const h = harness({ config: { environment: 'development' }, payment: approved({ transaction_amount: 1, live_mode: false }) });
  assert.equal((await h.handler(notification())).status, 200);
  assert.equal(h.db.state.payments[0].amount, 100);
  const live = harness({ config: { environment: 'development' }, payment: approved({ transaction_amount: 1 }) });
  assert.equal((await live.handler(notification())).status, 422);
});

test('missing signature and tampered signature never fetch or write', async () => {
  for (const signature of ['', 'ts=1704908010,v1=' + '0'.repeat(64)]) {
    const h = harness();
    assert.equal((await h.handler(notification('123', { headers: { 'x-signature': signature } }))).status, 401);
    assert.equal(h.requests, 0);
    assert.equal(h.db.calls, 0);
  }
});

test('signed query ID must match body ID', async () => {
  const h = harness();
  assert.equal((await h.handler(notification('123', { body: { type: 'payment', data: { id: '456' } } }))).status, 400);
  assert.equal(h.requests, 0);
});

test('legacy unsigned merchant_order cannot grant', async () => {
  const h = harness();
  const req = new Request('https://example.invalid/api/webhook?id=1&topic=merchant_order', {
    method: 'POST', body: JSON.stringify({ topic: 'merchant_order', id: 1 }),
  });
  assert.equal((await h.handler(req)).status, 401);
  assert.equal(h.requests, 0);
});

test('invalid JSON and missing secret fail explicitly', async () => {
  assert.equal((await harness().handler(notification('123', { rawBody: '{' }))).status, 400);
  const h = harness({ config: { webhookSecret: undefined } });
  assert.equal((await h.handler(notification())).status, 503);
  assert.equal(h.requests, 0);
});

for (const provider of [
  () => new Response('unavailable', { status: 503 }),
  () => new Response('{'),
  () => { throw new Error('network failure'); },
  () => Response.json({ id: 456, status: 'approved' }),
  () => Response.json({ id: 123, status: 'unexpected' }),
]) {
  test('provider error is not acknowledged as successful payment', async () => {
    const h = harness({ fetch: provider });
    assert.equal((await h.handler(notification())).status, 502);
    assert.equal(h.db.calls, 0);
  });
}

test('missing catalog row is retryable, not auto-created', async () => {
  const seed = initial(); seed.plans = [];
  const h = harness({ db: database(seed) });
  assert.equal((await h.handler(notification())).status, 503);
  assert.deepEqual(h.db.state, seed);
});

test('historical payment without reference is acknowledged without repair', async () => {
  const seed = initial();
  seed.payments.push({ mercadopagoId: '123', plan: 'mensal', status: 'approved', amount: 5900, email: 'historic@example.invalid' });
  const h = harness({ db: database(seed), payment: approved({ external_reference: undefined }) });
  const response = await h.handler(notification());
  assert.equal((await response.json()).results[0].status, 'duplicate');
  assert.deepEqual(h.db.state, seed);
});

test('inconsistent historical payment is not silently accepted', async () => {
  const seed = initial();
  seed.payments.push({ mercadopagoId: '123', plan: 'anual', status: 'approved', amount: 5900 });
  const h = harness({ db: database(seed) });
  assert.equal((await h.handler(notification())).status, 409);
  assert.deepEqual(h.db.state, seed);
});

test('signed order processes every payment and deduplicates its IDs', async () => {
  const h = harness({ fetch: url => {
    if (url.includes('merchant_orders')) return Response.json({ id: 999, payments: [{ id: 123 }, { id: 124 }, { id: 124 }] });
    const id = Number(url.split('/').at(-1));
    return Response.json(approved({ id, order: { id: 999 }, ...(id === 123 ? { status: 'pending' } : {}) }));
  } });
  const response = await h.handler(notification('999', { body: { type: 'merchant_order', data: { id: 999 } } }));
  assert.equal(response.status, 200);
  assert.equal(h.requests, 3);
  assert.equal(h.db.state.payments.length, 1);
  assert.equal(h.db.state.payments[0].mercadopagoId, '124');
});

test('order retry preserves first committed payment after second provider failure', async () => {
  let failSecond = true;
  const h = harness({ fetch: url => {
    if (url.includes('merchant_orders')) return Response.json({ id: 999, payments: [{ id: 123 }, { id: 124 }] });
    const id = Number(url.split('/').at(-1));
    if (id === 124 && failSecond) return new Response('', { status: 503 });
    return Response.json(approved({ id, order: { id: 999 } }));
  } });
  const request = () => notification('999', { body: { type: 'merchant_order', data: { id: 999 } } });
  assert.equal((await h.handler(request())).status, 502);
  assert.equal(h.db.state.subscriptions.length, 1);
  failSecond = false;
  assert.equal((await h.handler(request())).status, 200);
  assert.equal(h.db.state.payments.length, 2);
  assert.equal(h.db.state.subscriptions.length, 2);
});

test('order cannot attach unrelated payment', async () => {
  const h = harness({ fetch: url => Response.json(url.includes('merchant_orders')
    ? { id: 999, payments: [{ id: 123 }] }
    : approved({ order: { id: 888 } })) });
  const response = await h.handler(notification('999', { body: { type: 'merchant_order', data: { id: 999 } } }));
  assert.equal(response.status, 422);
  assert.equal(h.db.calls, 0);
});

test('body approval cannot override provider pending status', async () => {
  const h = harness({ payment: approved({ status: 'pending' }) });
  const response = await h.handler(notification('123', { body: {
    type: 'payment', data: { id: 123 }, status: 'approved', external_reference: user.id,
  } }));
  assert.equal(response.status, 200);
  assert.equal(h.db.calls, 0);
});

test('ambiguous signed IDs are rejected before provider access', async () => {
  const h = harness();
  const original = notification();
  const req = new Request(original.url + '&data.id=456', {
    method: 'POST', headers: original.headers, body: await original.text(),
  });
  assert.equal((await h.handler(req)).status, 401);
  assert.equal(h.requests, 0);
});

test('signature tied to request-id cannot be reused with another request-id', async () => {
  const h = harness();
  assert.equal((await h.handler(notification('123', { headers: { 'x-request-id': 'another-request' } }))).status, 401);
  assert.equal(h.requests, 0);
});

test('signed unknown topic is ignored without network or persistence', async () => {
  const h = harness();
  const response = await h.handler(notification('123', { body: { type: 'unknown', data: { id: 123 } } }));
  assert.equal(response.status, 200);
  assert.equal(h.requests, 0);
  assert.equal(h.db.calls, 0);
});
