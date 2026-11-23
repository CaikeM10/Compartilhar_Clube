// Offline: the isolation gate of scripts/neon-account-rehearsal.cjs refuses every unsafe target before any write.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertIsolatedTarget, injectAuth, injectTx, PRESERVED_SQL } = require('../scripts/neon-account-rehearsal.cjs');
const { parseRemoteTarget } = require('../scripts/neon-target.cjs');

const target = parseRemoteTarget('postgresql://u:SECRET@ep-ensaio-123.sa-east-1.aws.neon.tech/neondb?sslmode=require');
const AUTH_COLUMNS = ['id', 'name', 'email', 'createdAt', 'emailVerified', 'image', 'role', 'disabledAt', 'updatedAt'];

function fakeDb(identity = {}, { database = 'neondb' } = {}) {
  const statements = [];
  const tx = {
    $executeRawUnsafe: async sql => { statements.push(sql); return 0; },
    $queryRawUnsafe: async sql => {
      statements.push(sql);
      if (/current_database/.test(sql)) return [{ database }];
      if (/information_schema.tables/.test(sql)) return ['users', 'auth_accounts', 'auth_sessions', 'auth_verifications'].map(table_name => ({ table_name }));
      if (/information_schema.columns/.test(sql)) return AUTH_COLUMNS.map(column_name => ({ column_name }));
      // Neon proxy: Postgres sees the proxy→compute hop (ssl = false, private peer), never the client's TLS leg.
      if (/pg_stat_ssl/.test(sql)) return [{ schema: 'public', replica: false, version: '17.12', server_side_ssl: false, server_side_peer: '10.6.0.12', neon_settings: 12, ...identity }];
      throw new Error('UNEXPECTED_SQL');
    },
    user: { create: () => assert.fail('no write allowed'), update: () => assert.fail('no write allowed') },
  };
  return { statements, $transaction: async fn => fn(tx) };
}
const clientProof = { driver: { sslmode: 'require', sslaccept: 'strict' },
  handshake: { protocol: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', certificateVerified: true, hostnameVerified: true },
  plaintextRefused: true, plaintextRefusal: '08P01' };
const ok = { branch: 'ensaio-contas-20261118', productionEndpoint: 'ep-producao-999', proveTls: async () => clientProof };

test('accepts only a writable Neon primary of a non-production branch, over TLS, after a READ ONLY check', async () => {
  const db = fakeDb();
  const evidence = await assertIsolatedTarget(db, target, ok);
  assert.deepEqual(evidence, { branch: 'ensaio-contas-20261118', endpoint: 'ep-ensaio-123', productionEndpointDiffers: true, database: 'neondb',
    schema: 'public', tls: { client: clientProof, session: { serverSideSsl: false, peer: 'private', interpretation: 'neon-proxy-hop' } },
    writablePrimary: true, postgres: '17.12', neonServer: true });
  assert.equal(db.statements[0], 'SET TRANSACTION READ ONLY', 'read-only transaction before any query');
  assert.ok(!JSON.stringify(evidence).includes('SECRET'));
});

test('refuses production branch names, a missing/invalid production endpoint, and the production endpoint itself', async () => {
  for (const branch of ['production', 'main', 'PROD', ' master ', '']) {
    await assert.rejects(assertIsolatedTarget(fakeDb(), target, { ...ok, branch }), /REHEARSAL_BRANCH_REQUIRED/);
  }
  for (const productionEndpoint of ['', 'producao', 'ep-x y', undefined]) {
    await assert.rejects(assertIsolatedTarget(fakeDb(), target, { ...ok, productionEndpoint }), /PRODUCTION_ENDPOINT_ID_INVALID/);
  }
  await assert.rejects(assertIsolatedTarget(fakeDb(), target, { ...ok, productionEndpoint: 'ep-ensaio-123' }), /TARGET_IS_PRODUCTION_ENDPOINT/);
  const pooled = { ...target, endpoint: 'ep-producao-999-pooler' };
  await assert.rejects(assertIsolatedTarget(fakeDb(), pooled, ok), /TARGET_IS_PRODUCTION_ENDPOINT/);
});

test('Neon proxy regression: pg_stat_ssl = false from the proxy no longer blocks once the client leg is proven', async () => {
  for (const peer of ['10.6.0.12', '172.31.4.2', '192.168.1.9', '100.100.0.3']) {
    const evidence = await assertIsolatedTarget(fakeDb({ server_side_peer: peer }), target, ok);
    assert.equal(evidence.tls.session.interpretation, 'neon-proxy-hop');
    assert.equal(evidence.tls.client.handshake.certificateVerified, true);
  }
  const terminated = await assertIsolatedTarget(fakeDb({ server_side_ssl: true, server_side_peer: '203.0.113.5' }), target, ok);
  assert.equal(terminated.tls.session.interpretation, 'tls-terminated-at-postgres');
});

test('TLS stays mandatory: no client proof, non-strict driver URL or a non-TLS session from a public peer is refused', async () => {
  for (const [proveTls, error] of [
    [async () => { throw new Error('TARGET_TLS_NOT_ACTIVE'); }, /TARGET_TLS_NOT_ACTIVE/],
    [async () => { throw new Error('TARGET_TLS_CERTIFICATE_UNVERIFIED'); }, /TARGET_TLS_CERTIFICATE_UNVERIFIED/],
    [async () => { throw new Error('TARGET_ACCEPTS_PLAINTEXT'); }, /TARGET_ACCEPTS_PLAINTEXT/],
    [async () => ({ ...clientProof, plaintextRefused: false }), /TARGET_TLS_NOT_ACTIVE/],
    [async () => ({ ...clientProof, handshake: { ...clientProof.handshake, certificateVerified: false } }), /TARGET_TLS_NOT_ACTIVE/],
    [async () => undefined, /TARGET_TLS_NOT_ACTIVE/],
  ]) {
    const db = fakeDb();
    await assert.rejects(assertIsolatedTarget(db, target, { ...ok, proveTls }), error);
    assert.equal(db.statements.length, 0, 'TLS is proven before the first SQL statement');
  }
  for (const url of [target.url.replace(/&?sslaccept=strict/, ''), target.url.replace('sslmode=require', 'sslmode=verify-full')]) {
    let called = false;
    const db = fakeDb();
    await assert.rejects(assertIsolatedTarget(db, { ...target, url }, { ...ok, proveTls: async () => { called = true; return clientProof; } }), /TARGET_TLS_DRIVER_NOT_STRICT/);
    assert.equal(called, false); assert.equal(db.statements.length, 0);
  }
  for (const identity of [{ server_side_ssl: false, server_side_peer: '203.0.113.5' }, { server_side_ssl: null }, { server_side_ssl: false, server_side_peer: null }]) {
    await assert.rejects(assertIsolatedTarget(fakeDb(identity), target, ok), /TARGET_TLS_NOT_ACTIVE/, JSON.stringify(identity));
  }
  assert.ok(target.url.includes('sslaccept=strict'), 'parseRemoteTarget hands Prisma a strict URL');
});

test('refuses read replica, non-public schema, non-Neon server, wrong database or unmigrated schema', async () => {
  for (const [identity, error] of [
    [{ replica: true }, /TARGET_IS_READ_REPLICA/], [{ schema: 'other' }, /TARGET_SCHEMA_NOT_PUBLIC/], [{ neon_settings: 0 }, /TARGET_NOT_NEON/]]) {
    await assert.rejects(assertIsolatedTarget(fakeDb(identity), target, ok), error);
  }
  await assert.rejects(assertIsolatedTarget(fakeDb({}, { database: 'outro' }), target, ok), /TARGET_DATABASE_MISMATCH/);
});

test('failure injection helpers keep the real API/client and override only the chosen call', async () => {
  const calls = [];
  const factory = () => ({ api: { signInEmail: async () => { calls.push('real'); return 'ok'; }, signUpEmail: async () => 'up' }, $context: 'ctx' });
  const injected = injectAuth(factory, api => ({ signInEmail: async args => { await api.signInEmail(args); throw new Error('INJECTED'); } }))({}, {});
  assert.equal(injected.$context, 'ctx');
  assert.equal(await injected.api.signUpEmail(), 'up');
  await assert.rejects(injected.api.signInEmail({}), /INJECTED/);
  assert.deepEqual(calls, ['real']);

  const tx = { session: { deleteMany: async () => 'deleted', count: async () => 0 }, user: { count: async () => 1 }, $executeRawUnsafe: async () => 0 };
  const db = injectTx({ $transaction: async fn => fn(tx) }, 'session', 'deleteMany', 'INJECTED_TX');
  await db.$transaction(async client => {
    assert.equal(typeof client.$transaction, 'undefined');
    assert.equal(await client.user.count(), 1);
    assert.equal(await client.session.count(), 0);
    await assert.rejects(client.session.deleteMany(), /INJECTED_TX/);
  });
});

test('preservation query covers users, credentials, plans, subscriptions and payments of pre-existing data', () => {
  for (const fragment of ['FROM users WHERE id = ANY($1::text[])', 'FROM auth_accounts WHERE "userId" = ANY($1::text[])', 'FROM plans p', 'FROM subscriptions s', 'FROM payments p', 'password']) {
    assert.ok(PRESERVED_SQL.includes(fragment), fragment);
  }
  assert.doesNotMatch(PRESERVED_SQL, /\b(INSERT|UPDATE|DELETE)\b/);
});
