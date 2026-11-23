// No database, no network: operator procedures for principal administrators against in-memory fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { designatePrincipal, recoverAdminPassword, main, PRINCIPAL_LIMIT, OTHERS_SQL } = require('../scripts/principal-admin-operator.cjs');

const NOW = new Date('2026-11-19T12:00:00Z');
const user = (id, fields = {}) => ({ id, email: `${id}@example.invalid`, role: 'ADMIN', disabledAt: null, isPrincipalAdmin: false, mustChangePassword: false, ...fields });

function fakeDb(users, { migrated = true } = {}) {
  const state = {
    users: users.map(row => ({ ...row })),
    accounts: users.map(row => ({ id: `acc-${row.id}`, userId: row.id, providerId: 'credential', password: `scrypt$${row.id}` })),
    sessions: users.map(row => ({ id: `sess-${row.id}`, userId: row.id })),
    audit: [], settings: {}, statements: [],
  };
  const where = (row, condition) => Object.entries(condition).every(([key, value]) =>
    key === 'email' ? row.email.toLowerCase() === value.equals.toLowerCase() : row[key] === value);
  const tx = {
    $executeRawUnsafe: async sql => {
      state.statements.push(sql);
      const setting = sql.match(/set_config\('([^']+)', '([^']+)', true\)/);
      if (setting) state.settings[setting[1]] = setting[2];
      return 1;
    },
    $queryRawUnsafe: async (sql, param) => {
      if (/information_schema.tables/.test(sql)) return ['users', 'auth_accounts', 'auth_sessions', 'auth_verifications'].map(table_name => ({ table_name }));
      if (/information_schema.columns/.test(sql) && Array.isArray(param)) return migrated ? param.map(column_name => ({ column_name })) : [];
      if (/information_schema.columns/.test(sql)) return ['id', 'name', 'email', 'createdAt', 'emailVerified', 'image', 'role', 'disabledAt', 'updatedAt'].map(column_name => ({ column_name }));
      if (/to_regclass/.test(sql)) return [{ present: migrated }];
      if (sql === OTHERS_SQL) return [{ users: JSON.stringify(state.users.filter(row => row.id !== param)), accounts: JSON.stringify(state.accounts.filter(row => row.userId !== param)), sessions: JSON.stringify(state.sessions.filter(row => row.userId !== param)) }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    user: {
      count: async ({ where: condition }) => state.users.filter(row => where(row, condition)).length,
      findMany: async ({ where: condition }) => state.users.filter(row => where(row, condition)).map(row => ({ ...row })),
      update: async ({ where: condition, data }) => {
        const row = state.users.find(item => item.id === condition.id);
        // Mirrors the 06 trigger: principal changes only inside the operator procedure, at most two principals.
        if ('isPrincipalAdmin' in data && state.settings['compartilhar.principal_designation'] !== 'on') throw new Error('PRINCIPAL_ADMIN_DESIGNATION_REQUIRED');
        if (data.isPrincipalAdmin && state.users.filter(item => item.isPrincipalAdmin && item.id !== row.id).length >= 2) throw new Error('PRINCIPAL_ADMIN_LIMIT_REACHED');
        Object.assign(row, data); return { ...row };
      },
    },
    account: {
      findMany: async ({ where: condition }) => state.accounts.filter(row => row.userId === condition.userId && row.providerId === condition.providerId).map(row => ({ id: row.id })),
      update: async ({ where: condition, data }) => Object.assign(state.accounts.find(row => row.id === condition.id), data),
    },
    session: {
      deleteMany: async ({ where: condition }) => { state.sessions = state.sessions.filter(row => row.userId !== condition.userId); },
      count: async ({ where: condition }) => state.sessions.filter(row => row.userId === condition.userId).length,
    },
    adminAuditEvent: { create: async ({ data }) => { state.audit.push(data); return data; } },
  };
  return {
    state, user: tx.user, $disconnect: async () => {},
    $transaction: async fn => {
      const snapshot = structuredClone(state);
      try { return await fn(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
      finally { state.settings = {}; } // set_config(..., true) is transaction-local
    },
  };
}
const verify = async () => {};

test('designation: one existing enabled ADMIN, operator-confirmed count, flag set only inside the procedure, audited', async () => {
  const db = fakeDb([user('tech'), user('wesley'), user('common'), user('aluno', { role: 'STUDENT' })]);
  const result = await designatePrincipal(db, { email: 'TECH@example.invalid', expectedPrincipals: 0, verify });
  assert.deepEqual(result, { id: 'tech', principals: 1 });
  assert.ok(db.state.statements.some(sql => /pg_advisory_xact_lock\(61420319\)/.test(sql)));
  assert.deepEqual(db.state.settings, {}, 'the designation setting does not outlive the transaction');
  assert.deepEqual(db.state.audit, [{ action: 'PRINCIPAL_DESIGNATED', actorId: null, targetUserId: 'tech' }]);
  await designatePrincipal(db, { email: 'wesley@example.invalid', expectedPrincipals: 1, verify });
  assert.deepEqual(db.state.users.filter(row => row.isPrincipalAdmin).map(row => row.id), ['tech', 'wesley']);
  // Never more than two principals.
  await assert.rejects(designatePrincipal(db, { email: 'common@example.invalid', expectedPrincipals: 2, verify }), /PRINCIPAL_ADMIN_LIMIT_REACHED/);
  assert.equal(db.state.users.find(row => row.id === 'common').isPrincipalAdmin, false);
  assert.equal(PRINCIPAL_LIMIT, 2);
});

test('designation refusals: count changed, students, disabled, unknown, already principal, unmigrated schema', async () => {
  const users = [user('tech', { isPrincipalAdmin: true }), user('common'), user('aluno', { role: 'STUDENT' }), user('off', { disabledAt: NOW })];
  for (const [email, expectedPrincipals, error] of [
    ['common@example.invalid', 0, /PRINCIPAL_COUNT_CHANGED_REVIEW_REQUIRED/],
    ['aluno@example.invalid', 1, /TARGET_MUST_BE_ADMIN/],
    ['off@example.invalid', 1, /TARGET_ACCOUNT_DISABLED/],
    ['ninguem@example.invalid', 1, /TARGET_ACCOUNT_NOT_FOUND/],
    ['tech@example.invalid', 1, /TARGET_ALREADY_PRINCIPAL/],
  ]) {
    const db = fakeDb(users);
    await assert.rejects(designatePrincipal(db, { email, expectedPrincipals, verify }), error, email);
    assert.equal(db.state.audit.length, 0);
    assert.deepEqual(db.state.users.filter(row => row.isPrincipalAdmin).map(row => row.id), ['tech']);
  }
  await assert.rejects(designatePrincipal(fakeDb(users, { migrated: false }), { email: 'common@example.invalid', expectedPrincipals: 1, verify }), /ADMIN_USERS_SCHEMA_NOT_MIGRATED/);
});

function fakeAuth(db) {
  return (tx, environment) => {
    assert.equal(environment.allowSignUp, undefined, 'recovery never enables sign-up');
    assert.equal(typeof tx.$transaction, 'undefined');
    return {
      $context: Promise.resolve({ password: { hash: async value => `scrypt$${value.length}$hashed` } }),
      api: { signInEmail: async ({ body }) => {
        const row = db.state.users.find(item => item.email === body.email);
        db.state.sessions.push({ id: 'proof', userId: row.id });
        return { user: { id: row.id } };
      } },
    };
  };
}

test('recovery without an active session: temporary password via Better Auth hasher, forced change, every session revoked', async () => {
  const db = fakeDb([user('tech', { isPrincipalAdmin: true }), user('common'), user('aluno', { role: 'STUDENT' })]);
  const others = structuredClone(db.state.sessions.filter(row => row.userId !== 'tech'));
  const result = await recoverAdminPassword(db, fakeAuth(db), { email: 'tech@example.invalid', password: 'Temporaria-1234', verify });
  assert.deepEqual(result, { id: 'tech' });
  const target = db.state.users.find(row => row.id === 'tech');
  assert.equal(target.mustChangePassword, true); assert.equal(target.isPrincipalAdmin, true); assert.equal(target.role, 'ADMIN');
  assert.equal(db.state.accounts.find(row => row.userId === 'tech').password, 'scrypt$15$hashed');
  assert.equal(db.state.sessions.filter(row => row.userId === 'tech').length, 0);
  assert.deepEqual(db.state.sessions, others, 'other accounts keep their sessions');
  assert.deepEqual(db.state.audit, [{ action: 'OPERATOR_PASSWORD_RESET', actorId: null, targetUserId: 'tech' }]);
});

test('recovery refusals: students, short passwords, unknown accounts', async () => {
  const db = fakeDb([user('tech'), user('aluno', { role: 'STUDENT' })]);
  await assert.rejects(recoverAdminPassword(db, fakeAuth(db), { email: 'aluno@example.invalid', password: 'Temporaria-1234', verify }), /TARGET_MUST_BE_ADMIN/);
  await assert.rejects(recoverAdminPassword(db, fakeAuth(db), { email: 'tech@example.invalid', password: 'curta', verify }), /PASSWORD_LENGTH_INVALID/);
  await assert.rejects(recoverAdminPassword(db, fakeAuth(db), { email: 'x@example.invalid', password: 'Temporaria-1234', verify }), /TARGET_ACCOUNT_NOT_FOUND/);
  assert.equal(db.state.audit.length, 0);
  assert.equal(db.state.accounts.find(row => row.userId === 'tech').password, 'scrypt$tech');
});

test('main: fixed modes only, interactive terminal required, no arguments carry secrets', async () => {
  for (const argv of [['node', 's'], ['node', 's', 'promote'], ['node', 's', 'designate', '--remote'], ['node', 's', 'designate', '--local', 'x'], ['node', 's', 'designate', 'tech@example.invalid']]) {
    await assert.rejects(main({ argv, interactive: () => true }), /USE_DESIGNATE_OR_RECOVER_PASSWORD/);
  }
  await assert.rejects(main({ argv: ['node', 's', 'designate'], interactive: () => false }), /INTERACTIVE_TERMINAL_REQUIRED/);
});
