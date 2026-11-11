// Real Next.js HTTP checks. Never load .env or connect to a pre-existing server.
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const net = require('node:net');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');
const { prepareLocalRuntime, loadAuthFactory, createAdmin, removeAdmin } = require('./local-auth-admin.cjs');
const baseURL = 'http://127.0.0.1:3000';

async function assertPortFree() {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 3000 });
    socket.once('connect', () => { socket.destroy(); reject(new Error('PORT_3000_OCCUPIED_STOP_DEV_FIRST')); });
    socket.once('error', error => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(new Error('LOCAL_PORT_CHECK_FAILED'));
    });
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('LOCAL_PORT_CHECK_TIMEOUT')); });
  });
}

async function main() {
  const url = loadTarget(process.cwd());
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  let child, fixture, exited = false, startupError, ready = false;
  let before;
  const accountState = () => db.user.findMany({ orderBy: { id: 'asc' }, select: {
    id: true, email: true, role: true, disabledAt: true,
    accounts: { orderBy: { id: 'asc' }, select: { id: true, providerId: true, password: true } },
  } });
  try {
    await verifyServer(db);
    await assertPortFree();
    before = await accountState();
    const { directory, env } = await prepareLocalRuntime(url);
    child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', directory,
      '--webpack', '--hostname', '127.0.0.1', '--port', '3000'], {
      cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let startupOutput = '';
    const inspect = chunk => {
      startupOutput = (startupOutput + chunk.toString()).slice(-8000);
      if (/EACCES/.test(startupOutput)) startupError = 'NEXT_LISTEN_EACCES';
      if (/EADDRINUSE/.test(startupOutput)) startupError = 'PORT_3000_OCCUPIED_STOP_DEV_FIRST';
      if (/Ready in/.test(startupOutput)) ready = true;
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', () => { startupError = 'NEXT_SPAWN_FAILED'; exited = true; });
    child.once('exit', () => { exited = true; });
    const deadline = Date.now() + 90000;
    while (!ready) {
      if (startupError || exited) throw new Error(startupError || 'NEXT_EXITED_BEFORE_READY');
      if (Date.now() > deadline) throw new Error('NEXT_START_TIMEOUT');
      await delay(250);
    }
    const request = (path, options = {}) => fetch(baseURL + path, {
      ...options, redirect: 'manual', signal: AbortSignal.timeout(90000),
    });
    const post = (path, body, cookie, origin = baseURL) => request(path, {
      method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await request('/login')).status, 200);
    assert.equal((await request('/api/account/session')).status, 401);
    console.log('PASS real Next: login page 200; anonymous account session 401 (not 503)');
    const password = randomBytes(32).toString('base64url');
    const email = `http-${randomBytes(12).toString('hex')}@example.invalid`;
    fixture = await createAdmin(db, await loadAuthFactory(), email, password, true);
    const failed = await post('/api/auth/sign-in/email', { email, password: randomBytes(32).toString('hex') });
    assert.equal(failed.status, 401);
    const rejectedOrigin = await post('/api/auth/sign-in/email', { email, password }, undefined, 'https://untrusted.invalid');
    assert.equal(rejectedOrigin.status, 403);
    console.log('PASS real Next: wrong password 401; untrusted origin 403');
    const login = await post('/api/auth/sign-in/email', { email, password });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some(value => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
    const cookie = cookies.map(value => value.split(';')[0]).join('; ');
    assert.ok(cookie);
    const session = await request('/api/account/session', { headers: { cookie } });
    assert.equal(session.status, 200);
    const account = await session.json();
    assert.equal(account.user.id, fixture.id);
    assert.equal(account.destination, '/admin/dashboard');
    assert.equal((await request('/admin/dashboard', { headers: { cookie } })).status, 200);
    assert.equal((await request('/api/account/session', { headers: { cookie } })).status, 200);
    console.log('PASS real Next: login 200; session restored 200; admin dashboard 200');
    assert.equal((await post('/api/auth/sign-out', {}, cookie)).status, 200);
    assert.equal((await request('/api/account/session', { headers: { cookie } })).status, 401);
    assert.ok([303, 307, 308].includes((await request('/admin/dashboard', { headers: { cookie } })).status));
    console.log('PASS real Next: logout revokes session and protects dashboard');
  } finally {
    if (child && !exited && child.pid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else child.kill('SIGTERM');
    }
    try {
      if (fixture) await removeAdmin(db, fixture);
      if (before) {
        assert.deepEqual(await accountState(), before);
        console.log('PASS existing accounts and password hashes preserved; synthetic fixture removed');
      }
    } finally { await db.$disconnect(); }
  }
}

main().catch(error => {
  // Never print raw errors, request bodies, cookies or database diagnostics.
  console.error(/^[A-Z][A-Z0-9_]+$/.test(error.message || '') ? error.message : 'LOCAL_HTTP_VERIFICATION_FAILED');
  process.exitCode = 1;
});
