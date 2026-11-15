// No database: proves public sign-up is refused before any model access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { loadAuthConfiguration } = require('../scripts/local-auth-admin.cjs');

// Any model read/write fails loudly; transactions just pass through.
function unreachableDb() {
  const reached = [];
  const model = name => new Proxy({}, { get: (_, op) => async () => { reached.push(`${name}.${String(op)}`); throw new Error('DB_REACHED'); } });
  const db = new Proxy({}, {
    get: (_, key) => {
      if (key === '$transaction') return async fn => fn(db);
      if (typeof key !== 'string' || key === 'then') return undefined;
      return model(key);
    },
  });
  return { db, reached };
}

async function setup(overrides = {}) {
  const { createServerAuth, readAuthEnvironment } = await loadAuthConfiguration();
  const environment = readAuthEnvironment({ BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    BETTER_AUTH_URL: 'https://clube.example.invalid', NODE_ENV: 'production' });
  const fake = unreachableDb();
  return { ...fake, environment, auth: createServerAuth(fake.db, { ...environment, ...overrides }) };
}

const body = { name: 'Synthetic', email: 'closed@example.invalid', password: 'synthetic-password-123' };

test('readAuthEnvironment never enables sign-up', async () => {
  const { environment, auth } = await setup();
  assert.equal(Object.hasOwn(environment, 'allowSignUp'), false);
  assert.equal(auth.options.emailAndPassword.enabled, true);
  assert.equal(auth.options.emailAndPassword.disableSignUp, true);
});

test('server API refuses sign-up before touching the database', async () => {
  const { auth, reached } = await setup();
  await assert.rejects(auth.api.signUpEmail({ body }), error =>
    error.statusCode === 400 && error.body?.code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED');
  assert.deepEqual(reached, []);
});

test('public HTTP endpoint answers 400 and never reaches the database', async () => {
  const { auth, reached } = await setup();
  const response = await auth.handler(new Request('https://clube.example.invalid/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://clube.example.invalid' },
    body: JSON.stringify(body),
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'EMAIL_PASSWORD_SIGN_UP_DISABLED');
  assert.deepEqual(reached, []);
});

test('only an explicit server-side opt-in passes the gate (provisioning path)', async () => {
  const { auth, reached } = await setup({ allowSignUp: true });
  assert.equal(auth.options.emailAndPassword.disableSignUp, false);
  await assert.rejects(auth.api.signUpEmail({ body }), /DB_REACHED/);
  assert.ok(reached.length > 0);
});

test('sign-in remains enabled', async () => {
  const { auth } = await setup();
  await assert.rejects(auth.api.signInEmail({ body: { email: body.email, password: body.password } }), /DB_REACHED/);
});
